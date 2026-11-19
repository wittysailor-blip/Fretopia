// Shared internal types: packet descriptors, counters, histograms, transport.
#pragma once
#include <atomic>
#include <cmath>
#include <cstdint>
#include <vector>

#include "l1/l1.h"
#include "platform.h"
#include "spsc.h"

namespace l1 {

constexpr uint32_t kMaxChannels = 8;   // delivered channels per frame

// Per-packet metadata travelling beside the samples in the transport.
enum : uint32_t {
    PKT_SILENT        = 1u << 0,
    PKT_TS_VALID      = 1u << 1,
    PKT_GAP_UNKNOWN   = 1u << 2,   // device glitch, length unknown
    PKT_DUPLICATES    = 1u << 3,   // repeated frames were removed before this packet
    PKT_END           = 1u << 4,   // zero-length end-of-epoch marker carrying trailing loss
};

struct PacketDesc {
    int64_t  first_index;     // index of first frame, in epoch
    int64_t  time_ns;         // capture time of first frame (if PKT_TS_VALID)
    int64_t  arrival_ns;      // host time when the packet reached Layer 1
    uint64_t dropped_before;  // frames lost immediately before this packet
    uint32_t frames;
    uint32_t flags;
    uint32_t epoch;
    uint32_t gap_reason;
    uint32_t sample_rate;
    uint32_t ts_source;
    uint16_t channels;
    uint16_t channel_mode;
};

// Lock-free histogram (relaxed atomics); percentiles are approximate to bin width.
class Histogram {
public:
    void init(double bin_width, size_t bins) {
        width_ = bin_width;
        bins_ = std::vector<std::atomic<uint64_t>>(bins + 1);
        reset();
    }
    void reset() {
        for (auto& b : bins_) b.store(0, std::memory_order_relaxed);
        max_.store(0, std::memory_order_relaxed);
        n_.store(0, std::memory_order_relaxed);
    }
    void add(double v) {
        if (v < 0) v = 0;
        size_t i = (size_t)(v / width_);
        if (i >= bins_.size() - 1) i = bins_.size() - 1;
        bins_[i].fetch_add(1, std::memory_order_relaxed);
        n_.fetch_add(1, std::memory_order_relaxed);
        uint64_t bits = (uint64_t)(v * 1000.0);
        uint64_t m = max_.load(std::memory_order_relaxed);
        while (bits > m && !max_.compare_exchange_weak(m, bits, std::memory_order_relaxed)) {}
    }
    uint64_t count() const { return n_.load(std::memory_order_relaxed); }
    double max() const { return max_.load(std::memory_order_relaxed) / 1000.0; }
    double percentile(double p) const {
        uint64_t n = count();
        if (!n) return 0;
        uint64_t target = (uint64_t)std::ceil(p * (double)n), acc = 0;
        for (size_t i = 0; i < bins_.size(); ++i) {
            acc += bins_[i].load(std::memory_order_relaxed);
            if (acc >= target) return i == bins_.size() - 1 ? max() : (i + 0.5) * width_;
        }
        return max();
    }
private:
    double width_ = 1;
    std::vector<std::atomic<uint64_t>> bins_;
    std::atomic<uint64_t> max_{0};
    std::atomic<uint64_t> n_{0};
};

struct Counters {
    std::atomic<uint64_t> packets_received{0}, frames_received{0}, frames_delivered{0},
        frames_dropped_overflow{0}, frames_dropped_device{0}, frames_duplicate_discarded{0},
        device_glitches{0}, timestamp_errors{0}, silent_packets{0}, discontinuities{0},
        epochs_started{0}, callback_overruns{0}, unreported_tail{0};
    std::atomic<uint32_t> queue_high_water{0};
    std::atomic<double> drift_ppm{0.0}, jitter_us{0.0};   // published by the consumer
    Histogram callback_us;       // producer: time spent per device callback
    Histogram capture_to_ready_ms; // consumer: ready time - capture time of last sample
    Counters() {
        callback_us.init(5.0, 4000);           // 5 us bins up to 20 ms
        capture_to_ready_ms.init(0.25, 4000);  // 0.25 ms bins up to 1 s
    }
};

// The transport: samples + descriptors, both SPSC, sized once at creation.
struct Transport {
    SpscRing<float> samples;
    SpscRing<PacketDesc> packets;
    Signal signal;
    uint32_t capacity_frames = 0;
    // Occupancy in frames (channel count can differ between epochs).
    alignas(64) std::atomic<uint64_t> frames_pushed{0};  // producer writes
    alignas(64) std::atomic<uint64_t> frames_popped{0};  // consumer writes
    uint32_t queued_frames() const {
        return (uint32_t)(frames_pushed.load(std::memory_order_acquire) - frames_popped.load(std::memory_order_acquire));
    }
    void init(uint32_t cap_frames) {
        capacity_frames = cap_frames;
        samples.init((size_t)cap_frames * kMaxChannels);
        packets.init(std::max<size_t>(64, cap_frames / 16)); // >= 1 descriptor per 16 frames
    }
};

inline float to_db(double lin) { return lin > 1e-12 ? (float)(20.0 * std::log10(lin)) : -240.0f; }

} // namespace l1
