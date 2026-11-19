# Layer 1 architecture

Layer 1 turns a microphone into a stream of **timestamped, gap-annotated PCM frames** for Layer 2. It does not analyse music. It is written from public APIs and the independent specification (`SPECIFICATION.md` in the Layer 1 handoff). It contains no proprietary code, constants or models.

## Data flow

```
 OS audio engine ──event──▶ capture thread (real time)          control thread              consumer thread (Layer 2)
                            ┌───────────────────────────┐        ┌──────────────────┐        ┌──────────────────────────┐
  WASAPI GetBuffer ───────▶ │ backend: format → float32 │        │ open / close     │        │ l1_read_frame()          │
  (or simulated device)     │ CaptureSink               │        │ device lost      │        │  Assembler               │
                            │  • validate device pos.   │        │ default changed  │        │   • frames of N samples  │
                            │  • absolute sample index  │        │ format changed   │        │   • never span a gap     │
                            │  • channel select         │        │ reconnect →      │        │   • timestamps (clock    │
                            │  • gap bookkeeping        │        │   new epoch      │        │     fit, monotonic)      │
                            │  • write samples, then    │        │ events queue     │        │   • levels, clipping,    │
                            │    packet descriptor      │        └──────────────────┘        │     NaN, noise floor     │
                            └─────────────┬─────────────┘                                    │   • optional conditioning│
                                          │   SPSC transport (preallocated)                   └────────────▲─────────────┘
                                          └──▶ float ring + descriptor ring ──────────────────────────────┘
```

| Module | File | Thread | Real-time rules |
|---|---|---|---|
| Public C API, control thread | `src/engine.cpp` | caller + control | none (not on audio path) |
| WASAPI backend | `src/backend_wasapi.cpp` | capture + control | capture loop: no allocation, no locks, no waits except the device event |
| Simulated device | `src/backend_sim.cpp` | capture | same as above; used by the tests |
| Capture adapter | `src/capture_sink.{h,cpp}` | capture | no allocation, locks, waits or exceptions |
| SPSC ring | `src/spsc.h` | both | lock-free, wait-free push/pop |
| Frame assembler | `src/assembler.{h,cpp}`, `src/conditioning.h` | consumer | consumer-owned, never touched by the capture thread |
| Clock, wake signal, sleep | `src/platform.{h,cpp}` | any | `Signal::wake()` is a single non-blocking syscall |

## Transport

There are two single-producer / single-consumer rings, both sized once in `l1_create`:

- **Sample ring:** float32, interleaved, `capacity_frames × 8` floats.
- **Descriptor ring:** one `PacketDesc` per accepted packet. Each descriptor holds the first sample index, frame count, capture time and validity, epoch, sample rate, channels, and the gap carried in front of the packet.

**Ownership and ordering**

- Each ring index has exactly one writer. The producer writes `write_` and the consumer writes `read_`.
- The producer copies the samples, publishes the sample ring (release), then writes and publishes the descriptor (release).
- The consumer acquires the descriptor ring before reading. That makes the samples behind the descriptor visible.
- The consumer frees space with a release store. The producer acquires it before overwriting.

**Occupancy** is tracked in frames, so the configured capacity means the same amount of time whatever the channel count.

**Overflow policy: tail-drop.** When the consumer falls behind, the packet prefix that fits is kept and the newest frames are dropped.

- Already-queued audio is never overwritten.
- The number of lost frames is added to a pending gap. The next accepted packet carries it as `dropped_before` and `gap_reason = TRANSPORT_OVERFLOW`, and its sample index jumps by exactly that count.
- One descriptor slot is always reserved for an **end-of-epoch marker**. This is a zero-length descriptor carrying loss that happened after the last accepted packet, such as at stop or on device loss. Without it, trailing loss would never reach Layer 2.

Tail-drop was chosen over drop-oldest because it never touches memory the consumer may be reading, and it keeps the capture thread wait-free. Either way, the gap is reported exactly.

## Sample timeline

The adapter owns the **absolute sample index**, which counts frames from the start of the epoch. On every packet it compares the device position with the expected position:

| Device position vs expected | Meaning | Action |
|---|---|---|
| equal | continuous | deliver |
| ahead by *k* | the device lost *k* frames | index += *k*, gap `DEVICE_POSITION_JUMP` of *k* |
| behind, overlapping | the device repeated frames | skip the repeated prefix, flag `DUPLICATES_REMOVED` |
| behind by the whole packet, < 1 s | a repeated packet | discard it, count as duplicates |
| behind by > 1 s | device reset | end-of-epoch marker, new epoch at index 0, `DEVICE_RESET` |
| OS `DATA_DISCONTINUITY` flag | glitch of unknown length | flag `GAP_LENGTH_UNKNOWN`, invalidate the time anchor |

