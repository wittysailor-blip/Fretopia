# Layer 1 test results

**Date:** 19 November 2026. **Build:** layer1 0.1.0 (branch `layer1-engine`).

**Environments**

- **Linux:** Ubuntu 24.04 x86_64, GCC 13. Also built with ThreadSanitizer and with AddressSanitizer + UndefinedBehaviorSanitizer.
- **Windows:** Windows Server 2022 GitHub runner, 10.0.20348. The full suite ran twice, once from the MSVC 2022 build and once from the MinGW-w64 cross-compiled binaries that ship as `fretopia_l1.dll`.
- **Unity bridge:** C# compiled with Mono `mcs` and run against the Linux library.

Machine-readable rows in the handoff's `RESULTS_TEMPLATE.csv` layout are in `results/layer1_results.csv`. The raw per-suite CSVs and the Windows CI summary are in the same folder.

> **What "sim" means.** Most cases run the real engine (capture thread, transport, control thread, consumer) against a **simulated microphone**. It has seeded fault injection and a known ground-truth clock. This proves Layer 1's own logic. It does **not** prove how a real Windows microphone driver behaves. Those cases are marked *not run* below and listed in [HARDWARE_TESTS.md](HARDWARE_TESTS.md).

## Engineering correctness gates (test plan §5)

| Gate | Status | Evidence |
|---|---|---|
| 1. No unbounded allocation, unhandled exception or blocking stall in the real-time callback | **Pass** (Layer 1 code, simulated device) | Allocation audit counts every `new` on the capture thread: 0 over 30M frames with all faults (T30) and over 60 minutes of audio (T14-sim). No locks or waits in `CaptureSink`/`SpscRing` (code review). Callback stayed in microseconds while the consumer stalled for 300 ms (T12). The WASAPI loop itself is code-reviewed only; it has not run on a microphone |
| 2. Every sample loss, reset and invalid timestamp visible in logs and Layer 2 metadata | **Pass** | T30: the sum of all `dropped_frames_before` equals overflow + device-skip counters exactly. Trailing loss is carried by an end-of-epoch frame (found and fixed during testing). T09: invalid/estimated time flags. T06/T07: epochs |
| 3. Index never silently goes backward or jumps | **Pass** | Every frame in every test goes through `Verifier`: 0 backward moves, 0 unflagged jumps across all runs |
| 4. Order preserved exactly in no-loss tests | **Pass** | T11 (52M items), T16 bit-exact guitar, T14-sim 172.8M frames, C# smoke test every sample checked |
| 5. Device disappearance/change → safe teardown and fresh epoch | **Pass in simulation**; WASAPI path not exercised on hardware | T06-sim, T07-sim, device-reset case, 40 start/stop cycles, destroy while running |
| 6. Cross-platform data labelled, not assumed equivalent | **Pass** | Every frame carries rate, channels, channel mode, timestamp source. Mobile backends do not exist yet and are not claimed |

## Stage A: correctness

| Test | Linux | Windows (CI) | Result |
|---|---|---|---|
| T01 permissions | sim pass | sim pass + **real WASAPI**: no device → `L1_ERR_NO_DEVICE` + event, no crash | Real *permission-denied* run still needed |
| T02 built-in mic | — | — | **Not run** (needs microphone) |
| T03 USB mic | — | — | **Not run** |
| T04 stereo / array | logic pass | logic pass | All channels kept exactly; averaging opposed channels cancels them (RMS 0), so averaging is opt-in. Real array mic **not run** |
| T05 period negotiation | sim pass | sim pass | Real IAudioClient3 negotiation **not run** |
| T06 hot-plug | sim pass | sim pass | Real unplug **not run** |
| T07 rate change | sim pass | sim pass | Real rate change **not run** |
| T08 silent packet | pass | pass | 480 OS-silent frames → flagged zeros, timeline continuous |
| T09 timestamp error | pass | pass | No anchor → INVALID (time 0); bad timestamp after a good one → ESTIMATED, 0 ns error |
| T10 discontinuity | pass | pass | 220-frame skip → gap of 220; 180 repeated frames removed; OS glitch → unknown-length gap; no frame spans a gap |
| T11 ring wraps | pass | pass | 52M items, capacities 3 / 1000 / 4097, 0 corrupted; ThreadSanitizer clean |
| T12 producer outruns consumer | pass | pass | 300 ms stall with a 170.7 ms transport: 6592 newest frames dropped, 1 gap record, callback max 36 µs |
| T13 render stutter | pass | pass | See the capacity table below |
| T14 long run | sim pass (60 min of audio at 40×, CPU burner) | — | 172.8M frames, 0 lost, RSS flat at 16.3 MB, 0 capture-thread allocations. Real 30–60 min **not run** |
| T15 missed deadlines | pass | pass | 14 injected 15 ms callbacks (10 ms period) counted as overruns, no loss |
| T24 clipping / gain | pass | pass | +12 dBFS overload: 6675 clipped samples flagged; −40 / −6 dBFS: 0; NaN/Inf counted and replaced |
| T26 timestamp anchor | sim pass | sim pass | Error against the simulated truth: 0 µs without jitter. With 200 µs packet jitter: p50 16 µs, p95 47 µs, p99 219 µs (first 160 ms before the clock fit warms up), max 440 µs. **Real device error needs an external reference rig** |
| T29 two clocks | sim (one clock) | sim | +150 ppm device drift estimated as +148.9 ppm; 300 µs jitter estimated as 286 µs. Playback clock not built |
| T30 adversarial buffering | pass | pass | 30M frames × 2 ch, packets 1–2000 frames, glitches/skips/repeats/silent/bad timestamps/consumer stalls: bit-exact delivery, every loss reported, 0 errors, 0 allocations |

