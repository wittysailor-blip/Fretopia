# Decision log (Layer 1)

These answer the open items D01–D14 in the handoff's `DECISION_LOG_AND_OPEN_ITEMS.md`. No numeric default comes from the Yousician research. Each one is chosen from public documentation or from the tests in this repository, and each can be changed through configuration.

| ID | Decision | Rationale and evidence | Status | Rollback / knob |
|---|---|---|---|---|
| D01 | Windows: WASAPI shared mode, event-driven. `IAudioClient3` when present, else `IAudioClient` | Public, supported API; shared mode coexists with other apps; event mode avoids polling. Compiles with MSVC and MinGW; on a Windows runner with no mic, enumeration works and start fails cleanly with `L1_ERR_NO_DEVICE` | Implemented; **not yet run on a microphone** | `Backend` interface; another backend can be added |
| D02 | Internal format float32 interleaved; PCM16/24/32 converted at capture | Shared-mode mix formats are float32 on most systems; conversion is exact scaling, never clipping | Implemented (conversion paths for PCM are code-reviewed, not hardware-tested) | — |
| D03 | Two SPSC rings (samples + packet descriptors) with explicit gap metadata; tail-drop overflow | One writer per index, acquire/release publication. T11 checked 52M items for exact order; T30 checked 30M frames with faults; ThreadSanitizer is clean | Implemented, tested | — |
| D04 | Transport capacity **8192 frames** (170 ms at 48 kHz) | Measured on Windows and Linux (T13): 2048 lost audio at 16–33 ms game frames on Windows (timer rounding stretched them to 46–60 ms); 4096 lost audio at a 66 ms frame (measured 93 ms); 8192 lost nothing up to a 150 ms frame (measured 167 ms). Memory is 256 KB | Default chosen from measurements | `transport_capacity_frames` |
| D05 | Frame size 256 (5.3 ms at 48 kHz); window/hop left to Layer 2 | Small enough not to add latency (frames are ready when their last sample is), large enough to keep per-call overhead low | Default | `frame_size` |
| D06 | Timestamp = endpoint QPC anchor + absolute index + exponentially weighted clock fit; flags for estimated/invalid; monotonic | Microsoft documents QPC positions in 100 ns units. The fit removes packet jitter: with 200 µs simulated jitter the error is p50 16 µs and p95 47 µs; drift is estimated within 1.1 ppm of the true value | Implemented; real-device accuracy needs T26 rig | Raw anchors still visible in per-frame uncertainty |
| D07 | Request RAW mode by default; fall back silently to normal mode with a `RAW_UNAVAILABLE` event | Voice processing (noise suppression, AGC) can erase quiet notes and attacks (spec §5). RAW is a request, not a guarantee | Implemented; **driver behaviour untested** | `request_raw_mode = 0` |
| D08 | Conditioning **off by default**. Optional DC blocker (5 Hz), mains notch (fundamental only) and gain | All bypassed: bit-exact on 6 open-string recordings, a −50 dBFS pluck and a 10 s sustain. DC blocker: fundamentals within 0.06 dB. Single 50 Hz notch: −45 dB hum, E2 unchanged. **Harmonic notches cost G2 −2.3 dB and B2 −1.3 dB, so they are opt-in** | Implemented, measured | Per-stage config |
| D09 | Playback-bleed reference path **not implemented** in this milestone | Needs acoustic measurements (T22, T23, T25) to justify. Subtraction can remove the student's own note when the backing plays the same pitch (spec §6) | Open | Planned as separate module |
| D10 | No feature tensor in Layer 1 | Spec §1/§3: representation is a Layer 2 decision | Final | Future separate versioned interface |
| D11 | No VAD or gate in Layer 1 | A speech VAD is not a guitar detector; quiet/sustained notes must survive (T17 bit-exact) | Final | — |
| D12 | No latency budget asserted | Software path measured (last sample → frame: p50 4.9 ms, p99 9.9 ms with 10 ms packets, Windows and Linux). End-to-end needs the T27 rig | Open (product decision) | — |
| D13 | Mobile not started | Spec §7: separate backends and real-phone tests required | Open | `Backend` interface ready |
| D14 | Deterministic fixtures with hashes | `tests/fixtures/*.wav` + `SHA256SUMS`, simulated device with seeded fault injection | Implemented | — |

## Additional decisions made during implementation

| ID | Decision | Rationale |
|---|---|---|
| D-CH | Channels: deliver **all** device channels (up to 8) by default; `SELECT` and `AVERAGE` are explicit options | T04: averaging two phase-opposed channels cancels them completely (RMS 0). The spec forbids a silent destructive downmix |
| D-END | Zero-length `LAST_OF_EPOCH` frame carries loss that happened after the last delivered sample | Found by T30: without it, frames dropped right before a stop or device loss never reached Layer 2 (gate 2) |
| D-RESET | A device position moving back by more than 1 s is a device reset (new epoch); smaller overlaps are repeated frames that get trimmed | Separates "device repeated a few frames" from "device restarted counting" |
| D-NAN | NaN/Inf replaced by 0 and flagged per frame | A single NaN would poison every IIR filter and FFT downstream; the replacement is visible (`NONFINITE`, count) |
| D-SLEEP | Windows high-resolution waitable timer for pacing (simulator/tests) | Default Sleep rounds to 15.6 ms; that made the simulated device bursty on Windows. The capture path itself is event-driven and unaffected |
| D-COM | All WASAPI open/close work runs on the engine's own MTA control thread | Unity's main thread is STA; COM objects then never cross apartments |
| D-API | Copy-out frames (`l1_read_frame` copies into the caller's buffer) | No shared-lifetime contract across the C ABI or P/Invoke; one 256×8 float copy per frame is negligible |