The OS discontinuity flag on the first packet of a stream marks the stream start and is not counted as a gap.

**Epochs.** A new epoch starts whenever a stream is opened, after a stop/start, device loss and reconnect, a default-device change, a format change or a device reset.

- The first frame of an epoch has `NEW_EPOCH`. Every epoch after the first also has `DISCONTINUITY` and a reason.
- The index restarts at 0.
- Layer 2 must reset its state on `NEW_EPOCH`.

## Timestamps

- **Clock.** All times use `l1_now_ns()`. On Windows that is `QueryPerformanceCounter` converted to ns. WASAPI's per-packet `pu64QPCPosition` is in 100 ns units of the same counter (Microsoft docs, `IAudioCaptureClient::GetBuffer`), so `qpc × 100` is the capture time of the packet's first frame.
- **Smoothing.** Packet timestamps jitter. The consumer keeps an **exponentially weighted least-squares fit** of time against index per epoch (centred coordinates, time constant about 1000 packets). It times frames from the fit, which also measures the device clock's drift and the timestamp jitter. Points that disagree with the fit by more than 20 ms are treated as faults. Eight in a row reset the fit, because then the clock really moved.
- **Before the fit is ready** (the first 16 packets, about 160 ms): raw packet time + offset × nominal sample period.
- **No valid timestamp.** A packet without one (WASAPI `TIMESTAMP_ERROR`, or a QPC of 0) is timed from the fit or the last anchor and flagged `TIMESTAMP_ESTIMATED`. Its uncertainty grows by 200 ppm × distance from the anchor. With no anchor at all the frame is `TIMESTAMP_INVALID` with time 0. Layer 1 does not invent a time.
- **Monotonic.** Capture times never decrease within an epoch.
- **Uncertainty.** `timestamp_uncertainty_ns` is 3 × RMS jitter + 1 sample, plus extrapolation growth.
- **Scope of `capture_time_ns`.** It is the time the endpoint reported for the first sample. It does **not** include acoustic travel, ADC/driver delay inside the device, or any analysis window. Those must be measured end to end (test plan §6).

## Frames delivered to Layer 2

Frames have `frame_size` samples per channel (default 256), with these exceptions:

- A frame ends early (`PARTIAL`) instead of spanning a gap or an epoch boundary.
- The last frame before a stop is flushed early.
- An end-of-epoch marker frame has `frame_count = 0`.

The data is copied out to the caller's buffer, so there is no shared-lifetime contract across the API. Diagnostics are computed per frame on the raw samples: RMS, peak, clipped count, non-finite count (replaced by 0 and flagged) and noise floor (10th percentile of the last 512 frame levels).

## Optional conditioning (off by default)

| Stage | Default | What it does | Measured effect (tests/test_conditioning) |
|---|---|---|---|
| DC blocker | off | 1-pole high-pass, 5 Hz | open strings: fundamental change < 0.06 dB, attack peak change < 0.5 dB |
| Hum notch | off | RBJ notch, Q 30, at 50 or 60 Hz | −45 dB hum; E2 fundamental ±0.00 dB |
| Hum harmonics | 1 (only the fundamental) | extra notches at 2×, 3× | **costs G2 −2.3 dB (100 Hz notch), B2 −1.3 dB (120 Hz notch)**, so it is opt-in |
| Digital gain | 0 dB | multiply | — |

When conditioning is off, the delivered samples are bit-identical to the capture. When it is on, `raw` still returns the unconditioned samples.

## Threads and lifetime

- **Engine creation.** `l1_create` allocates everything and starts the control thread. On Windows, that thread does all WASAPI open/close work in a COM MTA, so the caller's apartment (for example Unity's STA main thread) never matters.
- **Start and stop.** `l1_start` and `l1_stop` are commands executed by the control thread. The caller waits for the result.
- **Events.** Device notifications (`IMMNotificationClient`) and capture-loop failures are posted to the control thread, which stops the backend, writes the end-of-epoch marker, posts an `l1_event`, and either reconnects (new epoch) or stops.
- **Capture thread.** It registers with MMCSS ("Pro Audio", falling back to "Audio"). MMCSS raises priority; it does **not** guarantee the thread is never preempted, so deadline overruns are measured and reported (`callback_overruns`).

## Platform notes

- Windows 8 or later (`WaitOnAddress`). Windows 10 1803 or later for the high-resolution timer used only by the simulated device and tests (Sleep is the fallback).
- The build has no runtime dependencies beyond system DLLs (`kernel32`, `ole32`, `avrt`, `msvcrt` or the MSVC runtime, `api-ms-win-core-synch`).
- Non-Windows builds include only the simulated backend (for tests). Android (AAudio/Oboe) and Apple (AudioUnit) backends fit the same `Backend` interface but are not written.