### T13 / D04: transport capacity against how long the reader is away

| Capacity | Linux: game frame (measured longest gap) → lost | Windows: game frame (measured longest gap) → lost |
|---|---|---|
| 2048 (42.7 ms) | 16 ms (17) → 0; 33 ms (33) → 0; 66 ms (67) → 33,600 | 16 ms (46–48) → 0–352; 33 ms (48–60) → 5,280–11,040; 66 ms (80–100) → 39,744–44,800 |
| 4096 (85.3 ms) | 33 → 0; 66 → 0; 100 ms → 14,080 | 33 ms (68–80) → 0; 66 ms (80–93) → 0–704; 100 ms (131–135) → 17,696–21,792 |
| 8192 (170.7 ms) | 66 / 100 / 150 ms → 0 | 66 ms (95) / 100 ms (111–124) / 150 ms (165–167) → **0** |

Windows ranges cover the MSVC and MinGW runs. Every lost frame was reported with a matching gap record. On Windows a requested "16 ms" sleep returned after up to 48 ms, which is why Layer 1 must not be read from a game loop. The Unity bridge uses its own reader thread instead.

## Stage B: signal preservation (recorded guitar through the full engine)

The fixtures are six open strings (E2–E4) from the University of Iowa recordings, as 48 kHz mono 16-bit WAVs; hashes are in `tests/fixtures/SHA256SUMS`.

| Test | Result |
|---|---|
| T16 clean plucks | All six strings **bit-exact** with default settings (conditioning off) |
| T17 quiet / sustained | A pluck peaking at −50 dBFS: bit-exact. A 10 s low-E sustain: bit-exact. With DC blocker + 50 Hz notch on, the 82.4 Hz tail changes by −0.02 dB. No gate anywhere |
| DC blocker (optional) | 0.05 DC offset removed (< 1e-3 after 3 s); fundamentals change −0.05 to +0.00 dB; attack peaks within ±0.41 dB |
| T21 mains hum | Single 50 Hz notch: hum −45 dB; E2 fundamental and 2nd harmonic ±0.00 dB. **Harmonic notches cost G2 −2.3 dB (100 Hz notch) and B2 −1.3 dB (120 Hz notch for 60 Hz mains)**, so harmonic notches are off by default |
| T25 headphones vs speakers | **Not run** (needs playback path and a room) |

## Stages C and D: interference, end to end, devices

T18, T19, T20, T22, T23, T25, T27, T28 are **not run**. They need real acoustics, the playback-reference path (not built), a Layer 2 recognizer, or mobile backends. See [LIMITATIONS.md](LIMITATIONS.md).

## Timing of the software path (simulated device, real time)

From the last sample of a frame being captured to `l1_read_frame` returning it, on Linux and Windows:

- p50 4.9 ms, p95 9.6 ms, p99 9.9 ms, max 10.2 ms.

That is with 10 ms device packets and 256-frame frames: a frame waits for the packet holding its last sample. Capture callback cost was p50 8–12 µs and p99 22–28 µs.

This does **not** include the Windows audio engine, driver or ADC, acoustic travel, or any Layer 2 analysis window. Use `l1probe` on hardware for the device part and an external rig for the true total.

## Sanitizers

- ThreadSanitizer: all engine tests (quick mode) and the ring tests, **0 reports**.
- AddressSanitizer + UndefinedBehaviorSanitizer: all four suites, **0 reports**, no leaks.

## Problems found and fixed during testing

| Found by | Problem | Fix |
|---|---|---|
| T30 | Frames dropped after the last accepted packet (at stop or device loss) were counted but never reached Layer 2 | Zero-length `LAST_OF_EPOCH` frame carries trailing loss; one descriptor slot is reserved for it |
| T29 / T26 | Raw packet timestamps with jitter could make capture times go backward | Exponentially weighted clock fit for frame times, plus a monotonic guard |
| Windows CI (T13, LAT) | Windows Sleep rounding made the simulated device deliver in 15.6 ms bursts | High-resolution waitable timer for pacing |
| Windows CI | MSVC header ordering for device property keys | Public key value defined locally |
| Review | `follow_default_device = 0` was ignored when no device id was set | Passed through to the notification client |
| `l1probe` / C# bridge | The reader exited before the last partial frame was flushed at stop | Stop the engine first, then drain |
