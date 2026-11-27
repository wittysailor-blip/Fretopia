package com.playchord.audioinput

import java.util.concurrent.atomic.AtomicInteger

/**
 * A replaceable input source that plays back a fixed script of reads, with AudioRecord.read() semantics.
 * It drives the production conversion-and-delivery path without a microphone or permission.
 *
 * After the script runs out, [read] blocks until [requestStop], like a real recorder waiting for audio.
 */
class ScriptedPcmSource(
    steps: List<Step>,
    override val framesPerRead: Int,
    override val format: StreamFormat = StreamFormat.GATE_A,
) : PcmSource {

    sealed class Step {
        /** Writes [values] into the caller's buffer from offset 0 and returns their count (a short read if fewer than requested). */
        class Samples(val values: ShortArray) : Step()

        /** Returns 0 without touching the buffer. */
        object Zero : Step()

        /** Returns a negative error [code] without touching the buffer. */
        class Error(val code: Int) : Step()
    }

    private val script = steps.toList()
    private val lock = Object()
    private var next = 0
    private var started = false
    private var stopRequested = false
    private var released = false

    /** Number of script steps already served. */
    val stepsServed = AtomicInteger(0)

    val isReleased: Boolean get() = synchronized(lock) { released }

    override val minBufferBytes: Int get() = framesPerRead * 2
    override val recorderBufferBytes: Int get() = framesPerRead * 4

    override fun start() {
        synchronized(lock) { started = true }
    }

    override fun read(destination: ShortArray, offset: Int, length: Int): Int {
        val step: Step
        synchronized(lock) {
            check(started) { "read before start" }
            if (next >= script.size) {
                while (!stopRequested) lock.wait(50)
                return 0
            }
            if (stopRequested) return 0
            step = script[next++]
        }
        stepsServed.incrementAndGet()
        return when (step) {
            is Step.Samples -> {
                val n = minOf(step.values.size, length)
                System.arraycopy(step.values, 0, destination, offset, n)
                n
            }
            Step.Zero -> 0
            is Step.Error -> step.code
        }
    }

    override fun requestStop() {
        synchronized(lock) {
            stopRequested = true
            lock.notifyAll()
        }
    }

    override fun release() {
        synchronized(lock) { released = true }
    }

    override fun describeReadError(code: Int): String = "SCRIPTED_ERROR"

    companion object {
        fun samples(vararg values: Int) = Step.Samples(ShortArray(values.size) { values[it].toShort() })
    }
}

/** A factory that hands out the next scripted source on each open. */
class ScriptedSourceFactory(private val sources: List<ScriptedPcmSource>) : PcmSourceFactory {
    private val index = AtomicInteger(0)
    override fun open(request: CaptureRequest): OpenResult {
        val i = index.getAndIncrement()
        if (i >= sources.size) return OpenResult.Failed(CaptureError.InitFailed("no scripted source left"))
        return OpenResult.Opened(sources[i])
    }
}
