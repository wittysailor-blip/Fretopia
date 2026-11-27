package com.playchord.inputcheck

import com.playchord.audioinput.AudioInputEngine
import com.playchord.audioinput.CaptureError
import com.playchord.audioinput.EngineState
import com.playchord.audioinput.InputConsumer
import com.playchord.audioinput.OutputBlock
import com.playchord.audioinput.PcmEncoding
import com.playchord.audioinput.ScriptedPcmSource
import com.playchord.audioinput.ScriptedPcmSource.Step
import com.playchord.audioinput.ScriptedSourceFactory
import com.playchord.audioinput.SessionInfo
import com.playchord.audioinput.SessionListener
import com.playchord.audioinput.SessionSnapshot
import com.playchord.audioinput.StreamFormat
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

data class SelfTestResult(val name: String, val passed: Boolean, val expected: String, val actual: String)

/**
 * Synthetic checks that run through the real engine, conversion and delivery code, using a
 * [ScriptedPcmSource] in place of the microphone. No permission needed.
 */
class SelfTestRunner(private val timeoutMs: Long = 3_000) {

    fun runAll(): List<SelfTestResult> = listOf(
        ::conversionAndHandoff,
        ::listeningOnlyAfterFirstBlock,
        ::shortRead,
        ::zeroRead,
        ::errorRead,
        ::continuity,
        ::faultInjection,
        ::restart,
        ::unsupportedFormat,
    ).map { case ->
        try {
            case()
        } catch (t: Throwable) {
            SelfTestResult(case.name, false, "no exception", "${t.javaClass.simpleName}: ${t.message}")
        }
    }

    // ------------------------------------------------------------------ cases

    fun conversionAndHandoff(): SelfTestResult {
        val name = "Conversion and handoff"
        val run = runSession(4, listOf(ScriptedPcmSource.samples(-32768, 0, 16384, 32767)), blocks = 1)
        val expected = floatArrayOf(-1.0f, 0.0f, 0.5f, 0.999969482421875f)
        val b = run.blocks.firstOrNull()
        val ok = run.blocks.size == 1 && b != null && b.count == 4 && b.first == 0L && sameBits(b.samples, expected)
        return SelfTestResult(name, ok, "1 block, count 4, frame 0: ${fmt(expected)}", describe(run.blocks))
    }

    fun listeningOnlyAfterFirstBlock(): SelfTestResult {
        val name = "Listening only after the first block"
        val run = runSession(4, listOf(ScriptedPcmSource.samples(100, 200, 300, 400)), blocks = 1, waitForRunning = true)
        val stateDuringFirst = run.blocks.firstOrNull()?.engineStateDuring
        val ok = stateDuringFirst == EngineState.STARTING && run.sawRunning
        return SelfTestResult(
            name, ok,
            "first block delivered while STARTING, then RUNNING",
            "first block during ${stateDuringFirst ?: "none"}, RUNNING seen = ${run.sawRunning}",
        )
    }

    fun shortRead(): SelfTestResult {
        val name = "Short read"
        // Buffer of 4 is preloaded by the first read; the second read replaces only 2 samples and returns 2.
        val run = runSession(4, listOf(ScriptedPcmSource.samples(10, 20, 30, 40), ScriptedPcmSource.samples(50, 60)), blocks = 2)
        val second = run.blocks.getOrNull(1)
        val expected = floatArrayOf(50 / 32768f, 60 / 32768f)
        val ok = run.blocks.size == 2 && second != null && second.count == 2 && second.first == 4L &&
            sameBits(second.samples, expected) && run.totalFrames == 6L
        return SelfTestResult(
            name, ok,
            "2nd block count 2 at frame 4: ${fmt(expected)}; total 6",
            "${describe(run.blocks)}; total ${run.totalFrames}",
        )
    }

    fun zeroRead(): SelfTestResult {
        val name = "Zero read"
        val run = runSession(
            4,
            listOf(ScriptedPcmSource.samples(1, 2, 3, 4), Step.Zero, ScriptedPcmSource.samples(5, 6, 7, 8)),
            blocks = 2,
        )
        val ok = run.blocks.size == 2 && run.blocks[1].first == 4L && run.blocks.none { it.count == 0 }
        return SelfTestResult(name, ok, "2 blocks at frames 0 and 4, nothing for the zero read", describe(run.blocks))
    }

    fun errorRead(): SelfTestResult {
        val name = "Error read"
        val run = runSession(
            4,
            listOf(ScriptedPcmSource.samples(1, 2, 3, 4), Step.Error(-3), ScriptedPcmSource.samples(9, 9, 9, 9)),
            blocks = 1,
            waitForStop = true,
        )
        val err = run.finalSnapshot?.error
        val ok = run.blocks.size == 1 && err is CaptureError.ReadError && err.code == -3 &&
            run.finalSnapshot?.state == EngineState.STOPPED
        return SelfTestResult(
            name, ok,
            "1 block, then read error -3 reported and capture stopped, no stale audio",
            "${run.blocks.size} block(s), state ${run.finalSnapshot?.state}, error ${(err as? CaptureError.ReadError)?.code ?: err}",
        )
    }

