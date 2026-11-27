# PlayChord Input Check (Build Gate A)

A small Android app that proves a real guitar sound travels from the phone microphone through the
PlayChord audio-input engine and arrives as valid, ordered samples at the interface the main app will use.

It implements Blueprint 5 §0 (`01_AUDIO_INPUT_ENGINE5_MASTER.md`), Build Gate A in §0.7:
Java AudioRecord → PCM16 → float → peak → ordered 44,100 Hz blocks.

## Project layout

| Module | What it contains | Android UI? |
|---|---|---|
| `:audio-input` | The reusable engine: capture worker, PCM16 → float conversion, session lifecycle and generations, frame numbering, `OutputBlock`, `InputConsumer`, the AudioRecord source and a scripted test source | No |
| `:app` | The test screen (Compose), microphone permission flow, `DiagnosticConsumer` (the test consumer that drives the meter), `SelfTestRunner`, results display | Yes |

Key files:

- `audio-input/.../Api.kt`: `OutputBlock`, `InputConsumer`, `SessionInfo`, `EngineState`, `CaptureError`, `SessionSnapshot`
- `audio-input/.../AudioInputEngine.kt`: the serialized control owner, start/stop and the capture worker
- `audio-input/.../BlockProcessor.kt`: the `sample / 32768f` conversion, generation gate, frame numbering and arrival timing
- `audio-input/.../AudioRecordSource.kt`: AudioRecord, mono PCM16, 44,100 Hz requested; getMinBufferSize is treated as bytes
- `audio-input/.../ScriptedPcmSource.kt`: the replaceable input source used by the self-test

Kept outside this build, as the brief asks: 48 kHz resampling, AAudio, OpenSL, pitch detection, scoring,
YouTube, accounts and cloud storage.

## Contracts implemented

- **Conversion.** For a positive `read()` result n, exactly the first n samples are converted with `sample / 32768f`.
  At 44,100 Hz they pass through unfiltered.
  - A zero read delivers nothing.
  - A negative read stops the session with a visible `ReadError`.
  - The unused tail of the reused buffer is never delivered.
- **OutputBlock.** Each block carries:
  - `generation` (the session ID)
  - `firstOutputFrame` (0 at the start of each session)
  - `count`
  - borrowed `samples` (valid only during `onBlock`)
  - `firstFrameTimeNs`, `timingQuality = ARRIVAL_ESTIMATE` and `anchorRevision`
  - `discontinuityBefore`
- **Lifecycle (§0.3).** STOPPED → OPENING → READY → STARTING → RUNNING → STOPPING → STOPPED, plus FAILED.
  - The consumer is initialised before recording starts.
  - The first valid block reaches the consumer while the engine is STARTING. Its acceptance moves the engine to RUNNING ("Listening").
- **Stop.** Disable delivery → `AudioRecord.stop()` to unblock the read → join the worker → release.
  - If the worker doesn't finish, resources are kept and a `StopTimeout` error is shown.
- **Generations.** Every start gets a new generation. Late blocks and late events from an older generation are ignored by the engine and again by the test consumer.
- **One recorder at a time.** Repeated taps can't create two recorders.
- **Background.** Going to the background stops capture. Coming back needs a fresh tap on Start mic.

## Build commands

Run from this folder (JDK 17 and an Android SDK with platform 35):

```bash
./gradlew :audio-input:testDebugUnitTest :app:testDebugUnitTest :app:assembleDebug
./gradlew :app:connectedDebugAndroidTest      # with a phone or emulator connected
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Install the APK on your phone

1. Copy `app-debug.apk` to the phone (USB, Google Drive or email it to yourself).
2. Open it from the Files app. If Android asks, allow your Files or Drive app to "Install unknown apps", then tap Install.
   - Or, with USB debugging on: `adb install -r app-debug.apk`.
3. Open **PlayChord Input Check**.

It's a debug build signed with a debug key. Android may warn about that; it's expected for a test app.

## Physical-phone acceptance test

Do this with a real guitar. Write down what you see on each step.

1. **First block.** Tap **Start mic** and grant permission.
   - The status shows "Starting microphone…" and then "Listening".
   - "Listening" appears only once the first block has reached the consumer: Total frames received is already above 0 when it appears.
2. **Pluck and mute.** Put the phone beside the guitar, pluck a string, let it ring, then mute it.
   - The meter (Level received by processor) rises on the pluck and falls when you mute.
   - Total frames received keeps increasing during the quiet part.
3. **Thirty seconds.** Leave it running for 30 seconds, then check:
   - Actual sample rate: 44100 Hz
   - Channels: 1 (mono)
   - Frame gaps and Frame overlaps: 0
   - Consumer continuity: "Ordered"
4. **Stop and restart.** Tap **Stop mic**.
   - The counters freeze.
   - Mute the strings and tap **Start mic** again: the session ID goes up by one, the counters restart from zero, and the old peak does not come back.
5. **Background.** While it's listening, press Home, then reopen the app.
   - It shows "Stopped" with a note that it went to the background.
   - Tap **Start mic**: a fresh session (new ID) starts cleanly.

Then run **Run self-test** with the mic stopped. All nine rows should say PASS.

## Using `:audio-input` from the main PlayChord app

`settings.gradle.kts` of PlayChord, after copying the `audio-input` folder into the PlayChord project:

```kotlin
include(":audio-input")
```

`app/build.gradle.kts` of PlayChord:

```kotlin
dependencies {
    implementation(project(":audio-input"))
}
```

Register a consumer, start, stop:

```kotlin
import com.playchord.audioinput.*

class NoteDetectorConsumer : InputConsumer {
    private val window = FloatArray(4096)       // owned storage, allocated once

    override fun onSessionStarting(session: SessionInfo) {
        // Reset detector state for session.generation; buffers are ready before capture starts.
    }

    override fun onBlock(block: OutputBlock): Boolean {
        // Borrowed: read block.samples[0 until block.count] now, or copy it.
        block.copyInto(window, 0)               // (a real detector would append to a ring)
        // ... note detection here, using block.firstOutputFrame for timing ...
        return true
    }
}

val engine = AudioInputEngine(AudioRecordSourceFactory())
engine.addListener { snapshot -> /* snapshot.state, snapshot.error, snapshot.info?.format */ }

// after RECORD_AUDIO has been granted:
engine.start(NoteDetectorConsumer())
// ...
engine.stop()      // or engine.close() when the screen is destroyed
```

### Repeating the pluck-and-restart check inside PlayChord

Register PlayChord's own consumer and the test's `DiagnosticConsumer` (copy it from `:app`) side by side. Wrap them in one consumer that calls both and returns true:

```kotlin
class Both(private val a: InputConsumer, private val b: InputConsumer) : InputConsumer {
    override fun onSessionStarting(session: SessionInfo) { a.onSessionStarting(session); b.onSessionStarting(session) }
    override fun onBlock(block: OutputBlock): Boolean { val x = a.onBlock(block); val y = b.onBlock(block); return x && y }
    override fun onSessionEnded(generation: Long) { a.onSessionEnded(generation); b.onSessionEnded(generation) }
}
val diag = DiagnosticConsumer()
engine.start(Both(NoteDetectorConsumer(), diag))
```

Poll `diag.snapshot()` about ten times a second (for example in a hidden debug overlay) and repeat steps 2–4 above:

- `peakSinceLast` should rise on a pluck.
- `gaps` and `overlaps` should stay at 0.
- After Stop → Start, `generation` goes up and `firstFrameOfSession` is 0 again.

That is the "main-app integration passed" check. It only counts once it's done inside PlayChord itself.
