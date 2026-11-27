package com.playchord.inputcheck

import com.playchord.audioinput.InputConsumer
import com.playchord.audioinput.OutputBlock
import com.playchord.audioinput.SessionInfo
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs

/**
 * The test screen's consumer. It measures what actually reached the processing interface:
 * peak level from the valid samples, frame counts, and consumer continuity.
 *
 * onBlock runs on the capture thread: it allocates nothing and only updates atomics.
 * The UI reads [snapshot] about ten times a second; the peak is the highest since the last read.
 */
class DiagnosticConsumer : InputConsumer {

    data class Snapshot(
        val generation: Long,
        /** Highest |sample| since the previous snapshot (0 if no block arrived). */
        val peakSinceLast: Float,
        val blocks: Long,
        val latestBlockFrames: Int,
        val totalFrames: Long,
        val firstFrameOfSession: Long,
        val gaps: Long,
        val gapFrames: Long,
        val overlaps: Long,
        val overlapFrames: Long,
        val staleBlocksIgnored: Long,
    )

    @Volatile
    private var generation = -1L
    private val peakBits = AtomicInteger(0) // bits of a non-negative float, so integer max = float max
    private val blocks = AtomicLong(0)
    private val totalFrames = AtomicLong(0)
    private val gaps = AtomicLong(0)
    private val gapFrames = AtomicLong(0)
    private val overlaps = AtomicLong(0)
    private val overlapFrames = AtomicLong(0)
    private val stale = AtomicLong(0)

    @Volatile
    private var latestBlockFrames = 0

    @Volatile
    private var firstFrame = -1L

    // Capture thread only.
    private var expectedFirst = -1L

    /** Clears everything for a new session. Called on the control thread before capture starts. */
    override fun onSessionStarting(session: SessionInfo) {
        resetFor(session.generation)
    }

    fun resetFor(newGeneration: Long) {
        generation = newGeneration
        peakBits.set(0)
        blocks.set(0)
        totalFrames.set(0)
        gaps.set(0)
        gapFrames.set(0)
        overlaps.set(0)
        overlapFrames.set(0)
        stale.set(0)
        latestBlockFrames = 0
        firstFrame = -1L
        expectedFirst = -1L
    }

    override fun onBlock(block: OutputBlock): Boolean {
        if (block.generation != generation) {
            stale.incrementAndGet() // a late event from an older generation never touches the meter
            return false
        }
        val n = block.count
        val s = block.samples
        var peak = 0f
        for (i in 0 until n) {
            val a = abs(s[i])
            if (a > peak) peak = a
        }
        val bits = java.lang.Float.floatToRawIntBits(peak)
        while (true) {
            val old = peakBits.get()
            if (bits <= old || peakBits.compareAndSet(old, bits)) break
        }

        // Consumer continuity: expectedFirst = previousFirst + previousCount.
        val first = block.firstOutputFrame
        if (expectedFirst >= 0) {
            if (first > expectedFirst) {
                gaps.incrementAndGet()
                gapFrames.addAndGet(first - expectedFirst)
            } else if (first < expectedFirst) {
                overlaps.incrementAndGet()
                overlapFrames.addAndGet(expectedFirst - first)
            }
        } else {
            firstFrame = first
        }
        expectedFirst = first + n

        latestBlockFrames = n
        totalFrames.addAndGet(n.toLong())
        blocks.incrementAndGet()
        return true
    }

    /** Reads the counters and resets the peak accumulator. */
    fun snapshot(): Snapshot = Snapshot(
        generation = generation,
        peakSinceLast = java.lang.Float.intBitsToFloat(peakBits.getAndSet(0)),
        blocks = blocks.get(),
        latestBlockFrames = latestBlockFrames,
        totalFrames = totalFrames.get(),
        firstFrameOfSession = firstFrame,
        gaps = gaps.get(),
        gapFrames = gapFrames.get(),
        overlaps = overlaps.get(),
        overlapFrames = overlapFrames.get(),
        staleBlocksIgnored = stale.get(),
    )

    companion object {
        /** 20·log10(peak), with a floor for silence. */
        fun peakDbfs(peak: Float, floorDb: Double = FLOOR_DBFS): Double =
            if (peak > 0f) maxOf(20.0 * kotlin.math.log10(peak.toDouble()), floorDb) else floorDb

        const val FLOOR_DBFS = -90.0
    }
}
