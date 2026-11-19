// Deterministic single-threaded tests of the capture adapter + transport +
// frame assembler, driven packet by packet (no device, no timing noise).
// Covers T04, T08, T09, T10, T12 (transport level), T24 (detection) and the
// epoch logic behind T06/T07.
#include <atomic>
#include <cmath>
#include <vector>

#include "assembler.h"
#include "capture_sink.h"
#include "check.h"

using namespace l1;

static const int64_t T0 = 5000000000LL;   // arbitrary host time of device frame 0

struct Rig {
    Transport t;
    Counters c;
    CaptureSink sink{t, c};
    Assembler a{t, c};
    l1_config cfg{};
    std::atomic<bool> idle{false};
    uint32_t rate = 48000, dev_ch = 1;
    std::vector<float> pkt;
    std::vector<float> out, raw;
    t::Verifier v;
    std::vector<l1_frame_info> frames;
    std::vector<std::vector<float>> data;

    explicit Rig(uint32_t cap = 8192, uint32_t frame = 256, uint32_t ch = 1, l1_channel_mode mode = L1_CHANNELS_ALL,
                 uint32_t epoch = 1, uint32_t r = 48000) {
        l1_default_config(&cfg);
        cfg.transport_capacity_frames = cap;
        cfg.frame_size = frame;
        cfg.channel_mode = mode;
        t.init(cap);
        a.configure(cfg, 42);
        out.resize((size_t)frame * kMaxChannels);
        raw.resize((size_t)frame * kMaxChannels);
        start_epoch(epoch, r, ch, mode);
        v.ns_per_frame = 1e9 / rate;
        v.truth_start_ns = T0;
        v.time_tolerance_ns = 50;
    }
    void start_epoch(uint32_t epoch, uint32_t r, uint32_t ch, l1_channel_mode mode = L1_CHANNELS_ALL, uint32_t sel = 0) {
        rate = r; dev_ch = ch;
        EpochParams p;
        p.epoch = epoch; p.sample_rate = r; p.device_channels = ch; p.channel_mode = mode; p.select_channel = sel;
        p.period_frames = 480; p.max_packet_frames = 8192; p.ts_source = L1_TS_SIMULATED;
        sink.begin_epoch(p);
    }
    // Device packet whose content is the counter signal at device position `pos`.
    void feed(int64_t pos, uint32_t n, bool ts_valid = true, bool glitch = false, bool silent = false,
              float (*gen)(int64_t, uint32_t) = nullptr) {
        pkt.resize((size_t)n * dev_ch);
        for (uint32_t f = 0; f < n; ++f)
            for (uint32_t c = 0; c < dev_ch; ++c)
                pkt[(size_t)f * dev_ch + c] = gen ? gen(pos + f, c) : sim_counter_value(pos + f, c);
        DevicePacket p;
        p.data = silent ? nullptr : pkt.data();
        p.frames = n;
        p.device_position = (uint64_t)pos;
        p.position_valid = true;
        p.time_ns = T0 + (int64_t)std::llround((double)pos * 1e9 / rate);
        p.time_valid = ts_valid;
        p.device_glitch = glitch;
        p.silent = silent;
        sink.on_packet(p);
    }
    // Read every frame currently available (flush partial when `final`).
    int read_all(bool final = false, bool verify = true) {
        idle.store(final);
        int n = 0;
        l1_frame_info fi;
        while (a.read(&fi, out.data(), (uint32_t)out.size(), raw.data(), (uint32_t)raw.size(), 0, idle) == L1_OK) {
            if (verify) v.on_frame(fi, out.data());
            frames.push_back(fi);
            data.emplace_back(out.begin(), out.begin() + (size_t)fi.frame_count * fi.channels);
            ++n;
        }
        return n;
    }
};

static void basic() {
    t::begin("P1", "Contiguous capture: exact samples, indices and timestamps");
    Rig r;
    int64_t pos = 0;
    const uint32_t sizes[] = {480, 1, 333, 1024, 7, 2000, 480};
    for (int rep = 0; rep < 50; ++rep)
        for (uint32_t n : sizes) { r.feed(pos, n); pos += n; r.read_all(); }
    r.read_all(true);
    r.v.print();
    CHECK(r.v.clean());
    CHECK(r.v.frames_total == (uint64_t)pos);
    CHECK(r.v.gap_records == 0);
    CHECK(r.v.partial_frames == 1);                 // only the final flush
    CHECK(r.frames.front().flags & L1_FRAME_NEW_EPOCH);
    CHECK(!(r.frames.front().flags & L1_FRAME_DISCONTINUITY));
    CHECK(r.v.time_errors == 0);
    bool sizes_ok = true;
    for (size_t i = 0; i + 1 < r.frames.size(); ++i) if (r.frames[i].frame_count != 256) sizes_ok = false;
    CHECK(sizes_ok);
    t::end("P1", "Contiguous capture", "%llu frames in %llu packets, max timestamp error %.0f ns, 0 gaps",
           (unsigned long long)pos, (unsigned long long)r.c.packets_received.load(), r.v.max_time_err_ns);
}

