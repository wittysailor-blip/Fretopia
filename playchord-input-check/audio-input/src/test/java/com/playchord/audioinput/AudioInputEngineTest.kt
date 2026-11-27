package com.playchord.audioinput

import com.playchord.audioinput.ScriptedPcmSource.Step
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class AudioInputEngineTest {

    private class Got(val generation: Long, val first: Long, val samples: FloatArray, val time: Long, val state: EngineState)

    private class Collector(private val engine: () -> AudioInputEngine, expected: Int) : InputConsumer {
        val got = CopyOnWriteArrayList<Got>()
        val events = CopyOnWriteArrayList<String>()
        private val latch = CountDownLatch(expected)
        override fun onSessionStarting(session: SessionInfo) {
            events += "starting ${session.generation}"
        }

        override fun onBlock(block: OutputBlock): Boolean {
            got += Got(block.generation, block.firstOutputFrame, block.toFloatArray(), block.firstFrameTimeNs, engine().snapshot.state)
            latch.countDown()
            return true
        }

        override fun onSessionEnded(generation: Long) {
            events += "ended $generation"
        }

        fun await() = assertTrue("blocks did not arrive", latch.await(3, TimeUnit.SECONDS))
    }

    private val engines = mutableListOf<AudioInputEngine>()
    private val snapshots = CopyOnWriteArrayList<SessionSnapshot>()

    private fun engineFor(vararg sources: ScriptedPcmSource): AudioInputEngine {
        val e = AudioInputEngine(ScriptedSourceFactory(sources.toList()))
        e.addListener { snapshots += it }
        engines += e
        return e
    }

    @After
    fun tearDown() = engines.forEach { it.close() }

    private fun awaitState(e: AudioInputEngine, state: EngineState, generation: Long? = null) {
        val deadline = System.currentTimeMillis() + 3_000
        while (System.currentTimeMillis() < deadline) {
            val s = e.snapshot
            if (s.state == state && (generation == null || s.generation == generation)) return
            Thread.sleep(2)
        }
        throw AssertionError("expected $state, got ${e.snapshot}")
    }

    @Test
    fun convertsExactlyAndInOrder() {
        val src = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(-32768, 0, 16384, 32767)), 4)
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 1)
        e = engineFor(src)
        assertTrue(e.start(c))
        c.await()
        assertArrayEquals(floatArrayOf(-1.0f, 0.0f, 0.5f, 0.999969482421875f), c.got[0].samples, 0f)
        assertEquals(0L, c.got[0].first)
        assertEquals(1L, c.got[0].generation)
    }

    @Test
    fun firstBlockArrivesWhileStartingThenRunning() {
        val src = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(1, 2, 3, 4)), 4)
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 1)
        e = engineFor(src)
        e.start(c)
        c.await()
        assertEquals(EngineState.STARTING, c.got[0].state)
        awaitState(e, EngineState.RUNNING)
        // the consumer was initialised before capture started
        assertEquals("starting 1", c.events[0])
    }

    @Test
    fun shortReadDeliversOnlyNewSamples() {
        val src = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(10, 20, 30, 40), ScriptedPcmSource.samples(50, 60)), 4)
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 2)
        e = engineFor(src)
        e.start(c)
        c.await()
        assertArrayEquals(floatArrayOf(50 / 32768f, 60 / 32768f), c.got[1].samples, 0f)
        assertEquals(4L, c.got[1].first)
    }

    @Test
    fun zeroReadDeliversNothingAndErrorStopsWithoutStaleAudio() {
        val src = ScriptedPcmSource(
            listOf(ScriptedPcmSource.samples(1, 2, 3, 4), Step.Zero, ScriptedPcmSource.samples(5, 6, 7, 8), Step.Error(-6), ScriptedPcmSource.samples(9, 9, 9, 9)),
            4,
        )
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 2)
        e = engineFor(src)
        e.start(c)
        c.await()
        awaitState(e, EngineState.STOPPED, 1)
        Thread.sleep(30)
        assertEquals(listOf(0L, 4L), c.got.map { it.first })
        val err = e.snapshot.error
        assertTrue(err is CaptureError.ReadError && err.code == -6)
        assertTrue(snapshots.any { it.state == EngineState.FAILED })
        assertTrue(src.isReleased)
    }

    @Test
    fun framesAreContiguousAcrossBlockSizes() {
        val src = ScriptedPcmSource(
            listOf(ScriptedPcmSource.samples(1, 1, 1), ScriptedPcmSource.samples(2, 2, 2, 2, 2, 2, 2), ScriptedPcmSource.samples(3), ScriptedPcmSource.samples(4, 4, 4, 4, 4)),
            8,
        )
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 4)
        e = engineFor(src)
        e.start(c)
        c.await()
        assertEquals(listOf(0L, 3L, 10L, 11L), c.got.map { it.first })
        // arrival-anchored timestamps never go backwards
        assertTrue(c.got.zipWithNext().all { (a, b) -> b.time >= a.time })
    }

    @Test
    fun restartStartsANewGenerationAtFrameZeroAndIgnoresLateEvents() {
        val a = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(5, 5, 5, 5)), 4)
        val b = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(6, 6, 6, 6)), 4)
        lateinit var e: AudioInputEngine
        val c1 = Collector({ e }, 1)
        val c2 = Collector({ e }, 1)
        e = engineFor(a, b)
        e.start(c1)
        c1.await()
        e.stop()
        awaitState(e, EngineState.STOPPED, 1)
        assertTrue(a.isReleased)
        assertEquals(listOf("starting 1", "ended 1"), c1.events.toList())

        e.start(c2)
        c2.await()
        awaitState(e, EngineState.RUNNING, 2)
        assertEquals(2L, c2.got[0].generation)
        assertEquals(0L, c2.got[0].first)

        assertFalse(e.injectLateEventsFromPreviousSessionForTest(ShortArray(4) { 32767 }, 4))
        Thread.sleep(30)
        assertEquals(1, c2.got.size)
        assertEquals(1, c1.got.size)
        assertEquals(EngineState.RUNNING, e.snapshot.state)
    }

    @Test
    fun rapidStartsCreateOnlyOneSession() {
        val a = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(1, 2, 3, 4)), 4)
        val b = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(1, 2, 3, 4)), 4)
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 1)
        e = engineFor(a, b)
        val accepted = (1..10).count { e.start(c) }
        assertEquals(1, accepted)
        c.await()
        Thread.sleep(30)
        assertEquals(1L, e.snapshot.generation)
        assertFalse(b.isReleased) // never opened
    }

    @Test
    fun stopUnblocksAWaitingReadAndReleasesAfterTheWorkerEnds() {
        val src = ScriptedPcmSource(emptyList(), 4) // read blocks until stop
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 0)
        e = engineFor(src)
        e.start(c)
        awaitState(e, EngineState.STARTING)
        e.stop()
        awaitState(e, EngineState.STOPPED, 1)
        assertTrue(src.isReleased)
        assertTrue(c.got.isEmpty())
    }

    @Test
    fun unsupportedFormatIsReportedWithTheObservedFormat() {
        val src = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(1)), 4, StreamFormat(48_000, 2, PcmEncoding.PCM_16BIT))
        lateinit var e: AudioInputEngine
        val c = Collector({ e }, 0)
        e = engineFor(src)
        e.start(c)
        awaitState(e, EngineState.STOPPED, 1)
        val err = e.snapshot.error as CaptureError.UnsupportedFormat
        assertEquals(48_000, err.observed.sampleRateHz)
        assertEquals(2, err.observed.channelCount)
        assertTrue(src.isReleased)
    }

    @Test
    fun consumerFailureDuringInitAbortsTheStart() {
        val src = ScriptedPcmSource(listOf(ScriptedPcmSource.samples(1, 2, 3, 4)), 4)
        val e = engineFor(src)
        val bad = object : InputConsumer {
            override fun onSessionStarting(session: SessionInfo) = throw IllegalStateException("no memory")
            override fun onBlock(block: OutputBlock) = true
        }
        e.start(bad)
        awaitState(e, EngineState.STOPPED, 1)
        assertTrue(e.snapshot.error is CaptureError.ConsumerInitFailed)
        assertTrue(src.isReleased)
        // the failed start released its claim, so a new start is accepted
        assertTrue(e.start(Collector({ e }, 0)))
    }
}
