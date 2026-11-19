#include "assembler.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace l1 {

void Assembler::configure(const l1_config& cfg, uint64_t stream_id) {
    cfg_ = cfg;
    stream_id_ = stream_id;
    frame_size_ = cfg.frame_size ? cfg.frame_size : 256;
    buf_.reset(new float[(size_t)frame_size_ * kMaxChannels]);
    cond_.configure(cfg);
    rms_hist_.assign(512, -240.0f);
    rms_tmp_.resize(512);
}

void Assembler::time_for(const PacketDesc& d, uint32_t offset, int64_t index) {
    const double nominal = 1e9 / (double)d.sample_rate;
    const double jitter3 = 3.0 * clock_.jitter_ns();
    const int64_t one_sample = (int64_t)nominal;
    const bool own = (d.flags & PKT_TS_VALID) != 0;
    if (clock_.ready() && anchor_valid_) {
        // Smoothed mapping from the clock fit. Frames whose own packet had no
        // valid timestamp are still flagged as estimated.
        cur_.capture_time_ns = clock_.predict(index);
        cur_.timestamp_source = anchor_source_;
        int64_t u = (int64_t)jitter3 + one_sample;
        if (!own) {
            cur_.flags |= L1_FRAME_TIMESTAMP_ESTIMATED;
            u += (int64_t)(std::fabs((double)(index - anchor_index_) * nominal) * 200e-6);
        }
        cur_.timestamp_uncertainty_ns = u;
    } else if (own) {
        cur_.capture_time_ns = d.time_ns + (int64_t)std::llround(offset * nominal);
        cur_.timestamp_source = d.ts_source;
        cur_.timestamp_uncertainty_ns = (int64_t)jitter3 + one_sample;
    } else if (anchor_valid_) {
        const int64_t di = index - anchor_index_;
        cur_.capture_time_ns = anchor_time_ + (int64_t)std::llround((double)di * nominal);
        cur_.timestamp_source = anchor_source_;
        cur_.flags |= L1_FRAME_TIMESTAMP_ESTIMATED;
        // Extrapolation error grows with distance from the anchor: allow 200 ppm.
        cur_.timestamp_uncertainty_ns = (int64_t)(jitter3 + std::fabs((double)di * nominal) * 200e-6) + one_sample;
    } else {
        cur_.capture_time_ns = 0;
        cur_.timestamp_source = L1_TS_NONE;
        cur_.flags |= L1_FRAME_TIMESTAMP_INVALID;
        cur_.timestamp_uncertainty_ns = -1;
        return;
    }
    // Capture times never go backward within an epoch.
    if (last_time_ != INT64_MIN && cur_.capture_time_ns <= last_time_) cur_.capture_time_ns = last_time_ + 1;
    last_time_ = cur_.capture_time_ns;
}

void Assembler::start_frame(const PacketDesc& d, uint32_t offset) {
    cur_ = l1_frame_info{};
    cur_.api_version = L1_API_VERSION;
    cur_.struct_size = sizeof(l1_frame_info);
    cur_.stream_id = stream_id_;
    cur_.stream_epoch = d.epoch;
    cur_.sample_rate_hz = d.sample_rate;
    cur_.channels = d.channels;
    cur_.channel_mode = d.channel_mode;
    cur_.sample_format = 1;
    cur_.first_sample_index = d.first_index + offset;
    cur_.flags = next_flags_;
    if (next_new_epoch_) cur_.flags |= L1_FRAME_NEW_EPOCH;
    if (next_dropped_ > 0 || (next_flags_ & L1_FRAME_GAP_LENGTH_UNKNOWN) ||
        (next_new_epoch_ && next_reason_ != L1_GAP_NONE))
        cur_.flags |= L1_FRAME_DISCONTINUITY;
    cur_.dropped_frames_before = next_dropped_;
    cur_.gap_reason = next_reason_;
    cur_.gain_db = cond_.gain_db();
    time_for(d, offset, cur_.first_sample_index);
    next_new_epoch_ = false;
    next_dropped_ = 0;
    next_reason_ = L1_GAP_NONE;
    next_flags_ = 0;
}

