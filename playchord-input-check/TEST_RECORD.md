# Test record: PlayChord Input Check, Build Gate A

Source commit `7fc1c258ce8abda700cf2e2bfb8c68608b942346`, branch `playchord-input-check` of
github.com/wittysailor-blip/Fretopia. CI run 45971652218 (GitHub Actions, ubuntu-latest, JDK 17).

## The three outcomes

| Outcome | Status | Basis |
|---|---|---|
| **Automated tests** | **Passed** | 13 JVM tests and 3 on-device tests on an Android 13 emulator. Details below. |
| **Physical-phone test** | **Not run** | No physical phone or guitar was available. Follow the procedure in README.md and record the result. |
| **Main-app integration** | **Not run** | PlayChord itself was not built here. See "Using :audio-input from the main PlayChord app" in README.md. |

A successful build, the synthetic self-test and the emulator run don't show that a physical microphone hears a guitar.
The emulator's microphone is virtual: it fed a steady low noise (about −72 dBFS) to the consumer.

## Exact Gradle commands used

```bash
cd playchord-input-check
./gradlew --no-daemon --stacktrace :audio-input:testDebugUnitTest :app:testDebugUnitTest :app:assembleDebug
./gradlew --no-daemon --stacktrace :app:connectedDebugAndroidTest   # emulator: API 33, x86_64, google_apis
```

The Gradle wrapper is 8.14.3. Plugins: Android Gradle Plugin 8.7.3, Kotlin 2.0.21. compileSdk 35, minSdk 26 (Android 8.0+).

## Debug APK

`app-debug.apk`, SHA-256 `b9b51179bffed8d49779e39f58de0af515992acef24ec1aea7b59e68740e40d0`.

## JVM unit tests: 13 passed, 0 failed

| Module | Test | Result |
|---|---|---|
| audio-input | convertsExactlyAndInOrder: PCM16 [-32768, 0, 16384, 32767] → [-1.0, 0.0, 0.5, 0.999969482421875], count 4 | Pass |
| audio-input | firstBlockArrivesWhileStartingThenRunning (consumer initialised first; first block during STARTING) | Pass |
| audio-input | shortReadDeliversOnlyNewSamples (stale buffer tail never delivered; frame index +2) | Pass |
| audio-input | zeroReadDeliversNothingAndErrorStopsWithoutStaleAudio | Pass |
| audio-input | framesAreContiguousAcrossBlockSizes (0, 3, 10, 11; timestamps non-decreasing) | Pass |
| audio-input | restartStartsANewGenerationAtFrameZeroAndIgnoresLateEvents | Pass |
| audio-input | aStartMadeTheMomentStoppedIsAnnouncedIsAccepted | Pass |
| audio-input | rapidStartsCreateOnlyOneSession (10 taps → 1 recorder) | Pass |
| audio-input | stopUnblocksAWaitingReadAndReleasesAfterTheWorkerEnds | Pass |
| audio-input | unsupportedFormatIsReportedWithTheObservedFormat | Pass |
| audio-input | consumerFailureDuringInitAbortsTheStart | Pass |
| app | SelfTestRunnerTest.everySyntheticCasePasses (all 9 self-test cases) | Pass |
| app | SelfTestRunnerTest.peakDbfsUsesTwentyLog10AndAFloor | Pass |

## On-device tests (Android 13 emulator): 3 passed, 0 failed

| Test | What it checks | Result |
|---|---|---|
| OnDeviceSelfTest | The 9 self-test cases on the Android runtime | Pass |
| RecorderCaptureTest | Real AudioRecord through the module, using the emulator's virtual mic: <br>• 44,100 Hz mono reached RUNNING <br>• more than 44,100 frames in 3 s, 0 gaps, 0 overlaps, first frame 0 <br>• counters froze after Stop <br>• restart got generation + 1, first frame 0, fresh counters | Pass |
| ScreenWalkthroughTest | Drives the real screen: Ready → Start mic → Listening → Stop mic → Stopped → diagnostics → Run self-test → "Passed: 9 of 9". Screenshots saved. | Pass |

## The self-test cases (the in-app "Run self-test" button)

1. Conversion and handoff
2. Listening only after the first block
3. Short read
4. Zero read
5. Error read
6. Consumer continuity
7. Gap and overlap detection (one injected gap of 2 frames and one overlap of 1 frame, both detected)
8. Restart and late event
9. Unsupported format is reported

## Defect found and fixed during testing

The first emulator run failed the restart case: "second start refused". The engine announced STOPPED a moment before it released its claim on the recorder. A Start tapped the instant "Stopped" appeared could be refused.

The engine now releases the claim before announcing STOPPED. The control thread is serial, so a new start still runs after the stop has fully finished. The regression test `aStartMadeTheMomentStoppedIsAnnouncedIsAccepted` covers it.

## Physical-phone acceptance: fill in on a real phone

| Step | Expected | Observed | Pass/Fail |
|---|---|---|---|
| 1. Start mic, grant permission | "Listening" appears only after the first block (Total frames > 0) | | |
| 2. Pluck, ring, mute | Meter rises and falls; frame count keeps climbing when quiet | | |
| 3. 30 seconds | 44100 Hz, 1 (mono), gaps 0, overlaps 0 | | |
| 4. Stop, then Start | Counters freeze; new session ID; counters restart; old peak gone | | |
| 5. Background while listening, reopen | "Stopped" with background note; a fresh start works | | |

Phone model and Android version: ______. Date: ______.