static void silent_packets() {
    t::begin("T08", "Silent packet flag");
    Rig r;
    r.feed(0, 480);
    r.feed(480, 480, true, false, true);    // device says silent: buffer must not be read
    r.feed(960, 480);
    r.read_all(true);
    r.v.print();
    CHECK(r.v.clean());
    CHECK(r.c.silent_packets.load() == 1);
    uint64_t silent_frames = 0;
    bool zeros = true;
    for (size_t i = 0; i < r.frames.size(); ++i) {
        silent_frames += r.frames[i].silent_frames;
        if (r.frames[i].silent_frames) CHECK(r.frames[i].flags & L1_FRAME_SILENT);
        for (uint32_t f = 0; f < r.frames[i].frame_count; ++f) {
            int64_t idx = r.frames[i].first_sample_index + f;
            if (idx >= 480 && idx < 960 && r.data[i][f] != 0.0f) zeros = false;
        }
    }
    CHECK(silent_frames == 480);
    CHECK(zeros);
    CHECK(r.v.frames_total == 1440 && r.v.gap_records == 0);
    t::end("T08", "Silent packet flag", "480 silent frames delivered as zeros with SILENT flag; timeline continuous (1440 frames, 0 gaps)");
}

static void timestamp_errors() {
    t::begin("T09", "Timestamp-error flag");
    {   // first packets have no valid time: frames must say INVALID, not invent a time
        Rig r(8192, 256);
        r.feed(0, 480, false);
        r.read_all();
        CHECK(!r.frames.empty());
        for (auto& f : r.frames) CHECK((f.flags & L1_FRAME_TIMESTAMP_INVALID) && f.capture_time_ns == 0);
        r.feed(480, 480, true);
        r.feed(960, 480, false);   // bad timestamp after a good one: extrapolated, flagged
        r.feed(1440, 480, true);
        r.read_all(true);
        uint64_t est = 0;
        double max_err = 0;
        for (auto& f : r.frames) {
            if (f.flags & L1_FRAME_TIMESTAMP_ESTIMATED) {
                ++est;
                CHECK(f.timestamp_uncertainty_ns > 0);
                double truth = T0 + f.first_sample_index * 1e9 / 48000;
                max_err = std::max(max_err, std::fabs(f.capture_time_ns - truth));
            }
        }
        CHECK(est >= 1);
        CHECK(max_err < 100);
        CHECK(r.c.timestamp_errors.load() == 2);
        r.v.print();
        CHECK(r.v.index_errors == 0 && r.v.data_mismatch == 0);
        t::end("T09", "Timestamp-error flag", "no-anchor frames INVALID (time 0); %llu frame(s) after a bad timestamp ESTIMATED, error %.0f ns vs truth",
               (unsigned long long)est, max_err);
    }
}

static void discontinuities() {
    t::begin("T10", "Packet discontinuity: dropped, duplicated and glitched frames");
    Rig r;
    r.feed(0, 480);
    r.feed(480, 300);       // 780 frames: frame 3 partly filled (12 frames)
    r.feed(1000, 480);      // device skipped 220 frames
    r.feed(1300, 480);      // device repeats 180 frames (1300..1479 already delivered)
    r.feed(1780, 480, true, true);   // OS glitch flag, length unknown
    r.feed(2260, 480);
    r.read_all(true);
    r.v.print();
    CHECK(r.v.data_mismatch == 0 && r.v.index_errors == 0 && r.v.time_regressions == 0 && r.v.unflagged_gaps == 0);
    CHECK(r.c.frames_dropped_device.load() == 220);
    CHECK(r.c.frames_duplicate_discarded.load() == 180);
    CHECK(r.c.device_glitches.load() == 1);
    bool jump = false, dup = false, glitch = false;
    for (auto& f : r.frames) {
        if (f.dropped_frames_before == 220 && f.gap_reason == L1_GAP_DEVICE_POSITION_JUMP && (f.flags & L1_FRAME_DISCONTINUITY)) jump = true;
        if (f.flags & L1_FRAME_DUPLICATES_REMOVED) dup = true;
        if ((f.flags & L1_FRAME_GAP_LENGTH_UNKNOWN) && f.gap_reason == L1_GAP_DEVICE_GLITCH) glitch = true;
    }
    CHECK(jump && dup && glitch);
    CHECK(r.v.partial_frames >= 2);   // frames end at the gaps instead of spanning them
    {   // glitch flag on the very first packet is the stream start, not a gap
        Rig q;
        q.feed(0, 480, true, true);
        q.read_all(true);
        CHECK(q.v.gap_records == 0 && !(q.frames[0].flags & L1_FRAME_GAP_LENGTH_UNKNOWN));
    }
    t::end("T10", "Packet discontinuity", "220 skipped frames reported as a gap of 220; 180 repeated frames removed and flagged; OS glitch flagged as unknown-length gap; no frame spans a gap");
}

