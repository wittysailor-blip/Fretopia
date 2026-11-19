// Engine: C API, control thread (open/close/recovery) and wiring.
//
// Threads
//   capture thread  : owned by the backend; real-time; calls CaptureSink.
//   control thread  : owned by the engine; opens/closes streams, handles device
//                     loss, default-device and format changes, reconnects.
//                     On Windows it is the only thread that touches WASAPI
//                     objects outside the capture loop (COM MTA).
//   consumer thread : the caller of l1_read_frame (Layer 2).
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <deque>
#include <mutex>
#include <random>
#include <string>
#include <thread>

#include "assembler.h"
#include "backend.h"
#include "capture_sink.h"
#include "core.h"
#include "l1/l1.h"

using namespace l1;

namespace {
enum State { ST_STOPPED = 0, ST_RUNNING = 1, ST_RECOVERING = 2, ST_FAILED = 3 };
struct Notice { BackendEvent ev; int32_t code; int64_t detail; std::string msg; };
}

struct l1_engine final : BackendListener {
    l1_config cfg{};
    std::string device_id;
    l1_sim_config sim{};
    Transport t;
    Counters c;
    CaptureSink sink{t, c};
    Assembler asmb{t, c};
    std::unique_ptr<Backend> be;
    std::atomic<bool> producer_idle{true};
    std::atomic<int> state{ST_STOPPED};
    std::atomic<int> last_error{L1_OK};
    std::atomic<uint32_t> epoch_now{0}, rate_now{0}, dev_ch{0}, out_ch{0}, period{0}, buf_frames{0}, raw_active{0};
    uint64_t stream_id = 0;

    // control thread
    std::mutex mu;
    std::condition_variable cv;
    enum Cmd { C_NONE, C_START, C_STOP, C_QUIT } cmd = C_NONE;
    bool cmd_done = false;
    int32_t cmd_result = 0;
    std::deque<Notice> notices;
    std::thread ctl;
    bool want_running = false;       // control thread only
    uint32_t epoch_counter = 0;      // control thread only
    bool follow_default_now = false; // control thread only

    std::mutex evmu;
    std::deque<l1_event> events;

    void post(uint32_t kind, int32_t value, int64_t detail, const char* msg) {
        l1_event e{};
        e.kind = kind; e.value = value; e.detail = detail; e.time_ns = now_ns();
        std::snprintf(e.message, sizeof e.message, "%s", msg ? msg : "");
        std::lock_guard<std::mutex> g(evmu);
        if (events.size() >= 256) events.pop_front();
        events.push_back(e);
    }

    void backend_event(BackendEvent ev, int32_t code, int64_t detail, const char* message) override {
        std::lock_guard<std::mutex> g(mu);
        notices.push_back({ev, code, detail, message ? message : ""});
        cv.notify_all();
    }

    void stop_backend() {
        if (be) { be->stop(); be->close(); }
        sink.end_epoch();   // capture thread has joined: report any trailing loss
        producer_idle.store(true, std::memory_order_release);
        t.signal.wake();
    }

    int32_t open_and_start(bool recovering) {
        OpenRequest req;
        req.device_id = device_id;
        req.sample_rate = cfg.requested_sample_rate_hz;
        req.period_frames = cfg.requested_period_frames;
        req.raw = cfg.request_raw_mode != 0;
        OpenResult res;
        int32_t r = be->open(req, res, this);
        if (r != L1_OK) { be->close(); last_error.store(r); return r; }
        if (res.channels == 0 || res.sample_rate == 0) { be->close(); last_error.store(L1_ERR_FORMAT); return L1_ERR_FORMAT; }
        EpochParams p;
        p.epoch = epoch_counter + 1;
        p.sample_rate = res.sample_rate;
        p.device_channels = res.channels;
        p.channel_mode = cfg.channel_mode;
        p.select_channel = cfg.select_channel;
        p.period_frames = res.period_frames ? res.period_frames : res.sample_rate / 100;
        p.max_packet_frames = std::max(res.max_packet_frames, p.period_frames * 4);
        p.ts_source = res.ts_source;
        sink.begin_epoch(p);
        epoch_counter = sink.epoch();
        epoch_now.store(epoch_counter);
        rate_now.store(res.sample_rate);
        dev_ch.store(res.channels);
        out_ch.store(sink.delivered_channels());
        period.store(res.period_frames);
        buf_frames.store(res.buffer_frames);
        raw_active.store(res.raw_active ? 1 : 0);
        producer_idle.store(false, std::memory_order_release);
        r = be->start(&sink);
        if (r != L1_OK) { stop_backend(); last_error.store(r); return r; }
        last_error.store(L1_OK);
        char m[160];
        std::snprintf(m, sizeof m, "%s: %s, period %u frames", res.device_name.c_str(), res.format_note.c_str(), res.period_frames);
        post(recovering ? L1_EVENT_RECOVERED : L1_EVENT_STARTED, (int32_t)epoch_counter, 0, m);
        if (cfg.request_raw_mode && !res.raw_active) post(L1_EVENT_RAW_UNAVAILABLE, 0, 0, "RAW capture not available; OS audio processing may be active");
        if (cfg.requested_period_frames && res.period_frames != cfg.requested_period_frames) {
            std::snprintf(m, sizeof m, "requested period %u frames, device uses %u", cfg.requested_period_frames, res.period_frames);
            post(L1_EVENT_PERIOD_ADJUSTED, (int32_t)res.period_frames, 0, m);
        }
        return L1_OK;
    }

