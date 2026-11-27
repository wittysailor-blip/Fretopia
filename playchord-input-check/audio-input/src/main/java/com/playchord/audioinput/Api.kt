package com.playchord.audioinput

/**
 * Public contract of the PlayChord audio-input module (Blueprint 5, §0.2, Build Gate A).
 *
 * Nothing in this file depends on Android, so the whole delivery path can be exercised on a plain JVM
 * with a [ScriptedPcmSource].
 */

/** What the caller asks for. Gate A supports exactly 44,100 Hz mono PCM16. */
data class CaptureRequest(
    val sampleRateHz: Int = 44_100,
    val channelCount: Int = 1,
)

enum class PcmEncoding { PCM_16BIT, PCM_8BIT, PCM_FLOAT, OTHER }

/** The format a source actually initialised with. This can differ from the request. */
data class StreamFormat(
    val sampleRateHz: Int,
    val channelCount: Int,
    val encoding: PcmEncoding,
) {
    /** Build Gate A accepts only 44,100 Hz, one channel, signed 16-bit PCM. */
    val isGateASupported: Boolean
        get() = sampleRateHz == GATE_A_RATE_HZ && channelCount == 1 && encoding == PcmEncoding.PCM_16BIT

    override fun toString(): String = "$sampleRateHz Hz, $channelCount ch, $encoding"

    companion object {
        const val GATE_A_RATE_HZ = 44_100
        val GATE_A = StreamFormat(GATE_A_RATE_HZ, 1, PcmEncoding.PCM_16BIT)
    }
}

enum class TimingQuality { HARDWARE, ARRIVAL_ESTIMATE }

/**
 * One delivery to a consumer (Blueprint 5 `OutputBlock`).
 *
 * Borrowed: the object and its [samples] array are reused by the engine. Read only indices
 * `0 until count`, and only during the [InputConsumer.onBlock] call. Copy anything you need later.
 */
class OutputBlock(
    samples: FloatArray,
    firstOutputFrame: Long,
    count: Int,
    generation: Long,
    firstFrameTimeNs: Long,
    timingQuality: TimingQuality,
    anchorRevision: Long,
    discontinuityBefore: Boolean,
) {
    /** Mono float samples in [-1.0, 0.999969482421875]. Valid only for indices `0 until count`. */
    var samples: FloatArray = samples
        internal set

    /** Zero-based index of `samples[0]` within this session generation, at 44,100 Hz. */
    var firstOutputFrame: Long = firstOutputFrame
        internal set

    /** Number of valid frames. Never zero for a delivered block. */
    var count: Int = count
        internal set

    /** Session generation. Every start gets a new one. */
    var generation: Long = generation
        internal set

    /** Monotonic-clock estimate (System.nanoTime domain) of when `samples[0]` was captured. */
    var firstFrameTimeNs: Long = firstFrameTimeNs
        internal set

    /** Gate A only has callback-arrival timing, never hardware timestamps. */
    var timingQuality: TimingQuality = timingQuality
        internal set

    var anchorRevision: Long = anchorRevision
        internal set

    /** True if frames before this block are missing or untrustworthy. */
    var discontinuityBefore: Boolean = discontinuityBefore
        internal set

    init {
        require(count in 0..samples.size) { "count $count outside 0..${samples.size}" }
    }

    /** Bounds-checked read of a valid sample. */
    operator fun get(index: Int): Float {
        if (index < 0 || index >= count) throw IndexOutOfBoundsException("index $index, count $count")
        return samples[index]
    }

    /** Copies the valid samples into owned storage. */
    fun copyInto(destination: FloatArray, destinationOffset: Int = 0) {
        System.arraycopy(samples, 0, destination, destinationOffset, count)
    }

    /** Allocates and returns an owned copy of the valid samples (not for use on hot paths). */
    fun toFloatArray(): FloatArray = samples.copyOf(count)
}

/** What the engine knows about a running session. */
data class SessionInfo(
    val generation: Long,
    val format: StreamFormat,
    /** Frames requested per read: the platform minimum buffer, converted from bytes to frames. */
    val framesPerRead: Int,
    /** AudioRecord.getMinBufferSize() result, in bytes. */
    val minBufferBytes: Int,
    /** Size handed to the recorder, in bytes. */
    val recorderBufferBytes: Int,
)

/**
 * A client of the module, such as the test meter today or a note detector later.
 *
 * Threading:
 * - [onSessionStarting] and [onSessionEnded] run on the engine's control thread.
 * - [onBlock] runs on the capture thread. Don't block, allocate heavily or touch UI there.
 */
interface InputConsumer {
    /** Called before capture starts. Prepare buffers here. Throwing aborts the start. */
    fun onSessionStarting(session: SessionInfo) {}

    /** Called once per valid block. Return true if accepted. The block is borrowed until return. */
    fun onBlock(block: OutputBlock): Boolean

    /** Called after the worker has stopped and the recorder has been released. */
    fun onSessionEnded(generation: Long) {}
}

/** Blueprint 5 §0.3 states. */
enum class EngineState { STOPPED, OPENING, READY, STARTING, RUNNING, STOPPING, FAILED }

/** Why a session failed. [message] is written for the person holding the phone. */
sealed class CaptureError(val message: String) {
    object PermissionDenied : CaptureError("Microphone permission is not granted.")
    class UnsupportedFormat(val observed: StreamFormat) :
        CaptureError("Unsupported format: the microphone opened at $observed. This build needs ${StreamFormat.GATE_A}.")
    class InitFailed(reason: String) : CaptureError("The microphone could not be opened: $reason")
    class StartFailed(reason: String) : CaptureError("The microphone did not start recording: $reason")
    class ReadError(val code: Int, val codeName: String) :
        CaptureError("Reading from the microphone failed with $codeName ($code).")
    class ConsumerInitFailed(reason: String) : CaptureError("The processor could not get ready: $reason")
    object StopTimeout : CaptureError("The capture thread did not stop in time; resources were kept to stay safe.")

    override fun toString(): String = message
}

/** One consistent view of the engine, published on every state change. */
data class SessionSnapshot(
    val state: EngineState,
    /** 0 before the first session. */
    val generation: Long,
    val info: SessionInfo?,
    /** The most recent error of this session, kept after it stops so the UI can show it. */
    val error: CaptureError?,
) {
    val isCapturing: Boolean
        get() = state == EngineState.OPENING || state == EngineState.READY ||
            state == EngineState.STARTING || state == EngineState.RUNNING || state == EngineState.STOPPING

    companion object {
        val INITIAL = SessionSnapshot(EngineState.STOPPED, 0, null, null)
    }
}

fun interface SessionListener {
    fun onSnapshot(snapshot: SessionSnapshot)
}