static void overflow() {
    t::begin("T12", "Producer outruns consumer (transport level)");
    Rig r(4096, 256);
    int64_t pos = 0;
    for (int i = 0; i < 20; ++i) { r.feed(pos, 480); pos += 480; }   // 9600 frames into 4096 capacity
    CHECK(r.c.frames_dropped_overflow.load() == 9600 - 4096);
    CHECK(r.c.queue_high_water.load() == 4096);
    r.read_all();
    for (int i = 0; i < 5; ++i) { r.feed(pos, 480); pos += 480; }    // consumer has caught up
    r.read_all(true);
    r.v.print();
    CHECK(r.v.clean());
    CHECK(r.v.dropped_sum == 9600 - 4096);
    bool marked = false;
    for (auto& f : r.frames)
        if (f.dropped_frames_before == 9600 - 4096 && f.gap_reason == L1_GAP_TRANSPORT_OVERFLOW) marked = true;
    CHECK(marked);
    CHECK(r.v.frames_total + r.v.dropped_sum == (uint64_t)pos);
    t::end("T12", "Producer outruns consumer", "capacity 4096, 9600 pushed: 4096 kept (oldest), 5504 newest dropped, one gap record of 5504; delivered + dropped = captured");
}

static void epochs() {
    t::begin("T06/T07-logic", "Stream restart and device reset create a new epoch");
    Rig r;
    r.feed(0, 1000);
    r.read_all();
    r.start_epoch(2, 44100, 1);      // e.g. reopened after unplug, or rate change 48k -> 44.1k
    r.feed(0, 1000);
    r.read_all(true);
    bool flushed = false, fresh = false;
    for (auto& f : r.frames) {
        if (f.stream_epoch == 1 && (f.flags & L1_FRAME_LAST_OF_EPOCH) && (f.flags & L1_FRAME_PARTIAL)) flushed = true;
        if (f.stream_epoch == 2 && (f.flags & L1_FRAME_NEW_EPOCH)) {
            fresh = f.first_sample_index == 0 && (f.flags & L1_FRAME_DISCONTINUITY) &&
                    f.gap_reason == L1_GAP_STREAM_RESTART && f.sample_rate_hz == 44100;
        }
    }
    CHECK(flushed && fresh);
    CHECK(r.v.index_errors == 0 && r.v.unflagged_gaps == 0);
    // Device position jumps back by more than a second: device reset.
    Rig q;
    for (int64_t pos = 0; pos < 96000; pos += 4800) { q.feed(pos, 4800); q.read_all(); }
    q.feed(10, 480);
    q.read_all(true);
    bool reset = false;
    for (auto& f : q.frames)
        if (f.stream_epoch == 2 && (f.flags & L1_FRAME_NEW_EPOCH) && f.gap_reason == L1_GAP_DEVICE_RESET && f.first_sample_index == 0) reset = true;
    CHECK(reset);
    t::end("T06/T07-logic", "Epochs", "restart flushes the partial frame (LAST_OF_EPOCH), next epoch starts at index 0 with NEW_EPOCH + DISCONTINUITY + new rate; backward device position > 1 s becomes a DEVICE_RESET epoch");
}

static float phase_opposed(int64_t i, uint32_t c) {
    float s = 0.5f * (float)std::sin(2 * M_PI * 440.0 * (double)i / 48000.0);
    return c == 0 ? s : -s;
}