    void control_loop() {
        using clock = std::chrono::steady_clock;
        clock::time_point next_retry{};
        int32_t last_retry_error = L1_OK;
        std::unique_lock<std::mutex> lk(mu);
        for (;;) {
            if (state.load() == ST_RECOVERING && notices.empty() && cmd == C_NONE)
                cv.wait_until(lk, next_retry);
            else if (cmd == C_NONE && notices.empty())
                cv.wait(lk);

            if (cmd != C_NONE) {
                Cmd k = cmd;
                lk.unlock();
                int32_t r = L1_OK;
                if (k == C_START) {
                    if (state.load() == ST_RUNNING || state.load() == ST_RECOVERING) r = L1_ERR_STATE;
                    else {
                        r = open_and_start(false);
                        if (r == L1_OK) { want_running = true; state.store(ST_RUNNING); }
                        else { state.store(ST_STOPPED); post(L1_EVENT_ERROR, r, 0, "could not start capture"); }
                    }
                } else {   // stop or quit
                    if (want_running || state.load() != ST_STOPPED) {
                        stop_backend();
                        want_running = false;
                        state.store(ST_STOPPED);
                        post(L1_EVENT_STOPPED, 0, 0, "capture stopped");
                    }
                }
                lk.lock();
                cmd_result = r;
                cmd_done = true;
                cmd = C_NONE;
                cv.notify_all();
                if (k == C_QUIT) return;
                continue;
            }

            if (!notices.empty()) {
                Notice n = notices.front();
                notices.pop_front();
                lk.unlock();
                const int st = state.load();
                if (want_running && st == ST_RUNNING) {
                    stop_backend();
                    switch (n.ev) {
                    case BackendEvent::StreamEnded:
                        want_running = false; state.store(ST_STOPPED);
                        post(L1_EVENT_STOPPED, 0, 0, n.msg.c_str());
                        break;
                    case BackendEvent::FormatChanged:
                        post(L1_EVENT_FORMAT_CHANGED, 0, n.detail, n.msg.c_str());
                        state.store(ST_RECOVERING); next_retry = clock::now();
                        break;
                    case BackendEvent::DefaultChanged:
                        post(L1_EVENT_DEFAULT_CHANGED, 0, n.detail, n.msg.c_str());
                        state.store(ST_RECOVERING); next_retry = clock::now();
                        break;
                    default:   // DeviceLost, Error, Stalled
                        post(n.ev == BackendEvent::DeviceLost ? L1_EVENT_DEVICE_LOST : L1_EVENT_ERROR,
                             n.code ? n.code : L1_ERR_BACKEND, n.detail, n.msg.c_str());
                        last_error.store(n.code ? n.code : L1_ERR_BACKEND);
                        if (cfg.auto_reconnect) { state.store(ST_RECOVERING); next_retry = clock::now() + std::chrono::milliseconds(200); }
                        else { want_running = false; state.store(ST_FAILED); }
                        break;
                    }
                    last_retry_error = L1_OK;
                }
                lk.lock();
                continue;
            }

            if (state.load() == ST_RECOVERING && clock::now() >= next_retry) {
                lk.unlock();
                int32_t r = open_and_start(true);
                lk.lock();
                if (r == L1_OK) state.store(ST_RUNNING);
                else {
                    if (r != last_retry_error) post(L1_EVENT_ERROR, r, 0, "reconnect attempt failed; retrying");
                    last_retry_error = r;
                    next_retry = clock::now() + std::chrono::milliseconds(500);
                }
            }
        }
    }

    int32_t command(Cmd k) {
        std::unique_lock<std::mutex> lk(mu);
        cv.wait(lk, [&] { return cmd == C_NONE; });
        cmd = k;
        cmd_done = false;
        cv.notify_all();
        cv.wait(lk, [&] { return cmd_done; });
        return cmd_result;
    }
};

