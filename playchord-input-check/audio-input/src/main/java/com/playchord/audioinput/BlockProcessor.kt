package com.playchord.audioinput

import java.util.concurrent.atomic.AtomicLong

/**
 * Conversion and delivery for one session generation (Blueprint 5 §0.4, §0.5, §6.1).
 *
 * Runs on the capture thread only. Allocates everything up front; the per-block path allocates nothing.
 * At 44,100 Hz the samples pass through without filtering: `sample / 32768f`, exactly.
 */
internal class BlockProcessor(
    val generation: Long,
    private val activeGeneration: AtomicLong,
    private val consumer: InputConsumer,
    capacityFrames: Int,
    private val sampleRateHz: Int,
    private val clockNs: () -> Long,
    private val onFirstAccepted: (generation: Long) -> Unit,
) {
    enum class Outcome { ACCEPTED, REJECTED, NOTHING, GATED }

    private val floats = FloatArray(capacityFrames)
    private val block = OutputBlock(floats, 0, 0, generation, 0L, TimingQuality.ARRIVAL_ESTIMATE, 0L, false)

    /** Set true only after the consumer is ready and capture has begun; false first thing on stop. */
    @Volatile
    var deliveryEnabled: Boolean = false

    /** Next output frame index. Written only by the capture thread; read by tests/diagnostics. */
    @Volatile
    var outputFrameIndex: Long = 0L
        private set

    // Arrival-only timing anchor (§0.5): exclusive end of the first block, at its arrival time.
    private var anchorFrame = -1L
    private var anchorTimeNs = 0L
    private var anchorRevision = 0L
    private var firstAcceptedReported = false

    /**
     * Handle one positive read of [count] frames that the source wrote into `pcm[0 until count]`.
     * Zero delivers nothing and leaves the frame index unchanged.
     * Negative counts are errors and must be handled by the caller before calling this.
     */
    fun process(pcm: ShortArray, count: Int): Outcome {
        if (count == 0) return Outcome.NOTHING
        require(count > 0) { "negative counts are errors, not blocks" }
        // Every delivery checks the active generation and the gate (§0.3).
        if (!deliveryEnabled || activeGeneration.get() != generation) return Outcome.GATED
        // Bound the count before touching memory (§0.2).
        require(count <= pcm.size && count <= floats.size) { "read count $count exceeds buffer" }

        for (i in 0 until count) floats[i] = pcm[i] / 32768f

        val arrivalNs = clockNs()
        val first = outputFrameIndex
        if (anchorFrame < 0) {
            anchorFrame = first + count
            anchorTimeNs = arrivalNs
            anchorRevision = 1
        }
        block.firstOutputFrame = first
        block.count = count
        block.generation = generation
        block.firstFrameTimeNs = frameTimeNs(first)
        block.timingQuality = TimingQuality.ARRIVAL_ESTIMATE
        block.anchorRevision = anchorRevision
        block.discontinuityBefore = false

        val accepted = try {
            consumer.onBlock(block)
        } catch (t: Throwable) {
            false // a misbehaving consumer doesn't stop the stream clock
        }
        // The stream clock advances whether or not this consumer accepted the block (§0.4).
        outputFrameIndex = first + count
        if (accepted && !firstAcceptedReported) {
            firstAcceptedReported = true
            onFirstAccepted(generation)
        }
        return if (accepted) Outcome.ACCEPTED else Outcome.REJECTED
    }

    /** T + round((j − P) · 1e9 / rate), with checked arithmetic. */
    private fun frameTimeNs(frame: Long): Long {
        val delta = frame - anchorFrame
        val scaled = Math.multiplyExact(delta, 1_000_000_000L)
        val half = sampleRateHz / 2
        val rounded = if (scaled >= 0) (scaled + half) / sampleRateHz else -((-scaled + half) / sampleRateHz)
        return Math.addExact(anchorTimeNs, rounded)
    }
}
