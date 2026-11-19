# Microphone tests on Windows (with `l1probe.exe`)

These are the test-plan cases that need a real Windows PC and microphone. Every run appends one row to `l1_results.csv` in the column layout of the handoff's `RESULTS_TEMPLATE.csv`, and prints a summary.

Each run also checks the timeline rules on every frame:

- no index going backward;
- no unflagged jump;
- no capture time going backward.

Any violation fails the run.

## Setup

1. Copy `l1probe.exe` (from the CI artifacts or a local build) to a folder.
2. Settings → Privacy & security → Microphone: allow desktop apps.
3. `l1probe list` shows each microphone, its id and its mix format. The default device is marked with `*`.

Each command's output also includes:

- **Format:** device rate and channels, the period Windows granted, the device buffer size, and whether RAW mode was accepted.
- **Counters:** received, delivered, dropped (by cause), glitches, timestamp errors and silent packets.
- **Timing:** callback duration p50/p99/max, last-sample→frame latency, device clock drift against QPC, and packet timestamp jitter.
- **Levels:** peak, noise floor, clipping, and a plain-language level hint.

Add `--wav file.wav` to save what was delivered. Gaps are listed in `file.wav.gaps.csv` and are never filled in the WAV. Add `--log frames.csv` for a per-frame log.

Pass metadata with `--mic`, `--route`, `--ambient`, `--distance` and `--notes` so the CSV rows are self-describing.

## Stage A: correctness

| Test | Command | Pass when |
|---|---|---|
| T01 permissions | Turn mic access **off**, then `l1probe capture --test T01 --seconds 3`. Turn it on and run again | First run prints "microphone access denied" and exits cleanly; second run captures |
| T02 built-in mic | `l1probe capture --test T02 --seconds 120 --mic "laptop built-in" --wav t02.wav` (play a steady tone, then silence) | PASS; received frames ≈ 120 s × rate; 0 drops; timeline OK |
| T03 USB mic | `l1probe capture --test T03 --seconds 120 --device <id> --mic "USB …"`. Repeat with `--rate 44100` and `--rate 48000` | PASS; the resampling note shows when the requested rate differs from the device rate |
| T04 stereo/array | `l1probe capture --test T04 --seconds 20 --device <array id> --wav t04.wav` (all channels), then `--channels select:0` | Both channels present in the WAV; the summary shows device channel count |
| T05 period | `l1probe capture --test T05 --seconds 10 --period 64`, then `--period 480`, then `--period 100000`; also `--no-raw` | `PERIOD_ADJUSTED` events show what Windows granted; the stream always starts or fails with a clear error |
| T06 hot-plug | `l1probe capture --test T06 --seconds 30 --hotplug --device <usb id>` (unplug, wait, replug) | `DEVICE_LOST` then `RECOVERED`; epoch 2 in the summary; PASS |
| T06b default switch | Run without `--device`; change the default input in Windows Sound settings mid-run | `DEFAULT_CHANGED`, new epoch, capture continues on the new mic |
| T07 rate change | During a run, change the mic's default format (Sound Control Panel → Recording → Properties → Advanced) from 48000 to 44100 Hz | `FORMAT_CHANGED` or `DEVICE_LOST`/`RECOVERED`; the new epoch reports the new rate |
| T13 frame-rate stutter | `l1probe capture --test T13 --seconds 60 --fps 30 --stall-ms 60` | 0 frames lost with the default 8192 capacity; repeat with `--capacity 2048` to see reported loss |
| T14 long run | `l1probe capture --test T14 --seconds 3600 --load 4 --quiet` (with a browser playing video) | PASS; drift and jitter stable; queue high-water far below capacity |
| T15 deadlines | Read `callback p99/max` and `overruns` from the T14 summary | Overruns are counted; no loss unless the device itself reports it |
| T24 clipping | Record a pluck at low, normal and maximum Windows mic level (`--test T24 --notes low|normal|max`) | Clipped samples counted at max; level hints are sensible |

## Stage B: guitar on a real microphone

Record each with `--wav` at 30, 60 and 100 cm, in normal and in RAW mode (`--no-raw`).

- **T16:** single open-string plucks.
- **T17:** soft plucks and 10 s sustains.
- **T21:** hum near a power adapter. Compare a bypass run with the same take processed live via `--hum 50` (or `--hum 60`). `--dc-block` and `--hum-harmonics 3` work the same way.

The WAVs plus `gaps.csv` are the fixtures for Layer 2 work. Keep the sha256 recorded in the CSV.

## What these tests cannot show

- **True timing (T26, T27).** Absolute timestamp error and end-to-end latency need an external reference: a loopback cable or a second recorder capturing the same click. `l1probe` reports Layer 1's own clock, which cannot serve as its own ground truth.
- **Two clocks (T29).** The drift that `l1probe` prints is the microphone against the PC clock. The playback-device drift needs a playback path, which isn't in this milestone.
