# Remaining limitations (Layer 1, version 0.1.0)

**Layer 1 is not complete.** The Windows engine is built and passes every automated test. But the test plan's microphone, acoustic, end-to-end and device-coverage cases have not run, and some modules in the spec are not built. Specifically:

## Not yet tested on real hardware

- **The WASAPI capture loop has never run against a microphone.** On a Windows CI runner with no audio device it compiles under MSVC and MinGW, enumerates devices and fails cleanly. Everything below it (adapter, transport, frames, timestamps) is shared with the simulated device and is heavily tested, but these parts are unproven until `l1probe` runs on real PCs (see HARDWARE_TESTS.md):
  - packet sizes and flags from real drivers
  - `IAudioClient3` period negotiation
  - RAW-mode acceptance
  - PCM16/24/32 conversion
  - device-removal and default-change notifications
  - format-change reopen
- **Permission denial (T01)** on Windows privacy settings is mapped (`E_ACCESSDENIED` → `L1_ERR_PERMISSION`) but not observed.
- **Long real-device run (T14)**, real hot-plug (T06), real rate change (T07) and real stereo/array mics (T04): not run.

## Timing

- **Timestamp accuracy and latency are measured against a simulated clock only.** `capture_time_ns` is the endpoint's QPC position. How far that is from the acoustic event (ADC, driver, OS audio engine, mic distance) is unknown until a reference rig runs: a loopback cable or a second recorder with a click (T26, T27).
- For the first ~16 packets of each stream (~160 ms), frames use raw packet timestamps before the clock fit warms up, so they carry the full packet jitter.
- The reported `timestamp_uncertainty_ns` is an engineering estimate (3 × measured RMS jitter + 1 sample, plus 200 ppm extrapolation growth). It is not calibrated against ground truth.
- No latency budget is asserted (decision D12). That is a product decision once end-to-end numbers exist.

## Not built in this milestone

- **Playback-reference / backing-track bleed path** (spec §2.7, D09; tests T22, T23, T25, T29 two-clock). There is no output-device capture of the app's own playback and no alignment or crosstalk estimator.
- **Mobile backends** (Android AAudio/Oboe, iOS AudioUnit; T28) and a **macOS backend**. The `Backend` interface is ready for them. Today, non-Windows builds have only the simulated device.
- **Calibration flow** (spec §5): the per-frame level, clipping and noise-floor data exists, and `l1probe` prints guidance. There is no guided calibration API or UI yet.
- **WASAPI exclusive mode** is not supported. Shared mode only.
- **Noise and interference handling** beyond the optional DC blocker and mains notch. Per spec §6, fan/speech/backing rejection belongs to Layer 2 and is not attempted here.

## Design limits to know about

- **Channels.** At most 8 channels are delivered (the first 8 of larger arrays). `AVERAGE` mode cancels out-of-phase content; it is opt-in and documented.
- **Resampling.** Requesting a rate different from the device mix rate makes Windows resample (`AUTOCONVERTPCM`). The resampler's latency and frequency response are not measured or accounted for. The default is the device's own rate.
- **Unread frames after a stop.** Frames still unread after `l1_stop` are delivered on the next read, labelled with their old epoch. Readers should drain after stopping; `Layer1Capture` does.
- **Gaps without a following packet.** Trailing loss is reported through the end-of-epoch frame. If the consumer stops reading entirely and the descriptor ring is full, it is counted only in `l1_stats.frames_dropped_unreported`.
- **Noise floor.** The estimate is a simple 10th percentile of recent frame levels. It reads high while someone plays continuously.
- **OS versions.** Requires Windows 8+ (`WaitOnAddress`). The simulated device and tests use Windows 10 1803+ high-resolution timers, and fall back to `Sleep` on older systems.
- **No Unity project exists yet.** The C# bridge is tested outside Unity (Mono) against the native library. It has not been tested inside the Unity Editor or an IL2CPP player build.
- **The current Fretopia web app (PWA) cannot use this native library.** It still uses its own JavaScript listener.

## What has to happen before calling Layer 1 done

1. Run HARDWARE_TESTS.md Stage A on at least three Windows machines: a laptop built-in mic, a USB mic and an array mic, in RAW and normal mode. Fix anything found and rerun.
2. Build the reference rig and measure T26/T27 timing distributions.
3. Record Stage B guitar fixtures on real microphones as Layer 2 test data.
4. Decide whether the playback-reference path belongs in Layer 1 (D09), then build and test it (T22, T23, T25).
5. Import into a Unity project and run T13 with the real render loop.
