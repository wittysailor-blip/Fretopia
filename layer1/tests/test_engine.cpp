// Threaded tests of the whole engine through the public C API with the
// simulated device: capture thread, control thread and consumer thread run as
// in production. Covers T01, T05, T06, T07, T11/T30, T12, T13, T14, T15, T26
// (simulated clock), T29 (simulated drift), gate 1 (no allocation on the
// capture thread) and capture-to-frame latency of the software path.
#include <atomic>
#include <chrono>
#include <cinttypes>
#include <random>
#include <string>
#include <thread>
#include <vector>

#include "check.h"

extern "C" {
L1_API int64_t l1_test_sim_stream_start_ns(l1_engine* e);
L1_API double l1_test_sim_ns_per_frame(l1_engine* e);
}

static void msleep(int ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

static long rss_kb() {
#if defined(__linux__)
    long pages = 0, rss = 0;
    if (FILE* f = std::fopen("/proc/self/statm", "r")) { if (std::fscanf(f, "%ld %ld", &pages, &rss) != 2) rss = 0; std::fclose(f); }
    return rss * 4;
#else
    return 0;
#endif
}

struct Run {
    l1_config cfg{};
    l1_sim_config sim{};
    l1_engine* e = nullptr;
    std::vector<float> buf, raw;
    t::Verifier v;
    std::vector<l1_event> events;
    std::vector<l1_frame_info> frames;
    bool keep_frames = false;

    Run() {
        l1_default_config(&cfg);
        cfg.backend = L1_BACKEND_SIMULATED;
        cfg.request_raw_mode = 0;
        l1_default_sim_config(&sim);
    }
    int32_t create() {
        int32_t r = l1_create(&cfg, &e);
        if (r == L1_OK) r = l1_set_sim_config(e, &sim);
        buf.resize((size_t)cfg.frame_size * 8);
        raw.resize((size_t)cfg.frame_size * 8);
        return r;
    }
    void truth() {   // timestamps are checked against the simulated device clock
        v.ns_per_frame = l1_test_sim_ns_per_frame(e);
        v.truth_start_ns = l1_test_sim_stream_start_ns(e);
    }
    int32_t read(int32_t timeout_ms) {
        l1_frame_info fi;
        int32_t r = l1_read_frame(e, &fi, buf.data(), (uint32_t)buf.size(), raw.data(), (uint32_t)raw.size(), timeout_ms);
        if (r == L1_OK) {
            if (fi.stream_epoch != v.epoch && v.ns_per_frame > 0) truth();
            v.on_frame(fi, buf.data());
            if (keep_frames) frames.push_back(fi);
        }
        return r;
    }
    void drain_events() { l1_event ev; while (l1_poll_event(e, &ev) == L1_OK) events.push_back(ev); }
    bool has_event(uint32_t kind) const { for (auto& x : events) if (x.kind == kind) return true; return false; }
    l1_stats stats() { l1_stats s; l1_get_stats(e, &s); return s; }
    ~Run() { if (e) l1_destroy(e); }
};

// ------------------------------------------------------------------ T11/T30
static void adversarial() {
    t::begin("T30", "Adversarial buffering: random packet sizes, all device faults, consumer stalls");
    Run r;
    r.cfg.transport_capacity_frames = 4096;
    r.cfg.frame_size = 256;
    r.sim.channels = 2;
    r.sim.min_packet_frames = 1;
    r.sim.max_packet_frames = 2000;
    r.sim.realtime = 0;                 // producer runs flat out
    r.sim.total_frames = 30000000;
    r.sim.p_device_glitch = 0.002;
    r.sim.p_position_jump = 0.003;
    r.sim.p_duplicate = 0.003;
    r.sim.p_silent = 0.005;
    r.sim.p_timestamp_error = 0.01;
    r.sim.timestamp_jitter_us = 100;
    r.sim.seed = 99;
    CHECK(r.create() == L1_OK);
    reset_rt_allocations();
    CHECK(l1_start(r.e) == L1_OK);
    std::mt19937 rng(5);
    int idle_reads = 0;
    for (;;) {
        int32_t rc = r.read(50);
        if (rc == L1_TIMEOUT) {
            r.drain_events();
            if (r.has_event(L1_EVENT_STOPPED) && ++idle_reads > 3) break;
            continue;
        }
        CHECK(rc == L1_OK);
        if ((rng() % 5000) == 0) msleep(1 + rng() % 30);   // consumer stalls -> overflow
    }
    l1_stats s = r.stats();
    r.v.print();
    std::printf("    received=%llu delivered=%llu overflow=%llu devdrop=%llu dup=%llu glitches=%llu silent=%llu tserr=%llu hw=%u rt_allocs=%llu\n",
                (unsigned long long)s.frames_received, (unsigned long long)s.frames_delivered,
                (unsigned long long)s.frames_dropped_overflow, (unsigned long long)s.frames_dropped_device,
                (unsigned long long)s.frames_duplicate_discarded, (unsigned long long)s.device_glitches,
                (unsigned long long)s.silent_packets, (unsigned long long)s.timestamp_errors, s.queue_high_water_frames,
                (unsigned long long)rt_allocations());
    CHECK(r.v.clean());
    CHECK(r.v.data_mismatch == 0);
    CHECK(s.frames_received == 30000000);
    // Accounting: every received frame is delivered, discarded as a duplicate, or dropped and reported.
    CHECK(s.frames_delivered + s.frames_duplicate_discarded + s.frames_dropped_overflow == s.frames_received);
    CHECK(r.v.frames_total == s.frames_delivered);
    CHECK(r.v.dropped_sum == s.frames_dropped_overflow + s.frames_dropped_device);
    CHECK(s.frames_dropped_overflow > 0 && s.frames_dropped_device > 0 && s.frames_duplicate_discarded > 0);
    CHECK(s.queue_high_water_frames <= 4096);
    CHECK(rt_allocations() == 0);
    t::end("T30", "Adversarial buffering",
           "30M frames x2ch, packets 1-2000: %llu delivered bit-exact; %llu overflow + %llu device-lost frames all reported (gap sum matches); %llu duplicates removed; %llu glitches flagged; 0 index/time/order errors; 0 allocations on capture thread",
           (unsigned long long)s.frames_delivered, (unsigned long long)s.frames_dropped_overflow,
           (unsigned long long)s.frames_dropped_device, (unsigned long long)s.frames_duplicate_discarded,
           (unsigned long long)r.v.unknown_gaps);
}

// --------------------------------------------------------------------- T12
static void consumer_stall() {
    t::begin("T12", "Producer outruns consumer: Layer 2 stalled for 300 ms");
    Run r;
    r.cfg.transport_capacity_frames = 8192;
    r.sim.total_frames = 48000 * 3;
    CHECK(r.create() == L1_OK);
    CHECK(l1_start(r.e) == L1_OK);
    r.truth();
    auto t0 = std::chrono::steady_clock::now();
    bool stalled = false;
    for (;;) {
        if (!stalled && std::chrono::steady_clock::now() - t0 > std::chrono::milliseconds(1000)) { msleep(300); stalled = true; }
        int32_t rc = r.read(100);
        if (rc == L1_TIMEOUT) { r.drain_events(); if (r.has_event(L1_EVENT_STOPPED)) break; }
    }
    l1_stats s = r.stats();
    r.v.print();
    CHECK(r.v.clean());
    const double expect = 0.300 * 48000 - 8192;
    CHECK(s.frames_dropped_overflow > expect - 2000 && s.frames_dropped_overflow < expect + 2000);
    CHECK(r.v.dropped_sum == s.frames_dropped_overflow);
    CHECK(r.v.frames_total + s.frames_dropped_overflow == s.frames_received);
    CHECK(s.callback_max_us < 5000);    // capture thread never waited for the consumer
    t::end("T12", "Consumer stall", "300 ms stall, 8192-frame transport (170.7 ms): %llu frames dropped (expected ~%.0f), one gap record, capture callback max %.0f us, stream continued",
           (unsigned long long)s.frames_dropped_overflow, expect, s.callback_max_us);
}

// --------------------------------------------------------------- T13 / D04
// Unity-style consumer: wakes at a frame rate and drains whatever is queued.
// The stall is measured, not assumed: on Windows a sleep overshoots by up to a
// timer tick, exactly as a real game frame does.
static void unity_stutter() {
    t::begin("T13", "Render stutter: consumer drains once per game frame; capacity sweep (D04)");
    struct Case { uint32_t cap; int stall_ms; uint64_t lost; double max_gap_ms; } cases[] = {
        {2048, 16, 0, 0}, {2048, 33, 0, 0}, {2048, 66, 0, 0}, {4096, 33, 0, 0}, {4096, 66, 0, 0}, {4096, 100, 0, 0},
        {8192, 66, 0, 0}, {8192, 100, 0, 0}, {8192, 150, 0, 0}};
    std::string table;
    bool expected_ok = true;
    for (auto& c : cases) {
        Run r;
        r.cfg.transport_capacity_frames = c.cap;
        r.sim.total_frames = 48000 * 2;
        r.sim.seed = c.cap + c.stall_ms;
        CHECK(r.create() == L1_OK);
        CHECK(l1_start(r.e) == L1_OK);
        int64_t last = l1_now_ns();
        for (;;) {
            msleep(c.stall_ms);                   // a slow render frame
            const int64_t now = l1_now_ns();
            c.max_gap_ms = std::max(c.max_gap_ms, (now - last) / 1e6);
            int got = 0;
            while (r.read(0) == L1_OK) ++got;     // drain on the "main thread"
            last = l1_now_ns();
            r.drain_events();
            if (r.has_event(L1_EVENT_STOPPED) && got == 0) break;
        }
        l1_stats s = r.stats();
        c.lost = s.frames_dropped_overflow;
        CHECK(r.v.clean());
        CHECK(r.v.dropped_sum == s.frames_dropped_overflow);   // any loss is reported
        const double cap_ms = c.cap * 1000.0 / 48000.0;
        // If the longest measured gap between drains plus one packet (10 ms) fits
        // in the transport, nothing may be lost.
        if (c.max_gap_ms + 10.0 < cap_ms && c.lost != 0) expected_ok = false;
        char row[200];
        std::snprintf(row, sizeof row, "cap %u (%.1f ms) frame %d ms (longest measured %.1f ms): lost %llu; ",
                      c.cap, cap_ms, c.stall_ms, c.max_gap_ms, (unsigned long long)c.lost);
        table += row;
        std::printf("    %s\n", row);
    }
    CHECK(expected_ok);
    t::end("T13", "Render stutter", "%s", table.c_str());
}

// --------------------------------------------------------------------- T15
static void callback_overruns() {
    t::begin("T15", "Missed callback deadlines");
    Run r;
    r.sim.total_frames = 48000 * 3;
    r.sim.p_callback_delay = 0.05;
    r.sim.callback_delay_us = 15000;   // 15 ms in a 10 ms period
    CHECK(r.create() == L1_OK);
    CHECK(l1_start(r.e) == L1_OK);
    for (;;) {
        int32_t rc = r.read(100);
        if (rc == L1_TIMEOUT) { r.drain_events(); if (r.has_event(L1_EVENT_STOPPED)) break; }
    }
    l1_stats s = r.stats();
    r.v.print();
    CHECK(s.callback_overruns > 0);
    CHECK(r.v.clean());
    CHECK(s.frames_delivered == s.frames_received);
    CHECK(s.callback_max_us >= 15000);
    t::end("T15", "Callback overruns", "%llu callbacks over the 10 ms period flagged (max %.1f ms); stream recovered with no sample loss",
           (unsigned long long)s.callback_overruns, s.callback_max_us / 1000.0);
}

// ---------------------------------------------------------------- T29 / T26
static void clock_and_timestamps() {
    t::begin("T29", "Device clock drift and timestamp jitter estimate (simulated clock)");
    Run r;
    r.sim.total_frames = 48000ull * 60;   // one minute of audio
    r.sim.speed = 4.0;
    r.sim.clock_drift_ppm = 150;
    r.sim.timestamp_jitter_us = 300;
    CHECK(r.create() == L1_OK);
    CHECK(l1_start(r.e) == L1_OK);
    r.truth();
    r.v.time_tolerance_ns = 0;
    for (;;) {
        int32_t rc = r.read(100);
        if (rc == L1_TIMEOUT) { r.drain_events(); if (r.has_event(L1_EVENT_STOPPED)) break; }
    }
    l1_stats s = r.stats();
    // The simulator divides by speed, so the measured slope includes it.
    const double drift = (1e6 + s.clock_drift_ppm) * 4.0 - 1e6;
    std::printf("    raw drift %.1f ppm -> device drift %.1f ppm, jitter %.0f us\n", s.clock_drift_ppm, drift, s.timestamp_jitter_us);
    CHECK(std::fabs(drift - 150) < 10);
    CHECK(s.timestamp_jitter_us > 150 && s.timestamp_jitter_us < 600);
    CHECK(r.v.clean());
    t::end("T29", "Clock drift", "true drift +150 ppm, estimated %+.1f ppm; true jitter 300 us RMS, estimated %.0f us", drift, s.timestamp_jitter_us);

    t::begin("T26-sim", "Timestamp mapping error against the simulated ground truth");
    struct C { double jitter; double p_err; const char* name; } cs[] = {{0, 0, "no jitter"}, {200, 0, "200 us jitter"}, {200, 0.2, "200 us jitter, 20% bad timestamps"}};
    std::string out;
    for (auto& c : cs) {
        Run q;
        q.sim.total_frames = 48000 * 6;
        q.sim.timestamp_jitter_us = c.jitter;
        q.sim.p_timestamp_error = c.p_err;
        CHECK(q.create() == L1_OK);
        CHECK(l1_start(q.e) == L1_OK);
        q.truth();
        for (;;) {
            int32_t rc = q.read(100);
            if (rc == L1_TIMEOUT) { q.drain_events(); if (q.has_event(L1_EVENT_STOPPED)) break; }
        }
        std::vector<double> a;
        for (double x : q.v.time_err_ns) a.push_back(std::fabs(x) / 1000.0);
        char row[200];
        std::snprintf(row, sizeof row, "%s: |error| p50 %.1f us, p95 %.1f us, p99 %.1f us, max %.1f us, %llu estimated; ", c.name,
                      t::pct(a, .5), t::pct(a, .95), t::pct(a, .99), t::pct(a, 1.0), (unsigned long long)q.v.estimated);
        out += row;
        std::printf("    %s\n", row);
        if (c.jitter == 0) CHECK(t::pct(a, 1.0) < 1.0);   // pure mapping math: sub-microsecond
        else {
            // After the fit warms up (16 packets) smoothing beats the raw packet jitter;
            // the first ~160 ms carry raw packet timestamps.
            CHECK(t::pct(a, .95) < 0.5 * c.jitter);
            CHECK(t::pct(a, 1.0) < 4 * c.jitter);
        }
        CHECK(q.v.clean());
    }
    t::end("T26-sim", "Timestamp mapping", "%s(simulated clock; real-device T26 needs an external reference)", out.c_str());
}

// --------------------------------------------------------------- T06 / T07
static void device_loss() {
    t::begin("T06", "Device unplugged while recording: graceful stop, new epoch on reconnect");
    {
        Run r;
        r.keep_frames = true;
        r.sim.lose_device_at_frame = 48000;
        r.sim.total_frames = 48000 * 2;
        r.cfg.auto_reconnect = 1;
        CHECK(r.create() == L1_OK);
        CHECK(l1_start(r.e) == L1_OK);
        for (;;) {
            int32_t rc = r.read(100);
            if (rc == L1_TIMEOUT) { r.drain_events(); if (r.has_event(L1_EVENT_STOPPED)) break; }
        }
        r.drain_events();
        bool last = false, fresh = false;
        for (auto& f : r.frames) {
            if (f.stream_epoch == 1 && (f.flags & L1_FRAME_LAST_OF_EPOCH)) last = true;
            if (f.stream_epoch == 2 && (f.flags & L1_FRAME_NEW_EPOCH))
                fresh = f.first_sample_index == 0 && (f.flags & L1_FRAME_DISCONTINUITY) && f.gap_reason == L1_GAP_STREAM_RESTART;
        }
        CHECK(r.has_event(L1_EVENT_DEVICE_LOST) && r.has_event(L1_EVENT_RECOVERED));
        CHECK(last && fresh);
        CHECK(r.v.clean());
        CHECK(r.v.epochs == 2);
    }
    {
        Run r;
        r.sim.lose_device_at_frame = 24000;
        r.cfg.auto_reconnect = 0;
        CHECK(r.create() == L1_OK);
        CHECK(l1_start(r.e) == L1_OK);
        // Read until the loss is reported, then drain what was captured before it.
        for (int i = 0; i < 400 && !r.has_event(L1_EVENT_DEVICE_LOST); ++i) { r.read(10); r.drain_events(); }
        CHECK(r.has_event(L1_EVENT_DEVICE_LOST));
        while (r.read(100) == L1_OK) {}
        uint64_t before = r.v.frames_total;
        msleep(300);
        int32_t rc = r.read(100);           // no phantom audio after the loss
        r.drain_events();
        CHECK(rc == L1_TIMEOUT);
        CHECK(r.v.frames_total == before && before <= 24000);
        CHECK(r.stats().state == 3);        // failed, waiting for the app
        CHECK(r.has_event(L1_EVENT_DEVICE_LOST));
        CHECK(l1_stop(r.e) == L1_OK);
        CHECK(l1_start(r.e) == L1_OK);      // app reselects the device
        CHECK(r.read(500) == L1_OK);
        CHECK(r.v.epochs == 2);
    }
    t::end("T06", "Device hot-plug", "loss posts DEVICE_LOST, last frame flagged LAST_OF_EPOCH, reconnect starts epoch 2 at index 0 with DISCONTINUITY; without auto-reconnect: no phantom frames, state FAILED, restart works");

    t::begin("T07", "Device sample-rate change 48k -> 44.1k");
    Run r;
    r.keep_frames = true;
    r.sim.change_rate_at_frame = 48000;
    r.sim.rate_after = 44100;
    r.sim.total_frames = 48000 + 44100;
    CHECK(r.create() == L1_OK);
    CHECK(l1_start(r.e) == L1_OK);
    for (;;) {
        int32_t rc = r.read(100);
        if (rc == L1_TIMEOUT) { r.drain_events(); if (r.has_event(L1_EVENT_STOPPED)) break; }
    }
    bool ok = false;
    for (auto& f : r.frames) if (f.stream_epoch == 2 && (f.flags & L1_FRAME_NEW_EPOCH)) ok = f.sample_rate_hz == 44100 && f.first_sample_index == 0;
    bool rates = true;
    for (auto& f : r.frames) if ((f.stream_epoch == 1 && f.sample_rate_hz != 48000) || (f.stream_epoch == 2 && f.sample_rate_hz != 44100)) rates = false;
    CHECK(ok && rates);
    CHECK(r.has_event(L1_EVENT_FORMAT_CHANGED));
    CHECK(r.v.clean());
    t::end("T07", "Rate change", "FORMAT_CHANGED event, reopened as epoch 2 at 44100 Hz, every frame labelled with its own rate");
}

// --------------------------------------------------------------- T01 / T05
static void permissions_and_negotiation() {
    t::begin("T01-sim", "Microphone permission denied, then granted");
    {
        Run r;
        r.sim.open_error = L1_ERR_PERMISSION;
        r.sim.open_error_count = 1;
        CHECK(r.create() == L1_OK);
        CHECK(l1_start(r.e) == L1_ERR_PERMISSION);
        r.drain_events();
        CHECK(r.has_event(L1_EVENT_ERROR));
        CHECK(r.read(100) == L1_TIMEOUT);    // no stale buffers
        CHECK(r.stats().last_error == L1_ERR_PERMISSION);
        CHECK(l1_start(r.e) == L1_OK);       // user granted access, app retries
        CHECK(r.read(500) == L1_OK);
        CHECK(r.v.epochs == 1);
    }
    t::end("T01-sim", "Permissions", "denied open returns L1_ERR_PERMISSION + ERROR event, no frames; retry after grant starts cleanly");

    t::begin("T05-sim", "Period negotiation and unsupported requests");
    {
        Run r;
        r.cfg.requested_period_frames = 100;   // below the device minimum
        CHECK(r.create() == L1_OK);
        CHECK(l1_start(r.e) == L1_OK);
        r.drain_events();
        CHECK(r.stats().actual_period_frames == 128);
        CHECK(r.has_event(L1_EVENT_PERIOD_ADJUSTED));
    }
    {
        Run r;
        r.cfg.requested_period_frames = 500;
        CHECK(r.create() == L1_OK);
        CHECK(l1_start(r.e) == L1_OK);
        CHECK(r.stats().actual_period_frames == 512);
    }
    {
        Run r;
        r.cfg.requested_sample_rate_hz = 44100;   // device only does 48k
        CHECK(r.create() == L1_OK);
        CHECK(l1_start(r.e) == L1_ERR_FORMAT);
        CHECK(r.stats().state == 0);
    }
    t::end("T05-sim", "Negotiation", "100 requested -> 128 reported + PERIOD_ADJUSTED; 500 -> 512; unsupported rate -> L1_ERR_FORMAT, no half-open stream");
}

// ----------------------------------------------------------- T14 long run
static void long_run() {
    t::begin("T14-sim", "Long run: 60 minutes of audio (accelerated 40x) with CPU load");
    Run r;
    r.sim.total_frames = 48000ull * 3600;
    r.sim.speed = 40;
    r.sim.min_packet_frames = 441;
    r.sim.max_packet_frames = 529;
    r.sim.timestamp_jitter_us = 50;
    // Same wall-clock buffering as 8192 frames at 1x (170 ms): capacity scales with speed.
    r.cfg.transport_capacity_frames = 8192 * 40;
    r.v.keep_time_errors = false;
    r.v.time_check_from_index = 48000;   // fit warm-up: nominal spacing is 40x off when accelerated
    CHECK(r.create() == L1_OK);
    std::atomic<bool> load{true};
    std::thread burner([&] { volatile double x = 0; while (load) for (int i = 0; i < 100000; ++i) x += i * 0.5; });
    const long rss0 = rss_kb();
    reset_rt_allocations();
    CHECK(l1_start(r.e) == L1_OK);
    r.truth();
    long rss_mid = 0;
    uint32_t max_q = 0;
    for (;;) {
        int32_t rc = r.read(200);
        if (rc == L1_TIMEOUT) { r.drain_events(); if (r.has_event(L1_EVENT_STOPPED)) break; }
        if ((r.v.frames & 0x3FFF) == 0) {
            l1_stats s = r.stats();
            max_q = std::max(max_q, s.queue_frames_now);
            if (r.v.frames_total > 48000ull * 600 && !rss_mid) rss_mid = rss_kb();
        }
    }
    load = false;
    burner.join();
    const long rss1 = rss_kb();
    l1_stats s = r.stats();
    r.v.print();
    CHECK(r.v.clean());
    CHECK(s.frames_delivered == 48000ull * 3600);
    CHECK(s.frames_dropped_overflow == 0);
    CHECK(rt_allocations() == 0);
    CHECK(rss_mid == 0 || rss1 - rss_mid < 2048);
    CHECK(r.v.max_time_err_ns < 2e6);
    t::end("T14-sim", "Long run", "%llu frames delivered, %llu lost, queue high-water %u of %u frames, RSS %ld kB at start, %ld kB after 10 min, %ld kB at 60 min, max timestamp error after the first second %.1f us, drift estimate %+.2f ppm, 0 capture-thread allocations",
           (unsigned long long)s.frames_delivered, (unsigned long long)s.frames_dropped_overflow, s.queue_high_water_frames,
           s.transport_capacity_frames, rss0, rss_mid, rss1, r.v.max_time_err_ns / 1000, (1e6 + s.clock_drift_ppm) * 40 - 1e6);
}

// -------------------------------------------------------- latency (software path)
static void latency() {
    t::begin("LAT-sim", "Capture-to-frame availability, software path (real time, simulated device)");
    Run r;
    r.sim.total_frames = 48000 * 10;
    CHECK(r.create() == L1_OK);
    CHECK(l1_start(r.e) == L1_OK);
    for (;;) {
        int32_t rc = r.read(100);
        if (rc == L1_TIMEOUT) { r.drain_events(); if (r.has_event(L1_EVENT_STOPPED)) break; }
    }
    l1_stats s = r.stats();
    // 256-frame frames from 480-frame packets: a frame waits for the packet holding its last sample.
    CHECK(s.capture_to_ready_p99_ms < 25);
    t::end("LAT-sim", "Capture-to-frame", "last sample captured -> frame returned: p50 %.2f ms, p95 %.2f ms, p99 %.2f ms, max %.2f ms (10 ms packets; excludes OS/driver delay); callback p50 %.0f us p99 %.0f us",
           s.capture_to_ready_p50_ms, s.capture_to_ready_p95_ms, s.capture_to_ready_p99_ms, s.capture_to_ready_max_ms,
           s.callback_p50_us, s.callback_p99_us);
}

// ------------------------------------------------------ lifecycle robustness
static void lifecycle() {
    t::begin("LIFE", "Start/stop cycles, stop while reading, destroy while running");
    Run r;
    CHECK(r.create() == L1_OK);
    for (int i = 0; i < 40; ++i) {
        CHECK(l1_start(r.e) == L1_OK);
        CHECK(l1_start(r.e) == L1_ERR_STATE);
        for (int k = 0; k < 3; ++k) r.read(50);
        CHECK(l1_stop(r.e) == L1_OK);
        while (r.read(0) == L1_OK) {}
    }
    CHECK(r.v.epochs == 40);
    CHECK(r.v.clean());
    {   // consumer blocked in read when stop arrives
        Run q;
        CHECK(q.create() == L1_OK);
        CHECK(l1_start(q.e) == L1_OK);
        std::atomic<int> rc{99};
        std::thread reader([&] { for (;;) { int x = q.read(2000); if (x != L1_OK) { rc = x; break; } } });
        msleep(200);
        CHECK(l1_stop(q.e) == L1_OK);
        reader.join();
        CHECK(rc == L1_TIMEOUT);
    }
    {   // destroy while running
        Run q;
        CHECK(q.create() == L1_OK);
        CHECK(l1_start(q.e) == L1_OK);
        msleep(50);
    }
    l1_engine* e = nullptr;
    l1_config bad;
    l1_default_config(&bad);
    bad.struct_size = 4;
    CHECK(l1_create(&bad, &e) == L1_ERR_INVALID_ARG);
    t::end("LIFE", "Lifecycle", "40 start/stop cycles = 40 epochs, double start rejected, blocked reader released by stop, destroy while running, bad struct_size rejected");
}

int main(int argc, char** argv) {
    const std::string mode = argc > 1 ? argv[1] : "";
    const bool quick = mode == "quick";
    if (mode == "long") { long_run(); return t::finish("test_engine_long"); }
    adversarial();
    consumer_stall();
    unity_stutter();
    callback_overruns();
    clock_and_timestamps();
    device_loss();
    permissions_and_negotiation();
    latency();
    lifecycle();
    if (!quick) long_run();
    return t::finish("test_engine");
}
