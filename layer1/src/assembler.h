// Consumer-side frame assembler.
//
// Runs on the single consumer thread (the caller of l1_read_frame). Pulls
// packets from the transport, builds frames of a nominal size that never span
// a gap, assigns capture times from the packet anchors, measures levels and
// applies optional conditioning.
#pragma once
#include <cstdint>
#include <memory>
#include <vector>

#include "conditioning.h"
#include "core.h"

namespace l1 {

// Exponentially weighted least-squares fit of packet capture time against
// sample index within an epoch (time constant ~ 1/(1-lambda) packets). Gives a
// smoothed sample->time mapping that is immune to per-packet timestamp jitter,
// the device clock's drift against l1_now_ns(), and the jitter (RMS residual).
// Computed in centred coordinates so it stays accurate over hours.
class ClockFit {
public:
    void reset(uint32_t rate) {
        rate_ = rate; n_ = 0; mx_ = my_ = cxx_ = cxy_ = 0; resid2_ = 0; nres_ = 0; outliers_ = 0;
    }
    // Returns false (and ignores the point) if it disagrees with the fit by
    // more than 20 ms: treated as a timestamp fault, not as clock movement.
    bool add(int64_t index, int64_t time_ns) {
        if (n_ == 0) { x0_ = index; y0_ = time_ns; }
        const double x = (double)(index - x0_), y = (double)(time_ns - y0_);
        if (ready()) {
            const double r = y - predict_rel(x);
            if (std::fabs(r) > 20e6) {
                if (++outliers_ < 8) return false;
                // Persistent disagreement: the clock really moved. Start over.
                reset(rate_);
                return add(index, time_ns);
            }
            outliers_ = 0;
            resid2_ = nres_ ? resid2_ * 0.99 + r * r * 0.01 : r * r;
            ++nres_;
        }
        const double lam = n_ < 64 ? 1.0 - 1.0 / (double)(n_ + 1) : 0.999;   // plain mean at first
        const double w = 1.0 - lam;
        const double dx = x - mx_, dy = y - my_;
        mx_ += w * dx;
        my_ += w * dy;
        cxx_ = lam * (cxx_ + w * dx * dx);
        cxy_ = lam * (cxy_ + w * dx * dy);
        ++n_;
        return true;
    }
    bool ready() const { return n_ >= 16 && cxx_ > 0; }
    double ns_per_frame() const { return ready() ? cxy_ / cxx_ : 1e9 / (double)rate_; }
    int64_t predict(int64_t index) const { return y0_ + (int64_t)std::llround(predict_rel((double)(index - x0_))); }
    double drift_ppm() const { return ready() ? (ns_per_frame() / (1e9 / (double)rate_) - 1.0) * 1e6 : 0.0; }
    double jitter_ns() const { return nres_ ? std::sqrt(resid2_) : 0.0; }
private:
    double predict_rel(double x) const { return my_ + ns_per_frame() * (x - mx_); }
    uint32_t rate_ = 48000;
    uint64_t n_ = 0, nres_ = 0;
    uint32_t outliers_ = 0;
    int64_t x0_ = 0, y0_ = 0;
    double mx_ = 0, my_ = 0, cxx_ = 0, cxy_ = 0, resid2_ = 0;
};

class Assembler {
public:
    Assembler(Transport& t, Counters& c) : t_(t), c_(c) {}
    void configure(const l1_config& cfg, uint64_t stream_id);

    // Returns L1_OK and fills one frame, or L1_TIMEOUT.
    // `stopped` tells the assembler that no more packets will arrive for the
    // current epoch, so a partial frame may be flushed.
    int32_t read(l1_frame_info* info, float* data, uint32_t data_cap, float* raw, uint32_t raw_cap,
                 int32_t timeout_ms, const std::atomic<bool>& producer_idle);

    double drift_ppm() const { return clock_.drift_ppm(); }
    double jitter_us() const { return clock_.jitter_ns() / 1000.0; }

private:
    bool step(bool flush_partial);            // advance; true when a frame is ready
    void start_frame(const PacketDesc& d, uint32_t offset);
    void finish_frame(uint32_t extra_flags);
    void time_for(const PacketDesc& d, uint32_t offset, int64_t index);

    Transport& t_;
    Counters& c_;
    l1_config cfg_{};
    uint64_t stream_id_ = 0;
    uint32_t frame_size_ = 256;
    Conditioner cond_;
    ClockFit clock_;

    // current packet
    bool have_pkt_ = false;
    PacketDesc pkt_{};
    uint32_t pkt_off_ = 0;
    bool pkt_gap_handled_ = false;

    // epoch / gap state
    uint32_t epoch_ = 0;
    bool next_new_epoch_ = false;
    uint64_t next_dropped_ = 0;
    uint32_t next_reason_ = L1_GAP_NONE;
    uint32_t next_flags_ = 0;
    int64_t expected_index_ = -1;

    int64_t last_time_ = INT64_MIN;   // capture time of previous frame (monotonic guard)
    // timestamp anchor: last packet with a valid time in this epoch
    bool anchor_valid_ = false;
    int64_t anchor_index_ = 0, anchor_time_ = 0;
    uint32_t anchor_source_ = 0;

    // frame being built
    std::unique_ptr<float[]> buf_;
    uint32_t fill_ = 0;
    l1_frame_info cur_{};
    bool ready_ = false;
    uint64_t sequence_ = 0;

    // noise floor: recent frame RMS values (dB), 10th percentile
    std::vector<float> rms_hist_;
    std::vector<float> rms_tmp_;
    size_t rms_pos_ = 0, rms_n_ = 0;
    float noise_floor_ = -240.0f;
};

} // namespace l1