extern "C" {

L1_API uint32_t l1_api_version(void) { return L1_API_VERSION; }
L1_API int64_t l1_now_ns(void) { return now_ns(); }

L1_API void l1_default_config(l1_config* c) {
    if (!c) return;
    std::memset(c, 0, sizeof *c);
    c->api_version = L1_API_VERSION;
    c->struct_size = sizeof(l1_config);
    c->backend = L1_BACKEND_DEFAULT;
    c->follow_default_device = 1;
    c->auto_reconnect = 1;
    c->request_raw_mode = 1;
    c->channel_mode = L1_CHANNELS_ALL;
    c->transport_capacity_frames = 8192;
    c->frame_size = 256;
    c->dc_block_hz = 5.0f;
    c->hum_notch_harmonics = 1;
    c->clip_threshold = 0.999f;
}

L1_API void l1_default_sim_config(l1_sim_config* s) {
    if (!s) return;
    std::memset(s, 0, sizeof *s);
    s->sample_rate_hz = 48000;
    s->channels = 1;
    s->min_packet_frames = 480;
    s->max_packet_frames = 480;
    s->realtime = 1;
    s->speed = 1.0;
    s->sine_hz = 440.0f;
    s->sine_amplitude = 0.25f;
    s->seed = 1;
    s->lose_device_at_frame = -1;
    s->change_rate_at_frame = -1;
    s->rate_after = 44100;
}

L1_API const char* l1_result_string(int32_t r) {
    switch (r) {
    case L1_OK: return "ok";
    case L1_TIMEOUT: return "timeout";
    case L1_ERR_INVALID_ARG: return "invalid argument";
    case L1_ERR_NO_DEVICE: return "no capture device";
    case L1_ERR_PERMISSION: return "microphone access denied by the operating system";
    case L1_ERR_FORMAT: return "unsupported audio format";
    case L1_ERR_DEVICE_LOST: return "capture device lost";
    case L1_ERR_BACKEND: return "audio backend error";
    case L1_ERR_STATE: return "invalid state for this call";
    case L1_ERR_BUFFER_TOO_SMALL: return "buffer too small";
    case L1_ERR_NOT_SUPPORTED: return "not supported on this platform";
    case L1_ERR_DEVICE_IN_USE: return "device in exclusive use by another application";
    default: return "unknown";
    }
}

L1_API int32_t l1_list_devices(l1_device_info* out, uint32_t capacity, uint32_t* count) {
    auto be = make_wasapi_backend();
    if (!be) { if (count) *count = 0; return L1_ERR_NOT_SUPPORTED; }
    std::vector<l1_device_info> v;
    int32_t r = be->list_devices(v);
    if (count) *count = (uint32_t)v.size();
    if (out) for (uint32_t i = 0; i < capacity && i < v.size(); ++i) out[i] = v[i];
    if (r == L1_OK && out && capacity < v.size()) return L1_ERR_BUFFER_TOO_SMALL;
    return r;
}

L1_API int32_t l1_create(const l1_config* cfg, l1_engine** out) {
    if (!out) return L1_ERR_INVALID_ARG;
    *out = nullptr;
    l1_config c;
    l1_default_config(&c);
    if (cfg) {
        if (cfg->api_version != L1_API_VERSION || cfg->struct_size != sizeof(l1_config)) return L1_ERR_INVALID_ARG;
        c = *cfg;
    }
    if (c.channel_mode > L1_CHANNELS_AVERAGE) return L1_ERR_INVALID_ARG;
    if (!c.transport_capacity_frames) c.transport_capacity_frames = 8192;
    if (!c.frame_size) c.frame_size = 256;
    if (c.frame_size > c.transport_capacity_frames || c.frame_size > 65536) return L1_ERR_INVALID_ARG;

    l1_engine* e = new l1_engine();
    e->cfg = c;
    if (c.device_id) e->device_id = c.device_id;
    e->cfg.device_id = nullptr;   // do not keep the caller's pointer
    if (c.backend == L1_BACKEND_SIMULATED) {
        l1_default_sim_config(&e->sim);
        e->be = make_sim_backend(e->sim);
    } else {
        e->be = make_wasapi_backend();
        if (!e->be) { delete e; return L1_ERR_NOT_SUPPORTED; }
    }
    std::random_device rd;
    e->stream_id = ((uint64_t)rd() << 32) ^ rd() ^ (uint64_t)now_ns();
    e->t.init(c.transport_capacity_frames);
    e->asmb.configure(e->cfg, e->stream_id);
    e->ctl = std::thread([e] { e->control_loop(); });
    *out = e;
    return L1_OK;
}

L1_API int32_t l1_set_sim_config(l1_engine* e, const l1_sim_config* s) {
    if (!e || !s) return L1_ERR_INVALID_ARG;
    if (e->cfg.backend != L1_BACKEND_SIMULATED) return L1_ERR_STATE;
    if (e->state.load() != ST_STOPPED) return L1_ERR_STATE;
    if (!s->sample_rate_hz || !s->channels || s->channels > 64 || !s->min_packet_frames) return L1_ERR_INVALID_ARG;
    std::lock_guard<std::mutex> g(e->mu);
    e->sim = *s;
    e->be = make_sim_backend(e->sim);
    return L1_OK;
}

L1_API int32_t l1_start(l1_engine* e) { return e ? e->command(l1_engine::C_START) : L1_ERR_INVALID_ARG; }
L1_API int32_t l1_stop(l1_engine* e) { return e ? e->command(l1_engine::C_STOP) : L1_ERR_INVALID_ARG; }

L1_API void l1_destroy(l1_engine* e) {
    if (!e) return;
    e->command(l1_engine::C_QUIT);
    if (e->ctl.joinable()) e->ctl.join();
    e->be.reset();
    delete e;
}

L1_API int32_t l1_read_frame(l1_engine* e, l1_frame_info* info, float* data, uint32_t data_cap,
                             float* raw, uint32_t raw_cap, int32_t timeout_ms) {
    if (!e || !info || !data) return L1_ERR_INVALID_ARG;
    return e->asmb.read(info, data, data_cap, raw, raw_cap, timeout_ms, e->producer_idle);
}

L1_API int32_t l1_get_stats(l1_engine* e, l1_stats* s) {
    if (!e || !s) return L1_ERR_INVALID_ARG;
    std::memset(s, 0, sizeof *s);
    s->api_version = L1_API_VERSION;
    s->struct_size = sizeof(l1_stats);
    Counters& c = e->c;
    s->state = (uint32_t)e->state.load();
    s->last_error = e->last_error.load();
    s->stream_epoch = e->epoch_now.load();
    s->sample_rate_hz = e->rate_now.load();
    s->device_channels = e->dev_ch.load();
    s->delivered_channels = e->out_ch.load();
    s->actual_period_frames = e->period.load();
    s->device_buffer_frames = e->buf_frames.load();
    s->raw_mode_active = e->raw_active.load();
    s->transport_capacity_frames = e->t.capacity_frames;
    s->packets_received = c.packets_received.load();
    s->frames_received = c.frames_received.load();
    s->frames_delivered = c.frames_delivered.load();
    s->frames_dropped_overflow = c.frames_dropped_overflow.load();
    s->frames_dropped_device = c.frames_dropped_device.load();
    s->frames_duplicate_discarded = c.frames_duplicate_discarded.load();
    s->device_glitches = c.device_glitches.load();
    s->timestamp_errors = c.timestamp_errors.load();
    s->silent_packets = c.silent_packets.load();
    s->discontinuities = c.discontinuities.load();
    s->epochs_started = c.epochs_started.load();
    s->queue_high_water_frames = c.queue_high_water.load();
    s->queue_frames_now = e->t.queued_frames();
    s->callback_overruns = c.callback_overruns.load();
    s->frames_dropped_unreported = c.unreported_tail.load();
    s->callback_p50_us = c.callback_us.percentile(0.50);
    s->callback_p99_us = c.callback_us.percentile(0.99);
    s->callback_max_us = c.callback_us.max();
    s->capture_to_ready_p50_ms = c.capture_to_ready_ms.percentile(0.50);
    s->capture_to_ready_p95_ms = c.capture_to_ready_ms.percentile(0.95);
    s->capture_to_ready_p99_ms = c.capture_to_ready_ms.percentile(0.99);
    s->capture_to_ready_max_ms = c.capture_to_ready_ms.max();
    s->clock_drift_ppm = c.drift_ppm.load();
    s->timestamp_jitter_us = c.jitter_us.load();
    return L1_OK;
}

L1_API int32_t l1_poll_event(l1_engine* e, l1_event* out) {
    if (!e || !out) return L1_ERR_INVALID_ARG;
    std::lock_guard<std::mutex> g(e->evmu);
    if (e->events.empty()) return L1_TIMEOUT;
    *out = e->events.front();
    e->events.pop_front();
    return L1_OK;
}

// Test-only hooks (declared in tests/l1_test_hooks.h).
L1_API int64_t l1_test_sim_stream_start_ns(l1_engine* e) { return e && e->be ? e->be->sim_stream_start_ns() : 0; }
L1_API double  l1_test_sim_ns_per_frame(l1_engine* e) { return e && e->be ? e->be->sim_ns_per_frame() : 0; }

} // extern "C"
