// Deterministic simulated capture device with fault injection.
//
// Device frame k is "captured" at host time start + k * ns_per_frame, where
// ns_per_frame includes the configured clock drift and is divided by `speed`
// when paced faster than real time. Faults are drawn from a seeded RNG.
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <random>
#include <thread>

#include "backend.h"

namespace l1 {

namespace {

class SimBackend final : public Backend {
public:
    explicit SimBackend(const l1_sim_config& c) : cfg_(c) {}
    ~SimBackend() override { stop(); }

    int32_t open(const OpenRequest& req, OpenResult& res, BackendListener* listener) override {
        listener_ = listener;
        if (opens_failed_ < cfg_.open_error_count && cfg_.open_error != 0) {
            ++opens_failed_;
            return cfg_.open_error;
        }
        rate_ = rate_changed_ ? cfg_.rate_after : cfg_.sample_rate_hz;
        if (req.sample_rate && req.sample_rate != rate_) {
            // Emulate a device that only supports its own rate.
            return L1_ERR_FORMAT;
        }
        // Period negotiation: the device supports 128..4800 frames in steps of 32.
        uint32_t period = req.period_frames ? req.period_frames : cfg_.min_packet_frames;
        period = std::clamp<uint32_t>(period, 128, 4800);
        period = (period + 16) / 32 * 32;
        period_ = period;
        res.sample_rate = rate_;
        res.channels = cfg_.channels;
        res.period_frames = period;
        res.buffer_frames = period * 4;
        res.max_packet_frames = std::max(cfg_.max_packet_frames, cfg_.min_packet_frames) + 4096;
        res.raw_active = false;          // simulator never offers RAW
        res.ts_source = L1_TS_SIMULATED;
        res.device_id = "sim:0";
        res.device_name = "Simulated microphone";
        res.format_note = "float32 simulated";
        buf_.assign((size_t)res.max_packet_frames * cfg_.channels, 0.0f);
        return L1_OK;
    }

    int32_t start(CaptureSink* sink) override {
        stop();
        sink_ = sink;
        stop_.store(false);
        ++stream_no_;
        ns_per_frame_ = 1e9 / rate_ * (1.0 + cfg_.clock_drift_ppm * 1e-6) / (cfg_.speed > 0 ? cfg_.speed : 1.0);
        start_ns_ = now_ns() + 2000000;  // first packet ~2 ms from now
        th_ = std::thread([this] { run(); });
        return L1_OK;
    }
    void stop() override {
        stop_.store(true);
        if (th_.joinable()) th_.join();
    }
    void close() override {}
    int32_t list_devices(std::vector<l1_device_info>& out) override {
        l1_device_info d{};
        std::snprintf(d.id, sizeof d.id, "sim:0");
        std::snprintf(d.name, sizeof d.name, "Simulated microphone");
        d.is_default = 1;
        d.mix_sample_rate_hz = cfg_.sample_rate_hz;
        d.channels = cfg_.channels;
        out.push_back(d);
        return L1_OK;
    }
    int64_t sim_stream_start_ns() const override { return start_ns_; }
    double sim_ns_per_frame() const override { return ns_per_frame_; }

private:
    void fill(int64_t first, uint32_t n) {
        const uint32_t ch = cfg_.channels;
        for (uint32_t f = 0; f < n; ++f) {
            const int64_t k = first + f;
            for (uint32_t c = 0; c < ch; ++c) {
                float v = 0;
                switch (cfg_.signal) {
                case 0: v = sim_counter_value(k, c); break;
                case 1: v = cfg_.sine_amplitude * (float)std::sin(2 * M_PI * cfg_.sine_hz * (double)k / rate_); break;
                case 2: v = 0; break;
                case 3:
                    if (cfg_.file_samples && cfg_.file_frames) {
                        uint64_t i = (uint64_t)k;
                        if (cfg_.loop) i %= cfg_.file_frames;
                        v = i < cfg_.file_frames ? cfg_.file_samples[i * ch + c] : 0.0f;
                    }
                    break;
                }
                buf_[(size_t)f * ch + c] = v;
            }
        }
    }

