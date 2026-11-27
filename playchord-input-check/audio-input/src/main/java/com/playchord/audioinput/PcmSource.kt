package com.playchord.audioinput

/**
 * A replaceable source of PCM16 mono samples with AudioRecord.read() semantics.
 *
 * Production uses [AudioRecordSourceFactory]. Tests and the in-app self-test use [ScriptedPcmSource],
 * so synthetic input runs through the same conversion and delivery code as the microphone.
 */
interface PcmSource {
    /** The format the source actually initialised with. */
    val format: StreamFormat

    /** Frames to request per read. Must be positive. */
    val framesPerRead: Int

    /** Platform minimum buffer size in bytes (for diagnostics). */
    val minBufferBytes: Int

    /** Buffer size given to the recorder in bytes (for diagnostics). */
    val recorderBufferBytes: Int

    /** Begin recording. Throw [CaptureException] if recording doesn't actually start. */
    fun start()

    /**
     * Blocking read into [destination] starting at [offset], up to [length] frames.
     * Returns the number of frames written (positive), 0 for nothing, or a negative error code.
     * Frames after the returned count are not touched and must be treated as stale.
     */
    fun read(destination: ShortArray, offset: Int, length: Int): Int

    /** Ask a blocked [read] to return. Called on the control thread during stop. */
    fun requestStop()

    /** Free native resources. Called only after the capture thread has finished. */
    fun release()

    /** Called once on the capture thread before the first read (e.g. to raise thread priority). */
    fun onCaptureThreadStart() {}

    /** Human-readable name of a negative read code. */
    fun describeReadError(code: Int): String = "error"
}

sealed class OpenResult {
    class Opened(val source: PcmSource) : OpenResult()
    class Failed(val error: CaptureError) : OpenResult()
}

fun interface PcmSourceFactory {
    fun open(request: CaptureRequest): OpenResult
}

class CaptureException(val error: CaptureError) : Exception(error.message)
