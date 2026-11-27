package com.playchord.inputcheck

import android.Manifest
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import com.playchord.audioinput.AudioInputEngine
import com.playchord.audioinput.AudioRecordSourceFactory
import com.playchord.audioinput.CaptureError
import com.playchord.audioinput.EngineState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** The synthetic self-test, run on the device's own runtime. */
@RunWith(AndroidJUnit4::class)
class OnDeviceSelfTest {
    @Test
    fun everySyntheticCasePassesOnDevice() {
        val results = SelfTestRunner().runAll()
        val failed = results.filterNot { it.passed }
        assertTrue(failed.joinToString("\n") { "${it.name}: expected ${it.expected}; actual ${it.actual}" }, failed.isEmpty())
    }
}

/**
 * Real AudioRecord capture through the production module. On an emulator the "microphone" is virtual,
 * so this proves the platform path and lifecycle, not that a physical microphone hears a guitar.
 */
@RunWith(AndroidJUnit4::class)
class RecorderCaptureTest {
    @get:Rule
    val mic: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    private fun waitFor(engine: AudioInputEngine, ms: Long, predicate: () -> Boolean): Boolean {
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) {
            if (predicate()) return true
            Thread.sleep(10)
        }
        return predicate()
    }

    @Test
    fun capturesOrderedBlocksStopsAndRestartsCleanly() {
        val engine = AudioInputEngine(AudioRecordSourceFactory())
        val consumer = DiagnosticConsumer()
        try {
            assertTrue(engine.start(consumer))
            val reached = waitFor(engine, 5_000) { val st = engine.snapshot; st.generation > 0 && (st.state == EngineState.RUNNING || st.state == EngineState.STOPPED) }
            val first = engine.snapshot
            assumeFalse("this device does not offer 44,100 Hz mono PCM16: ${first.error}", first.error is CaptureError.UnsupportedFormat)
            assertTrue("never reached RUNNING: $first", reached && first.state == EngineState.RUNNING)
            assertEquals(44_100, first.info!!.format.sampleRateHz)
            assertEquals(1, first.info!!.format.channelCount)

            Thread.sleep(3_000)
            val d1 = consumer.snapshot()
            assertTrue("too few frames: ${d1.totalFrames}", d1.totalFrames > 44_100) // more than one second in three
            assertEquals(0L, d1.gaps)
            assertEquals(0L, d1.overlaps)
            assertEquals(0L, d1.firstFrameOfSession)

            engine.stop()
            assertTrue(waitFor(engine, 3_000) { engine.snapshot.state == EngineState.STOPPED })
            val frozen = consumer.snapshot().totalFrames
            Thread.sleep(300)
            assertEquals("counters kept moving after stop", frozen, consumer.snapshot().totalFrames)

            assertTrue(engine.start(consumer))
            assertTrue(waitFor(engine, 5_000) { engine.snapshot.generation == first.generation + 1 && engine.snapshot.state == EngineState.RUNNING })
            assertEquals(first.generation + 1, engine.snapshot.generation)
            Thread.sleep(500)
            val d2 = consumer.snapshot()
            assertEquals(first.generation + 1, d2.generation)
            assertEquals(0L, d2.firstFrameOfSession)
            assertTrue(d2.totalFrames < frozen) // counters restarted
            assertEquals(0L, d2.gaps)
            assertEquals(0L, d2.overlaps)
        } finally {
            engine.close()
        }
    }
}
