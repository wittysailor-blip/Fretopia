# Layer 1 → Layer 2 interface (API version 1)

Layer 2 (pitch, onsets, chords) consumes Layer 1 through **one reader thread** calling `l1_read_frame`. Each call returns one `l1_frame_info` plus the samples.

```c
l1_frame_info fi;
float data[256 * 8];        // frame_size * max channels
int rc = l1_read_frame(engine, &fi, data, 256 * 8, /*raw*/ NULL, 0, /*timeout ms*/ 100);
// rc: L1_OK (one frame), L1_TIMEOUT (nothing yet / stopped), L1_ERR_BUFFER_TOO_SMALL (frame kept; retry)
```

The samples are **float32, interleaved**, `fi.channels` wide, `fi.frame_count` frames, at nominal full scale ±1.0. They are copied into your buffer, which you own afterwards.

## Fields

| Field | Meaning |
|---|---|
| `api_version`, `struct_size` | `1`, `sizeof(l1_frame_info)` (128 bytes) |
| `stream_id` | Random per engine instance |
| `stream_epoch` | Increments on every (re)start; 1 for the first stream |
| `sample_rate_hz`, `channels`, `channel_mode` | Actual format of **this** frame. These can change only at a new epoch |
| `sample_format` | Always 1 (float32 interleaved) |
| `first_sample_index` | Absolute index of the first frame in the epoch |
| `frame_count` | Samples per channel. Normally `frame_size`, less if `PARTIAL`, 0 only for an end-of-epoch loss report |
| `capture_time_ns` | Capture time of the first sample on the `l1_now_ns()` clock. 0 if `TIMESTAMP_INVALID` |
| `timestamp_uncertainty_ns` | About 3σ. −1 if invalid |
| `timestamp_source` | `DEVICE_QPC` (WASAPI), `SIMULATED`, … |
| `flags` | See below |
| `dropped_frames_before`, `gap_reason` | Frames missing immediately before this frame, and why |
| `sequence` | Frame counter for this engine; never resets |
| `ready_time_ns` | When `l1_read_frame` returned it (same clock) |
| `rms_dbfs`, `peak_dbfs` | Level of the raw input in this frame |
| `noise_floor_dbfs` | Running quiet-frame estimate (10th percentile of the last ~2.7 s) |
| `clipped_samples`, `nonfinite_samples` | Counts in this frame (non-finite values are replaced by 0) |
| `silent_frames` | Frames that the OS marked silent (delivered as zeros) |
| `gain_db` | Digital gain applied by conditioning |

## Flags

| Flag | What Layer 2 should do |
|---|---|
| `NEW_EPOCH` | **Reset all state**: filters, onset history, note tracking, model context. The index restarts at 0 and the format may differ |
| `DISCONTINUITY` | Samples are missing before this frame (see `dropped_frames_before`). Do not run filters or onset detectors across the boundary as if continuous; treat the history as stale |
| `GAP_LENGTH_UNKNOWN` | The OS reported a glitch but not its length. The index did not advance across it, so timing across the gap is unreliable |
| `DUPLICATES_REMOVED` | The device repeated audio; Layer 1 removed the repeats. Informational |
| `PARTIAL` | Shorter frame because a gap, epoch end or stop follows |
| `LAST_OF_EPOCH` | Nothing more in this epoch. With `frame_count = 0` it only reports trailing loss |
| `TIMESTAMP_ESTIMATED` | Time extrapolated, not measured for this packet. Use the uncertainty |
| `TIMESTAMP_INVALID` | No time available. Do not use this frame for timing decisions |
| `SILENT` | The OS marked (part of) the frame silent. The samples are zeros, not real quiet audio |
| `CLIPPED` | At least one sample at or above `clip_threshold` (0.999). Harmonics are unreliable; suggest lowering the input level |
| `NONFINITE` | NaN or Inf from the device, replaced by 0 |
| `CONDITIONED` | Optional conditioning changed the data (the `raw` buffer is unconditioned) |

## Rules Layer 2 can rely on (tested)

1. **Order:** samples arrive exactly in capture order. No duplicates, no reordering (T11, T30).
2. **Contiguity:** within an epoch, `first_sample_index == previous.first_sample_index + previous.frame_count + dropped_frames_before`. A jump is never silent: it always comes with `DISCONTINUITY` (gate 3).
3. **Loss accounting:** every lost frame appears in exactly one frame's `dropped_frames_before`. That includes loss at the very end of a stream (zero-length `LAST_OF_EPOCH` frame). The engine counters reconcile: `delivered + overflow + duplicates = received` (T30).
4. **No manufactured audio:** Layer 1 never fills a gap with samples. The only zeros it writes are OS-declared silent packets (`SILENT`) and replaced NaN/Inf values (`NONFINITE`).
5. **Time:** `capture_time_ns` never decreases within an epoch. Sample *i* of a frame is at `capture_time_ns + round(i × 1e9 / sample_rate_hz)`.
6. **Frames never span a gap or an epoch boundary.**

## Stopping

After `l1_stop` returns, frames already captured stay readable. That includes the last partial frame, which is flushed with `LAST_OF_EPOCH`. Keep calling `l1_read_frame` with timeout 0 until it returns `L1_TIMEOUT` to drain them; `Layer1Capture.Stop()` does this. Frames you leave unread are delivered on the next read after a restart, labelled with their old `stream_epoch`. Layer 1 never drops them silently.

## Things Layer 2 must not assume

- That `capture_time_ns` is the acoustic onset. It is the endpoint capture time; device/ADC delay and acoustic travel are not included. Your own analysis window adds algorithmic delay on top. Measure each stage separately (test plan §6).
- That frames arrive at a steady rate. They arrive in bursts that follow the device period and your reading cadence.
- That `frame_size` divides your analysis hop. Assemble your own windows from the index (the spec leaves window/hop to Layer 2, decision D05).
- That the format is fixed. Re-read `sample_rate_hz` and `channels` on `NEW_EPOCH`.
- That a frame with `CLIPPED`, `SILENT` or `TIMESTAMP_INVALID` is good for scoring.

## Recommended Layer 2 loop

```c
for (;;) {
    int rc = l1_read_frame(e, &fi, buf, cap, NULL, 0, 100);
    if (rc == L1_TIMEOUT) continue;            // or check a stop flag
    if (rc != L1_OK) { handle(rc); continue; }
    if (fi.flags & L1_FRAME_NEW_EPOCH)   layer2_reset(fi.sample_rate_hz, fi.channels);
    else if (fi.flags & L1_FRAME_DISCONTINUITY) layer2_mark_gap(fi.dropped_frames_before);
    if (fi.frame_count) layer2_push(buf, fi.frame_count, fi.first_sample_index, fi.capture_time_ns, fi.flags);
}
```

Keep the per-frame work short: a 256-frame frame at 48 kHz arrives every 5.3 ms. If Layer 2 needs more time per frame on average, it has to decimate or batch. The transport (8192 frames = 170 ms by default) absorbs only short stalls; past that, loss is reported, not hidden.

## Versioning

- Breaking changes increment `L1_API_VERSION`.
- Structs carry `api_version` and `struct_size`. `l1_create` rejects a config whose version or size doesn't match.
- The C# bridge checks every struct size at startup (`Layer1Native.CheckLayout`).
- A future optional feature extractor (for example a spectral representation for a model) will be a **separate, separately versioned** interface. It will not be added to this frame contract (spec §3, decision D10).
