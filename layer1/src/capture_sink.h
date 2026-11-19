// Producer-side adapter between a device backend and the transport.
//
// Runs on the real-time capture thread. Validates device positions, assigns the
// absolute sample index, applies channel selection, writes into the transport
// and records every gap. Never allocates, locks, waits or throws.
#pragma once
#include <cstdint>
#include <memory>

#include "core.h"

namespace l1 {

struct DevicePacket {
    const float* data = nullptr;   // interleaved float32, device channel count; nullptr when silent
    uint32_t frames = 0;
    uint64_t device_position = 0;  // device frame position of first frame
    bool     position_valid = false;
    int64_t  time_ns = 0;          // capture time of first frame, l1 clock
    bool     time_valid = false;
    bool     device_glitch = false;// OS data-discontinuity flag
    bool     silent = false;       // OS silent flag: data must not be read
};

struct EpochParams {
    uint32_t epoch = 1;
    uint32_t sample_rate = 48000;
    uint32_t device_channels = 1;
    l1_channel_mode channel_mode = L1_CHANNELS_ALL;
    uint32_t select_channel = 0;
    uint32_t period_frames = 480;      // for overrun accounting
    uint32_t max_packet_frames = 8192; // scratch sizing
    uint32_t ts_source = L1_TS_NONE;
};

class CaptureSink {
public:
    CaptureSink(Transport& t, Counters& c) : t_(t), c_(c) {}

    // Not real-time: called while the backend is stopped, before its thread starts.
    // Allocates scratch for this epoch's maximum packet size.
    void begin_epoch(const EpochParams& p);
    uint32_t delivered_channels() const { return out_ch_; }
    uint32_t epoch() const { return p_.epoch; }  // not real-time safe to call concurrently

    // Real-time.
    void on_packet(const DevicePacket& pkt);
    // Real-time: report the duration of one device wake-up (event to return).
    void note_callback(int64_t duration_ns);
    // After the capture thread has stopped (or on a device reset): if frames were
    // lost after the last accepted packet, write a zero-length end-of-epoch
    // descriptor carrying that loss so it still reaches Layer 2. Never blocks;
    // if no descriptor slot is free the loss is counted in unreported_tail.
    void end_epoch();

private:
    void emit_terminal();
    void push(const float* src, uint32_t frames, int64_t first_index, int64_t time_ns, bool time_valid,
              bool silent, int64_t arrival_ns);

    Transport& t_;
    Counters& c_;
    EpochParams p_{};
    uint32_t out_ch_ = 1;
    std::unique_ptr<float[]> scratch_;
    uint32_t scratch_frames_ = 0;

    bool have_expected_ = false;
    uint64_t expected_position_ = 0;
    int64_t next_index_ = 0;
    bool first_packet_ = true;
    bool started_ = false;
    // Gap waiting to be attached to the next accepted packet.
    uint64_t pending_drop_ = 0;
    uint32_t pending_reason_ = L1_GAP_NONE;
    uint32_t pending_flags_ = 0;
    int64_t period_ns_ = 10000000;
};

} // namespace l1
