// Capture backend interface. A backend owns one OS stream at a time and a
// capture thread that calls CaptureSink::on_packet in real time.
#pragma once
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "capture_sink.h"
#include "l1/l1.h"

namespace l1 {

struct OpenRequest {
    std::string device_id;        // empty = default capture device
    uint32_t sample_rate = 0;     // 0 = device mix rate
    uint32_t period_frames = 0;   // 0 = device default
    bool raw = false;
};

struct OpenResult {
    uint32_t sample_rate = 0;
    uint32_t channels = 0;
    uint32_t period_frames = 0;
    uint32_t buffer_frames = 0;
    uint32_t max_packet_frames = 0;
    bool raw_active = false;
    uint32_t ts_source = L1_TS_NONE;
    std::string device_id;
    std::string device_name;
    std::string format_note;      // e.g. "float32 2ch 48000 Hz (WAVE_FORMAT_EXTENSIBLE)"
};

enum class BackendEvent { DeviceLost, DefaultChanged, FormatChanged, StreamEnded, Error, Stalled };

class BackendListener {
public:
    virtual ~BackendListener() = default;
    // Called from non-real-time contexts only: the capture thread after it has
    // left its loop, or OS notification threads. Must not block for long.
    virtual void backend_event(BackendEvent ev, int32_t code, int64_t detail, const char* message) = 0;
};

class Backend {
public:
    virtual ~Backend() = default;
    virtual int32_t open(const OpenRequest& req, OpenResult& res, BackendListener* listener) = 0;
    virtual int32_t start(CaptureSink* sink) = 0;
    virtual void stop() = 0;      // joins the capture thread; safe to call twice
    virtual void close() = 0;     // releases the OS stream
    virtual int32_t list_devices(std::vector<l1_device_info>& out) = 0;
    // Test hook: host time of device frame 0 for the current stream (simulator only).
    virtual int64_t sim_stream_start_ns() const { return 0; }
    virtual double sim_ns_per_frame() const { return 0; }
};

std::unique_ptr<Backend> make_sim_backend(const l1_sim_config& cfg);
std::unique_ptr<Backend> make_wasapi_backend();   // nullptr when not built for Windows

// Simulator's counter signal: exactly representable, unique per (index, channel)
// within a 2^20-frame window. Shared with tests for verification.
inline float sim_counter_value(int64_t index, uint32_t ch) {
    const uint32_t m = (uint32_t)((uint64_t)(index + (int64_t)ch * 333331) & 0xFFFFFu);
    return (float)m * (1.0f / 2097152.0f);   // [0, 0.5)
}

} // namespace l1
