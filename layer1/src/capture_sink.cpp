#include "capture_sink.h"

#include <algorithm>

namespace l1 {

// A backward device-position move larger than this is a device reset (new
// epoch), not a few repeated frames. One second of audio.
static uint64_t reset_threshold(uint32_t rate) { return rate; }

void CaptureSink::begin_epoch(const EpochParams& p) {
    const uint32_t prev_epoch = p_.epoch;
    const bool had_epoch = started_;
    p_ = p;
    // The sink may have advanced the epoch itself (device reset); never reuse one.
    if (had_epoch && p_.epoch <= prev_epoch) p_.epoch = prev_epoch + 1;
    started_ = true;
    out_ch_ = p.channel_mode == L1_CHANNELS_ALL ? std::min(p.device_channels, kMaxChannels) : 1;
    if (p.max_packet_frames > scratch_frames_) {
        scratch_.reset(new float[(size_t)p.max_packet_frames * kMaxChannels]);
        scratch_frames_ = p.max_packet_frames;
    }
    have_expected_ = false;
    expected_position_ = 0;
    next_index_ = 0;
    first_packet_ = true;
    pending_drop_ = 0;
    pending_reason_ = p.epoch > 1 ? L1_GAP_STREAM_RESTART : L1_GAP_NONE;
    pending_flags_ = 0;
    period_ns_ = p.sample_rate ? (int64_t)p.period_frames * 1000000000LL / p.sample_rate : 10000000;
    c_.epochs_started.fetch_add(1, std::memory_order_relaxed);
}

void CaptureSink::note_callback(int64_t duration_ns) {
    c_.callback_us.add(duration_ns / 1000.0);
    if (duration_ns > period_ns_) c_.callback_overruns.fetch_add(1, std::memory_order_relaxed);
}

void CaptureSink::on_packet(const DevicePacket& pkt) {
    const int64_t arrival = now_ns();
    c_.packets_received.fetch_add(1, std::memory_order_relaxed);
    c_.frames_received.fetch_add(pkt.frames, std::memory_order_relaxed);
    if (pkt.silent) c_.silent_packets.fetch_add(1, std::memory_order_relaxed);
    if (!pkt.time_valid) c_.timestamp_errors.fetch_add(1, std::memory_order_relaxed);
    if (pkt.frames == 0) return;

    // OS glitch flag. On the first packet of a stream it only marks the stream
    // start (there is no earlier packet to be discontinuous with).
    if (pkt.device_glitch) {
        c_.device_glitches.fetch_add(1, std::memory_order_relaxed);
        if (!first_packet_) {
            pending_flags_ |= PKT_GAP_UNKNOWN;
            if (pending_reason_ == L1_GAP_NONE) pending_reason_ = L1_GAP_DEVICE_GLITCH;
        }
    }

    uint32_t skip = 0;  // leading frames already delivered (device repeated them)
    if (pkt.position_valid && have_expected_) {
        if (pkt.device_position > expected_position_) {
            // Device skipped ahead: frames were lost before this packet.
            uint64_t jump = pkt.device_position - expected_position_;
            next_index_ += (int64_t)jump;
            pending_drop_ += jump;
            if (pending_reason_ == L1_GAP_NONE) pending_reason_ = L1_GAP_DEVICE_POSITION_JUMP;
            c_.frames_dropped_device.fetch_add(jump, std::memory_order_relaxed);
        } else if (pkt.device_position < expected_position_) {
            uint64_t back = expected_position_ - pkt.device_position;
            if (back >= pkt.frames && back > reset_threshold(p_.sample_rate)) {
                // Device position restarted: close the old epoch (reporting any
                // pending loss), start a new one at index 0.
                emit_terminal();
                p_.epoch += 1;
                next_index_ = 0;
                pending_drop_ = 0;
                pending_reason_ = L1_GAP_DEVICE_RESET;
                pending_flags_ = 0;
                c_.epochs_started.fetch_add(1, std::memory_order_relaxed);
            } else if (back >= pkt.frames) {
                // Entire packet repeats audio we already delivered.
                c_.frames_duplicate_discarded.fetch_add(pkt.frames, std::memory_order_relaxed);
                return;
            } else {
                skip = (uint32_t)back;
                pending_flags_ |= PKT_DUPLICATES;
                c_.frames_duplicate_discarded.fetch_add(skip, std::memory_order_relaxed);
            }
        }
    }
    if (pkt.position_valid) {
        expected_position_ = pkt.device_position + pkt.frames;
        have_expected_ = true;
    } else if (have_expected_) {
        expected_position_ += pkt.frames;
    }
    first_packet_ = false;

    const uint32_t frames = pkt.frames - skip;
    const int64_t time = pkt.time_ns + (p_.sample_rate ? (int64_t)skip * 1000000000LL / p_.sample_rate : 0);

    // Channel mapping into scratch when not delivering all channels as-is.
    const float* src = nullptr;
    if (!pkt.silent && pkt.data) {
        const float* in = pkt.data + (size_t)skip * p_.device_channels;
        const uint32_t dch = p_.device_channels;
        if (p_.channel_mode == L1_CHANNELS_ALL && dch <= kMaxChannels) {
            src = in;
        } else {
            uint32_t n = std::min(frames, scratch_frames_);
            float* o = scratch_.get();
            if (p_.channel_mode == L1_CHANNELS_ALL) {             // > kMaxChannels: keep the first 8
                for (uint32_t f = 0; f < n; ++f)
                    for (uint32_t ch = 0; ch < kMaxChannels; ++ch) o[f * kMaxChannels + ch] = in[f * dch + ch];
            } else if (p_.channel_mode == L1_CHANNELS_SELECT) {
                const uint32_t sel = std::min(p_.select_channel, dch - 1);
                for (uint32_t f = 0; f < n; ++f) o[f] = in[f * dch + sel];
            } else {
                const float k = 1.0f / (float)dch;
                for (uint32_t f = 0; f < n; ++f) {
                    float s = 0;
                    for (uint32_t ch = 0; ch < dch; ++ch) s += in[f * dch + ch];
                    o[f] = s * k;
                }
            }
            src = o;
            if (n < frames) {  // larger than the scratch: deliver the prefix, record the rest as lost
                push(src, n, next_index_, time, pkt.time_valid, false, arrival);
                next_index_ += n;
                uint32_t lost = frames - n;
                pending_drop_ += lost;
                if (pending_reason_ == L1_GAP_NONE) pending_reason_ = L1_GAP_TRANSPORT_OVERFLOW;
                c_.frames_dropped_overflow.fetch_add(lost, std::memory_order_relaxed);
                next_index_ += lost;
                return;
            }
        }
    }
    push(src, frames, next_index_, time, pkt.time_valid, pkt.silent || !pkt.data, arrival);
    next_index_ += frames;
}

void CaptureSink::end_epoch() { emit_terminal(); }

void CaptureSink::emit_terminal() {
    if (pending_drop_ == 0 && !(pending_flags_ & PKT_GAP_UNKNOWN)) return;
    // One descriptor slot is always kept free for this marker (see push()).
    if (t_.packets.free_space() == 0) {
        c_.unreported_tail.fetch_add(pending_drop_, std::memory_order_relaxed);
    } else {
        PacketDesc d{};
        d.first_index = next_index_;
        d.time_ns = 0;
        d.arrival_ns = now_ns();
        d.dropped_before = pending_drop_;
        d.frames = 0;
        d.flags = PKT_END | pending_flags_;
        d.epoch = p_.epoch;
        d.gap_reason = pending_reason_;
        d.sample_rate = p_.sample_rate;
        d.ts_source = p_.ts_source;
        d.channels = (uint16_t)out_ch_;
        d.channel_mode = (uint16_t)p_.channel_mode;
        t_.packets.write(&d, 1);
        t_.packets.publish();
        t_.signal.wake();
    }
    pending_drop_ = 0;
    pending_reason_ = L1_GAP_NONE;
    pending_flags_ = 0;
}

void CaptureSink::push(const float* src, uint32_t frames, int64_t first_index, int64_t time_ns,
                       bool time_valid, bool silent, int64_t arrival_ns) {
    const uint32_t ch = out_ch_;
    // Space in frames: bounded by the configured capacity, the float ring and descriptors.
    const uint32_t queued = t_.queued_frames();
    uint32_t fit = queued >= t_.capacity_frames ? 0 : t_.capacity_frames - queued;
    fit = std::min<uint32_t>(fit, (uint32_t)(t_.samples.free_space() / ch));
    if (t_.packets.free_space() <= 1) fit = 0;   // last slot reserved for end-of-epoch markers
    fit = std::min(fit, frames);

    if (fit > 0) {
        t_.samples.write(silent ? nullptr : src, (size_t)fit * ch);
        PacketDesc d{};
        d.first_index = first_index;
        d.time_ns = time_ns;
        d.arrival_ns = arrival_ns;
        d.dropped_before = pending_drop_;
        d.frames = fit;
        d.flags = (silent ? (uint32_t)PKT_SILENT : 0u) | (time_valid ? (uint32_t)PKT_TS_VALID : 0u) | pending_flags_;
        d.epoch = p_.epoch;
        d.gap_reason = pending_reason_;
        d.sample_rate = p_.sample_rate;
        d.ts_source = p_.ts_source;
        d.channels = (uint16_t)ch;
        d.channel_mode = (uint16_t)p_.channel_mode;
        t_.samples.publish();       // samples first,
        t_.packets.write(&d, 1);
        t_.packets.publish();       // then the descriptor that makes them readable
        uint64_t pushed = t_.frames_pushed.load(std::memory_order_relaxed) + fit;
        t_.frames_pushed.store(pushed, std::memory_order_release);
        pending_drop_ = 0;
        pending_reason_ = L1_GAP_NONE;
        pending_flags_ = 0;
        uint32_t occ = queued + fit;
        uint32_t hw = c_.queue_high_water.load(std::memory_order_relaxed);
        while (occ > hw && !c_.queue_high_water.compare_exchange_weak(hw, occ, std::memory_order_relaxed)) {}
        t_.signal.wake();
    }
    if (fit < frames) {
        // Tail-drop: the newest frames that do not fit are lost. The next
        // accepted packet carries the gap and its index jumps by the same count.
        uint32_t lost = frames - fit;
        pending_drop_ += lost;
        if (pending_reason_ == L1_GAP_NONE) pending_reason_ = L1_GAP_TRANSPORT_OVERFLOW;
        c_.frames_dropped_overflow.fetch_add(lost, std::memory_order_relaxed);
    }
}

} // namespace l1