    fun continuity(): SelfTestResult {
        val name = "Consumer continuity"
        val diag = DiagnosticConsumer()
        val run = runSession(
            8,
            listOf(
                ScriptedPcmSource.samples(1, 1, 1),
                ScriptedPcmSource.samples(2, 2, 2, 2, 2, 2, 2),
                ScriptedPcmSource.samples(3),
                ScriptedPcmSource.samples(4, 4, 4, 4, 4),
            ),
            blocks = 4,
            extra = diag,
        )
        val firsts = run.blocks.map { it.first }
        val snap = diag.snapshot()
        val ok = firsts == listOf(0L, 3L, 10L, 11L) && snap.gaps == 0L && snap.overlaps == 0L && snap.totalFrames == 16L
        return SelfTestResult(
            name, ok,
            "frames 0, 3, 10, 11; 16 total; 0 gaps; 0 overlaps",
            "frames ${firsts.joinToString()}; ${snap.totalFrames} total; ${snap.gaps} gaps; ${snap.overlaps} overlaps",
        )
    }

    fun faultInjection(): SelfTestResult {
        val name = "Gap and overlap detection"
        val diag = DiagnosticConsumer()
        diag.resetFor(1)
        fun block(first: Long, count: Int) =
            OutputBlock(FloatArray(count), first, count, 1, 0, com.playchord.audioinput.TimingQuality.ARRIVAL_ESTIMATE, 1, false)
        diag.onBlock(block(0, 4))
        diag.onBlock(block(6, 2)) // expected 4: a gap of 2 frames
        diag.onBlock(block(7, 3)) // expected 8: an overlap of 1 frame
        val s = diag.snapshot()
        val ok = s.gaps == 1L && s.gapFrames == 2L && s.overlaps == 1L && s.overlapFrames == 1L
        return SelfTestResult(
            name, ok,
            "1 gap (2 frames), 1 overlap (1 frame)",
            "${s.gaps} gap (${s.gapFrames} frames), ${s.overlaps} overlap (${s.overlapFrames} frames)",
        )
    }