void Assembler::finish_frame(uint32_t extra_flags) {
    cur_.frame_count = fill_;
    cur_.flags |= extra_flags;
    const uint32_t n = fill_ * cur_.channels;
    const float clip = cfg_.clip_threshold > 0 ? cfg_.clip_threshold : 0.999f;
    double ss = 0, peak = 0;
    uint32_t clipped = 0, bad = 0;
    float* x = buf_.get();
    for (uint32_t i = 0; i < n; ++i) {
        float v = x[i];
        if (!std::isfinite(v)) { x[i] = 0.0f; ++bad; continue; }
        const double a = std::fabs((double)v);
        ss += a * a;
        if (a > peak) peak = a;
        if (a >= clip) ++clipped;
    }
    cur_.rms_dbfs = to_db(n ? std::sqrt(ss / n) : 0.0);
    cur_.peak_dbfs = to_db(peak);
    cur_.clipped_samples = clipped;
    cur_.nonfinite_samples = bad;
    if (clipped) cur_.flags |= L1_FRAME_CLIPPED;
    if (bad) cur_.flags |= L1_FRAME_NONFINITE;
    if (cur_.silent_frames) cur_.flags |= L1_FRAME_SILENT;

    // Noise floor: 10th percentile of recent non-silent frame levels.
    if (cur_.silent_frames < cur_.frame_count && n) {
        rms_hist_[rms_pos_] = cur_.rms_dbfs;
        rms_pos_ = (rms_pos_ + 1) % rms_hist_.size();
        rms_n_ = std::min(rms_n_ + 1, rms_hist_.size());
        if ((sequence_ & 15) == 0 || rms_n_ < 16) {
            std::copy(rms_hist_.begin(), rms_hist_.begin() + rms_n_, rms_tmp_.begin());
            auto k = rms_tmp_.begin() + rms_n_ / 10;
            std::nth_element(rms_tmp_.begin(), k, rms_tmp_.begin() + rms_n_);
            noise_floor_ = *k;
        }
    }
    cur_.noise_floor_dbfs = noise_floor_;
    ready_ = true;
}

bool Assembler::step(bool) {
    while (!ready_) {
        if (!have_pkt_) {
            if (t_.packets.available() == 0) return false;
            pkt_ = t_.packets.front();
            have_pkt_ = true;
            pkt_off_ = 0;
            pkt_gap_handled_ = false;
        }
        if (!pkt_gap_handled_) {
            const bool new_epoch = pkt_.epoch != epoch_;
            int64_t index_gap = 0;
            if (!new_epoch && expected_index_ >= 0) index_gap = pkt_.first_index - expected_index_;
            const bool gap = !new_epoch && (pkt_.dropped_before > 0 || index_gap != 0 || (pkt_.flags & PKT_GAP_UNKNOWN));
            if ((new_epoch || gap) && fill_ > 0) {
                finish_frame(L1_FRAME_PARTIAL | (new_epoch ? L1_FRAME_LAST_OF_EPOCH : 0));
                return true;   // this packet is handled on the next call
            }
            if (new_epoch) {
                const bool had_epoch = epoch_ != 0;
                epoch_ = pkt_.epoch;
                next_new_epoch_ = true;
                next_reason_ = had_epoch ? (pkt_.gap_reason ? pkt_.gap_reason : (uint32_t)L1_GAP_STREAM_RESTART)
                                         : (uint32_t)L1_GAP_NONE;
                next_dropped_ = 0;
                next_flags_ = 0;
                anchor_valid_ = false;
                last_time_ = INT64_MIN;
                clock_.reset(pkt_.sample_rate);
                cond_.reset(pkt_.sample_rate);
                rms_n_ = 0; rms_pos_ = 0; noise_floor_ = -240.0f;
                if (had_epoch) c_.discontinuities.fetch_add(1, std::memory_order_relaxed);
            } else if (gap) {
                // index_gap is authoritative: it equals dropped_before unless a
                // glitch of unknown length occurred (index_gap 0, flag set).
                next_dropped_ += (uint64_t)std::max<int64_t>(index_gap, 0);
                if (next_reason_ == L1_GAP_NONE)
                    next_reason_ = pkt_.gap_reason ? pkt_.gap_reason : (uint32_t)L1_GAP_DEVICE_POSITION_JUMP;
                if (pkt_.flags & PKT_GAP_UNKNOWN) {
                    next_flags_ |= L1_FRAME_GAP_LENGTH_UNKNOWN;
                    anchor_valid_ = false;   // index no longer maps to time through the gap
                }
                c_.discontinuities.fetch_add(1, std::memory_order_relaxed);
            }
            if (pkt_.flags & PKT_DUPLICATES) next_flags_ |= L1_FRAME_DUPLICATES_REMOVED;
            if ((pkt_.flags & PKT_TS_VALID) && pkt_.frames > 0) {
                if (clock_.add(pkt_.first_index, pkt_.time_ns)) {
                    anchor_valid_ = true;
                    anchor_index_ = pkt_.first_index;
                    anchor_time_ = pkt_.time_ns;
                    anchor_source_ = pkt_.ts_source;
                } else {
                    pkt_.flags &= ~PKT_TS_VALID;   // outlier: frames from it are estimated
                }
            }
            pkt_gap_handled_ = true;
        }
        if (pkt_.flags & PKT_END) {
            // Zero-length end-of-epoch frame reporting loss after the last sample.
            if (fill_ > 0) { finish_frame(L1_FRAME_PARTIAL); return true; }
            start_frame(pkt_, 0);
            t_.packets.consume(1);
            have_pkt_ = false;
            expected_index_ = pkt_.first_index;
            finish_frame(L1_FRAME_LAST_OF_EPOCH);
            return true;
        }
        if (fill_ == 0) start_frame(pkt_, pkt_off_);
        const uint32_t n = std::min(pkt_.frames - pkt_off_, frame_size_ - fill_);
        const uint32_t ch = pkt_.channels;
        t_.samples.peek(buf_.get() + (size_t)fill_ * ch, 0, (size_t)n * ch);
        t_.samples.consume((size_t)n * ch);
        t_.frames_popped.store(t_.frames_popped.load(std::memory_order_relaxed) + n, std::memory_order_release);
        if (pkt_.flags & PKT_SILENT) cur_.silent_frames += n;
        pkt_off_ += n;
        fill_ += n;
        if (pkt_off_ == pkt_.frames) {
            t_.packets.consume(1);
            have_pkt_ = false;
            expected_index_ = pkt_.first_index + pkt_.frames;
        }
        if (fill_ == frame_size_) finish_frame(0);
    }
    return true;
}