static void channels() {
    t::begin("T04", "Stereo / mic array: channels preserved or explicitly chosen");
    double rms_all[2] = {0, 0}, rms_avg = 0, rms_sel = 0;
    {
        Rig r(8192, 256, 2, L1_CHANNELS_ALL);
        r.feed(0, 4800, true, false, false, phase_opposed);
        r.read_all(true, false);
        uint64_t n = 0;
        for (size_t i = 0; i < r.frames.size(); ++i) {
            CHECK(r.frames[i].channels == 2 && r.frames[i].channel_mode == L1_CHANNELS_ALL);
            for (uint32_t f = 0; f < r.frames[i].frame_count; ++f) {
                int64_t idx = r.frames[i].first_sample_index + f;
                for (uint32_t c = 0; c < 2; ++c) {
                    float v = r.data[i][f * 2 + c];
                    CHECK(v == phase_opposed(idx, c));
                    rms_all[c] += v * v;
                }
                ++n;
            }
        }
        rms_all[0] = std::sqrt(rms_all[0] / n); rms_all[1] = std::sqrt(rms_all[1] / n);
    }
    {
        Rig r(8192, 256, 2, L1_CHANNELS_AVERAGE);
        r.feed(0, 4800, true, false, false, phase_opposed);
        r.read_all(true, false);
        uint64_t n = 0;
        for (auto& d : r.data) for (float v : d) { rms_avg += v * v; ++n; }
        rms_avg = std::sqrt(rms_avg / n);
        CHECK(r.frames[0].channel_mode == L1_CHANNELS_AVERAGE && r.frames[0].channels == 1);
    }
    {
        Rig r(8192, 256, 2, L1_CHANNELS_SELECT);
        r.start_epoch(2, 48000, 2, L1_CHANNELS_SELECT, 1);
        r.feed(0, 4800, true, false, false, phase_opposed);
        r.read_all(true, false);
        uint64_t n = 0; bool exact = true;
        for (size_t i = 0; i < r.frames.size(); ++i) {
            if (r.frames[i].stream_epoch != 2) continue;
            for (uint32_t f = 0; f < r.frames[i].frame_count; ++f) {
                float v = r.data[i][f];
                if (v != phase_opposed(r.frames[i].first_sample_index + f, 1)) exact = false;
                rms_sel += v * v; ++n;
            }
        }
        rms_sel = std::sqrt(rms_sel / n);
        CHECK(exact);
    }
    {   // more channels than kMaxChannels: the first 8 are delivered, labelled 8
        Rig r(8192, 256, 12, L1_CHANNELS_ALL);
        r.feed(0, 1000);
        r.read_all(true, false);
        CHECK(r.frames[0].channels == 8);
        CHECK(r.data[0][3] == sim_counter_value(0, 3) && r.data[0][8 + 7] == sim_counter_value(1, 7));
    }
    CHECK(rms_avg < 1e-6);   // documents the hazard: averaging opposed channels cancels them
    t::end("T04", "Channels", "ALL keeps both phase-opposed channels exactly (RMS %.3f/%.3f); SELECT delivers channel 1 exactly; AVERAGE cancels them (RMS %.1e) so it is opt-in only",
           rms_all[0], rms_all[1], rms_avg);
}

static float hot(int64_t i, uint32_t) {
    if (i == 100) return NAN;
    if (i == 101) return INFINITY;
    return 1.2f * (float)std::sin(2 * M_PI * 220.0 * (double)i / 48000.0);
}

static void clipping() {
    t::begin("T24-detect", "Clipping and non-finite detection");
    Rig r;
    r.feed(0, 4800, true, false, false, hot);
    r.read_all(true, false);
    uint64_t clipped = 0, bad = 0;
    bool finite = true;
    for (size_t i = 0; i < r.frames.size(); ++i) {
        clipped += r.frames[i].clipped_samples;
        bad += r.frames[i].nonfinite_samples;
        for (float v : r.data[i]) if (!std::isfinite(v)) finite = false;
    }
    CHECK(bad == 2);
    CHECK(clipped > 1000);
    CHECK(finite);
    CHECK(r.frames[0].flags & L1_FRAME_NONFINITE);
    CHECK(r.frames[0].flags & L1_FRAME_CLIPPED);
    CHECK(r.frames[0].peak_dbfs > 1.0f);
    t::end("T24-detect", "Clipping detection", "1.2x overload: %llu clipped samples flagged, peak %.1f dBFS; NaN/Inf counted (%llu) and replaced by 0",
           (unsigned long long)clipped, r.frames[0].peak_dbfs, (unsigned long long)bad);
}

static void small_buffer() {
    t::begin("API-1", "Too-small buffer keeps the frame for a retry");
    Rig r;
    r.feed(0, 480);
    l1_frame_info fi;
    float tiny[16];
    int32_t rc = r.a.read(&fi, tiny, 16, nullptr, 0, 0, r.idle);
    CHECK(rc == L1_ERR_BUFFER_TOO_SMALL);
    r.read_all(true);
    CHECK(r.v.clean() && r.v.frames_total == 480);
    t::end("API-1", "Buffer too small", "frame retained and delivered intact on retry");
}

int main() {
    basic();
    silent_packets();
    timestamp_errors();
    discontinuities();
    overflow();
    epochs();
    channels();
    clipping();
    small_buffer();
    return t::finish("test_pipeline");
}