    void run() {
        set_rt_thread(true);
        std::mt19937_64 rng(cfg_.seed * 1000003ULL + stream_no_);
        std::uniform_real_distribution<double> U(0, 1);
        std::normal_distribution<double> N(0, 1);
        const uint32_t lo = cfg_.min_packet_frames, hi = std::max(cfg_.max_packet_frames, lo);
        std::uniform_int_distribution<uint32_t> size(lo, hi);
        int64_t pos = 0;            // next new device frame
        BackendEvent end_ev = BackendEvent::StreamEnded;
        bool ended = false;
        while (!stop_.load(std::memory_order_relaxed)) {
            uint32_t n = size(rng);
            if (cfg_.total_frames && total_ + n > cfg_.total_frames) {
                if (total_ >= cfg_.total_frames) { ended = true; break; }
                n = (uint32_t)(cfg_.total_frames - total_);
            }
            if (cfg_.lose_device_at_frame >= 0 && !lost_ && total_ >= (uint64_t)cfg_.lose_device_at_frame) {
                lost_ = true; end_ev = BackendEvent::DeviceLost; ended = true; break;
            }
            if (cfg_.change_rate_at_frame >= 0 && !rate_changed_ && total_ >= (uint64_t)cfg_.change_rate_at_frame) {
                rate_changed_ = true; end_ev = BackendEvent::FormatChanged; ended = true; break;
            }
            // Fault: the device lost frames (position jumps ahead).
            if (cfg_.p_position_jump > 0 && U(rng) < cfg_.p_position_jump) {
                pos += 1 + (int64_t)(U(rng) * 2000);
            }
            int64_t first = pos;
            // Fault: the device repeats up to n-1 frames it already sent.
            if (cfg_.p_duplicate > 0 && pos > 0 && U(rng) < cfg_.p_duplicate) {
                int64_t d = 1 + (int64_t)(U(rng) * std::min<int64_t>(pos, n - 1 > 0 ? n - 1 : 1));
                first = pos - std::min<int64_t>(d, pos);
            }
            const int64_t end = first + n;
            // Pace: packet is available once its last frame is captured.
            if (cfg_.realtime) {
                const int64_t due = start_ns_ + (int64_t)((double)end * ns_per_frame_);
                for (;;) {
                    int64_t w = due - now_ns();
                    if (w <= 0 || stop_.load(std::memory_order_relaxed)) break;
                    sleep_us(std::min<int64_t>(w / 1000, 2000));
                }
            }
            const int64_t t0 = now_ns();
            DevicePacket p;
            p.frames = n;
            p.device_position = (uint64_t)first;
            p.position_valid = true;
            p.time_ns = start_ns_ + (int64_t)std::llround((double)first * ns_per_frame_);
            if (cfg_.timestamp_jitter_us > 0) p.time_ns += (int64_t)(N(rng) * cfg_.timestamp_jitter_us * 1000.0);
            p.time_valid = !(cfg_.p_timestamp_error > 0 && U(rng) < cfg_.p_timestamp_error);
            p.device_glitch = cfg_.p_device_glitch > 0 && U(rng) < cfg_.p_device_glitch;
            p.silent = cfg_.p_silent > 0 && U(rng) < cfg_.p_silent;
            if (!p.silent) { fill(first, n); p.data = buf_.data(); }
            if (cfg_.p_callback_delay > 0 && U(rng) < cfg_.p_callback_delay) sleep_us(cfg_.callback_delay_us);
            sink_->on_packet(p);
            sink_->note_callback(now_ns() - t0);
            pos = std::max(pos, end);
            total_ += n;
        }
        set_rt_thread(false);
        if (ended && listener_) {
            const char* msg = end_ev == BackendEvent::DeviceLost ? "simulated device unplugged"
                            : end_ev == BackendEvent::FormatChanged ? "simulated sample-rate change"
                            : "simulated stream finished";
            listener_->backend_event(end_ev, end_ev == BackendEvent::DeviceLost ? L1_ERR_DEVICE_LOST : 0, 0, msg);
        }
    }

    l1_sim_config cfg_;
    BackendListener* listener_ = nullptr;
    CaptureSink* sink_ = nullptr;
    std::thread th_;
    std::atomic<bool> stop_{false};
    std::vector<float> buf_;
    uint32_t rate_ = 48000, period_ = 480, opens_failed_ = 0, stream_no_ = 0;
    uint64_t total_ = 0;                 // frames generated across all streams
    bool lost_ = false, rate_changed_ = false;
    int64_t start_ns_ = 0;
    double ns_per_frame_ = 0;
};

} // namespace

std::unique_ptr<Backend> make_sim_backend(const l1_sim_config& cfg) {
    return std::unique_ptr<Backend>(new SimBackend(cfg));
}

} // namespace l1
