// Optional signal conditioning. All stages are off by default; when off, the
// delivered samples are bit-identical to the captured samples.
#pragma once
#include <cmath>
#include <cstdint>

#include "core.h"

namespace l1 {

struct Biquad {
    double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    double z1[kMaxChannels] = {}, z2[kMaxChannels] = {};
    // RBJ cookbook notch.
    void notch(double fs, double f0, double q) {
        const double w = 2 * M_PI * f0 / fs, cw = std::cos(w), alpha = std::sin(w) / (2 * q);
        const double a0 = 1 + alpha;
        b0 = 1 / a0; b1 = -2 * cw / a0; b2 = 1 / a0; a1 = -2 * cw / a0; a2 = (1 - alpha) / a0;
        reset();
    }
    void reset() { for (uint32_t c = 0; c < kMaxChannels; ++c) z1[c] = z2[c] = 0; }
    inline float tick(float x, uint32_t c) {   // transposed direct form II
        double y = b0 * x + z1[c];
        z1[c] = b1 * x - a1 * y + z2[c];
        z2[c] = b2 * x - a2 * y;
        return (float)y;
    }
};

class Conditioner {
public:
    void configure(const l1_config& cfg) {
        dc_ = cfg.dc_block != 0;
        dc_hz_ = cfg.dc_block_hz > 0 ? cfg.dc_block_hz : 5.0f;
        hum_hz_ = cfg.hum_notch_hz;
        hum_n_ = cfg.hum_notch_harmonics ? std::min<uint32_t>(cfg.hum_notch_harmonics, 8) : 1;
        gain_db_ = cfg.digital_gain_db;
        gain_ = std::pow(10.0f, gain_db_ / 20.0f);
        rate_ = 0;
    }
    bool active() const { return dc_ || hum_hz_ || gain_db_ != 0.0f; }
    float gain_db() const { return gain_db_; }
    // Call at the start of an epoch (rate may change). Clears filter memory.
    void reset(uint32_t rate) {
        rate_ = rate;
        dc_r_ = std::exp(-2 * M_PI * dc_hz_ / (double)rate);
        for (uint32_t c = 0; c < kMaxChannels; ++c) dc_x1_[c] = dc_y1_[c] = 0;
        for (uint32_t h = 0; h < hum_n_ && hum_hz_; ++h) {
            double f = (double)hum_hz_ * (h + 1);
            if (f < rate * 0.45) notch_[h].notch(rate, f, 30.0); else notch_[h] = Biquad{};
        }
    }
    void process(float* x, uint32_t frames, uint32_t ch) {
        for (uint32_t f = 0; f < frames; ++f) {
            for (uint32_t c = 0; c < ch; ++c) {
                float v = x[f * ch + c];
                if (gain_db_ != 0.0f) v *= gain_;
                if (dc_) {   // y[n] = x[n] - x[n-1] + R y[n-1]
                    double y = (double)v - dc_x1_[c] + dc_r_ * dc_y1_[c];
                    dc_x1_[c] = v; dc_y1_[c] = y; v = (float)y;
                }
                if (hum_hz_) for (uint32_t h = 0; h < hum_n_; ++h) v = notch_[h].tick(v, c);
                x[f * ch + c] = v;
            }
        }
    }
private:
    bool dc_ = false;
    float dc_hz_ = 5, gain_db_ = 0, gain_ = 1;
    uint32_t hum_hz_ = 0, hum_n_ = 1, rate_ = 0;
    double dc_r_ = 0.999, dc_x1_[kMaxChannels] = {}, dc_y1_[kMaxChannels] = {};
    Biquad notch_[8];
};

} // namespace l1