int32_t Assembler::read(l1_frame_info* info, float* data, uint32_t data_cap, float* raw, uint32_t raw_cap,
                        int32_t timeout_ms, const std::atomic<bool>& producer_idle) {
    const int64_t deadline = timeout_ms < 0 ? INT64_MAX : now_ns() + (int64_t)timeout_ms * 1000000LL;
    for (;;) {
        const uint32_t seen = t_.signal.load();
        if (ready_ || step(false)) break;
        if (producer_idle.load(std::memory_order_acquire) && t_.packets.available() == 0) {
            if (fill_ > 0) { finish_frame(L1_FRAME_PARTIAL | L1_FRAME_LAST_OF_EPOCH); break; }
            return L1_TIMEOUT;
        }
        const int64_t now = now_ns();
        if (now >= deadline) return L1_TIMEOUT;
        int64_t left_ms = timeout_ms < 0 ? 100 : std::min<int64_t>((deadline - now + 999999) / 1000000, 100);
        t_.signal.wait(seen, (int32_t)left_ms);
    }

    const uint32_t n = cur_.frame_count * cur_.channels;
    if (!data || data_cap < n || (raw && raw_cap < n)) return L1_ERR_BUFFER_TOO_SMALL;  // frame kept
    if (raw) std::memcpy(raw, buf_.get(), n * sizeof(float));
    std::memcpy(data, buf_.get(), n * sizeof(float));
    if (cond_.active()) {
        cond_.process(data, cur_.frame_count, cur_.channels);
        cur_.flags |= L1_FRAME_CONDITIONED;
    }
    cur_.sequence = sequence_++;
    cur_.ready_time_ns = now_ns();
    if (!(cur_.flags & L1_FRAME_TIMESTAMP_INVALID) && cur_.sample_rate_hz) {
        const int64_t last = cur_.capture_time_ns +
            (int64_t)((double)(cur_.frame_count ? cur_.frame_count - 1 : 0) * 1e9 / cur_.sample_rate_hz);
        c_.capture_to_ready_ms.add((cur_.ready_time_ns - last) / 1e6);
    }
    c_.frames_delivered.fetch_add(cur_.frame_count, std::memory_order_relaxed);
    c_.drift_ppm.store(clock_.drift_ppm(), std::memory_order_relaxed);
    c_.jitter_us.store(clock_.jitter_ns() / 1000.0, std::memory_order_relaxed);
    *info = cur_;
    ready_ = false;
    fill_ = 0;
    return L1_OK;
}

} // namespace l1