    fun restart(): SelfTestResult {
        val name = "Restart and late event"
        val loud = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(32767, -32768, 32767, -32768)), 4)
        val quiet = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(0, 0, 0, 0)), 4)
        val engine = AudioInputEngine(ScriptedSourceFactory(listOf(loud, quiet)))
        val diag = DiagnosticConsumer()
        val watch = Watcher(engine)
        try {
            val rec1 = Recorder(engine, extra = diag, expectedBlocks = 1)
            check(engine.start(rec1)) { "first start refused" }
            check(rec1.await(timeoutMs)) { "session 1 got no block" }
            val gen1 = engine.snapshot.generation
            engine.stop()
            check(watch.await(timeoutMs) { it.state == EngineState.STOPPED && it.generation == gen1 }) { "session 1 did not stop" }

            val rec2 = Recorder(engine, extra = diag, expectedBlocks = 1)
            check(engine.start(rec2)) { "second start refused" }
            check(rec2.await(timeoutMs)) { "session 2 got no block" }
            check(watch.await(timeoutMs) { it.state == EngineState.RUNNING }) { "session 2 never reached RUNNING" }
            val gen2 = engine.snapshot.generation
            val before = diag.snapshot()

            val lateDelivered = engine.injectLateEventsFromPreviousSessionForTest(ShortArray(4) { 32767 }, 4)
            Thread.sleep(50)
            val after = diag.snapshot()
            val stateAfter = engine.snapshot.state

            val ok = gen2 == gen1 + 1 && rec2.blocks.first().first == 0L && !lateDelivered &&
                after.totalFrames == before.totalFrames && after.peakSinceLast == 0f && before.peakSinceLast == 0f &&
                stateAfter == EngineState.RUNNING && after.generation == gen2
            return SelfTestResult(
                name, ok,
                "new session ${gen1 + 1} starts at frame 0; late event ignored; peak stays 0; still RUNNING",
                "session $gen2 starts at frame ${rec2.blocks.first().first}; late delivered = $lateDelivered; " +
                    "frames ${before.totalFrames} -> ${after.totalFrames}; peak ${after.peakSinceLast}; state $stateAfter",
            )
        } finally {
            engine.close()
        }
    }

    fun unsupportedFormat(): SelfTestResult {
        val name = "Unsupported format is reported"
        val source = ScriptedPcmSource(
            listOf(ScriptedPcmSource.samples(1, 2, 3, 4)), 4,
            StreamFormat(48_000, 1, PcmEncoding.PCM_16BIT),
        )
        val engine = AudioInputEngine(ScriptedSourceFactory(listOf(source)))
        val watch = Watcher(engine)
        try {
            val rec = Recorder(engine, expectedBlocks = 1)
            engine.start(rec)
            watch.await(timeoutMs) { it.state == EngineState.STOPPED && it.generation > 0 }
            val err = engine.snapshot.error
            val ok = err is CaptureError.UnsupportedFormat && err.observed.sampleRateHz == 48_000 && rec.blocks.isEmpty() && source.isReleased
            return SelfTestResult(
                name, ok,
                "UnsupportedFormat (48000 Hz observed), no blocks, recorder released",
                "${err?.javaClass?.simpleName} ${(err as? CaptureError.UnsupportedFormat)?.observed}, ${rec.blocks.size} blocks, released = ${source.isReleased}",
            )
        } finally {
            engine.close()
        }
    }

    // ------------------------------------------------------------------ harness

    class Captured(val generation: Long, val first: Long, val count: Int, val samples: FloatArray, val engineStateDuring: EngineState)

    /** Copies every block into owned storage (borrowed samples are only valid during the call). */
    private class Recorder(
        private val engine: AudioInputEngine,
        private val extra: InputConsumer? = null,
        expectedBlocks: Int,
    ) : InputConsumer {
        val blocks = CopyOnWriteArrayList<Captured>()
        private val latch = CountDownLatch(expectedBlocks)
        override fun onSessionStarting(session: SessionInfo) {
            extra?.onSessionStarting(session)
        }

        override fun onBlock(block: OutputBlock): Boolean {
            extra?.onBlock(block)
            blocks += Captured(block.generation, block.firstOutputFrame, block.count, block.toFloatArray(), engine.snapshot.state)
            latch.countDown()
            return true
        }

        override fun onSessionEnded(generation: Long) {
            extra?.onSessionEnded(generation)
        }

        fun await(ms: Long) = latch.await(ms, TimeUnit.MILLISECONDS)
    }

    private class Watcher(engine: AudioInputEngine) {
        val seen = CopyOnWriteArrayList<SessionSnapshot>()
        private val lock = Object()

        init {
            engine.addListener(SessionListener { s ->
                synchronized(lock) {
                    seen += s
                    lock.notifyAll()
                }
            })
        }

        fun await(ms: Long, predicate: (SessionSnapshot) -> Boolean): Boolean {
            val deadline = System.currentTimeMillis() + ms
            synchronized(lock) {
                while (true) {
                    if (seen.isNotEmpty() && predicate(seen.last())) return true
                    val left = deadline - System.currentTimeMillis()
                    if (left <= 0) return false
                    lock.wait(left)
                }
            }
        }
    }

    private class Run(
        val blocks: List<Captured>,
        val totalFrames: Long,
        val sawRunning: Boolean,
        val finalSnapshot: SessionSnapshot?,
    )

    private fun runSession(
        framesPerRead: Int,
        steps: List<Step>,
        blocks: Int,
        waitForRunning: Boolean = false,
        waitForStop: Boolean = false,
        extra: InputConsumer? = null,
    ): Run {
        val source = ScriptedPcmSource(steps, framesPerRead)
        val engine = AudioInputEngine(ScriptedSourceFactory(listOf(source)))
        val watch = Watcher(engine)
        try {
            val rec = Recorder(engine, extra, blocks)
            check(engine.start(rec)) { "start refused" }
            rec.await(timeoutMs)
            if (waitForRunning) watch.await(timeoutMs) { it.state == EngineState.RUNNING }
            if (waitForStop) {
                watch.await(timeoutMs) { it.state == EngineState.STOPPED && it.generation > 0 }
            } else {
                // Let the source finish its script so a stray extra block would be caught.
                val deadline = System.currentTimeMillis() + timeoutMs
                while (source.stepsServed.get() < steps.size && System.currentTimeMillis() < deadline) Thread.sleep(2)
                Thread.sleep(20)
                engine.stop()
                watch.await(timeoutMs) { it.state == EngineState.STOPPED && it.generation > 0 }
            }
            return Run(
                rec.blocks.toList(),
                rec.blocks.sumOf { it.count.toLong() },
                watch.seen.any { it.state == EngineState.RUNNING },
                watch.seen.lastOrNull(),
            )
        } finally {
            engine.close()
        }
    }

    private fun sameBits(a: FloatArray, b: FloatArray) =
        a.size == b.size && a.indices.all { java.lang.Float.floatToRawIntBits(a[it]) == java.lang.Float.floatToRawIntBits(b[it]) }

    private fun fmt(a: FloatArray) = a.joinToString(prefix = "[", postfix = "]") { java.math.BigDecimal(it.toDouble()).stripTrailingZeros().toPlainString() }

    private fun describe(blocks: List<Captured>) =
        if (blocks.isEmpty()) "no blocks" else blocks.joinToString("; ") { "frame ${it.first} count ${it.count} ${fmt(it.samples)}" }
}
