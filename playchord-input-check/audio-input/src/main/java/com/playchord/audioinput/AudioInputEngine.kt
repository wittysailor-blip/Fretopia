package com.playchord.audioinput

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * The reusable PlayChord microphone engine (Blueprint 5 §0, Build Gate A).
 *
 * - One serialized control owner (a single thread) changes state, generation and resources.
 * - Capture runs on its own worker thread, reuses its buffers and never touches UI.
 * - Consumers receive [OutputBlock]s synchronously on the capture thread.
 *
 * ```
 * val engine = AudioInputEngine(AudioRecordSourceFactory())
 * engine.addListener { snapshot -> /* state for your UI */ }
 * engine.start(myConsumer)   // after RECORD_AUDIO is granted
 * engine.stop()
 * ```
 */
class AudioInputEngine(
    private val sourceFactory: PcmSourceFactory,
    private val request: CaptureRequest = CaptureRequest(),
    private val stopTimeoutMs: Long = 2_000,
    private val clockNs: () -> Long = System::nanoTime,
) {
    private val control: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "PlayChordAudioControl").apply { isDaemon = true }
    }
    private val listeners = CopyOnWriteArrayList<SessionListener>()

    /** True from an accepted start request until that session has fully stopped. Prevents two recorders. */
    private val busy = AtomicBoolean(false)

    /** The generation allowed to deliver. Published before capture starts (§0.3). */
    private val activeGeneration = AtomicLong(0)

    // Control-thread state.
    private var lastGeneration = 0L
    private var session: Session? = null
    private var retiredProcessor: BlockProcessor? = null

    @Volatile
    private var current: SessionSnapshot = SessionSnapshot.INITIAL

    /** The latest snapshot (state, generation, format, last error). */
    val snapshot: SessionSnapshot get() = current

    /** Adds a listener and immediately sends it the current snapshot. Called on the control thread afterwards. */
    fun addListener(listener: SessionListener) {
        listeners += listener
        listener.onSnapshot(current)
    }

    fun removeListener(listener: SessionListener) {
        listeners -= listener
    }

    /**
     * Requests a new session with [consumer]. Returns false (and does nothing) if a session is
     * already starting, running or stopping, so rapid taps can never create two recorders.
     * The caller must already hold the RECORD_AUDIO permission.
     */
    fun start(consumer: InputConsumer): Boolean {
        if (!busy.compareAndSet(false, true)) return false
        control.execute { doStart(consumer) }
        return true
    }

    /** Requests a stop. Safe to call at any time, any number of times. */
    fun stop() {
        control.execute { doStop() }
    }

    /** Stops capture and shuts the control thread down. The engine can't be used afterwards. */
    fun close() {
        control.execute { doStop() }
        control.shutdown()
        control.awaitTermination(stopTimeoutMs + 1_000, TimeUnit.MILLISECONDS)
    }

    /**
     * Test hook: simulates a late block and a late "first block accepted" event from the most recently
     * stopped generation. Returns true if the late block reached a consumer (it never should).
     */
    fun injectLateEventsFromPreviousSessionForTest(pcm: ShortArray, count: Int): Boolean {
        val result = java.util.concurrent.CompletableFuture<Boolean>()
        control.execute {
            val old = retiredProcessor
            if (old == null) {
                result.complete(false)
                return@execute
            }
            // A worker that is already gone, but whose last read only now "returns".
            val outcome = old.process(pcm, count)
            onFirstBlockAccepted(old.generation)
            onCaptureError(old.generation, -1, "late error")
            result.complete(outcome == BlockProcessor.Outcome.ACCEPTED || outcome == BlockProcessor.Outcome.REJECTED)
        }
        return result.get(stopTimeoutMs, TimeUnit.MILLISECONDS)
    }

    // ---------------------------------------------------------------- control thread

    private fun publish(state: EngineState, generation: Long, info: SessionInfo?, error: CaptureError?) {
        val s = SessionSnapshot(state, generation, info, error)
        current = s
        for (l in listeners) {
            try {
                l.onSnapshot(s)
            } catch (_: Throwable) {
            }
        }
    }

    private fun failBeforeCapture(generation: Long, error: CaptureError, info: SessionInfo? = null) {
        publish(EngineState.FAILED, generation, info, error)
        publish(EngineState.STOPPED, generation, info, error)
        busy.set(false)
    }

    private fun doStart(consumer: InputConsumer) {
        if (session != null) return // defensive: busy should already prevent this
        val generation = ++lastGeneration
        publish(EngineState.OPENING, generation, null, null)

        val source = when (val opened = try {
            sourceFactory.open(request)
        } catch (e: SecurityException) {
            OpenResult.Failed(CaptureError.PermissionDenied)
        } catch (e: Throwable) {
            OpenResult.Failed(CaptureError.InitFailed(e.message ?: e.javaClass.simpleName))
        }) {
            is OpenResult.Failed -> return failBeforeCapture(generation, opened.error)
            is OpenResult.Opened -> opened.source
        }

        val info = SessionInfo(generation, source.format, source.framesPerRead, source.minBufferBytes, source.recorderBufferBytes)
        if (!source.format.isGateASupported) {
            source.release()
            return failBeforeCapture(generation, CaptureError.UnsupportedFormat(source.format), info)
        }
        if (source.framesPerRead <= 0) {
            source.release()
            return failBeforeCapture(generation, CaptureError.InitFailed("read size ${source.framesPerRead} frames"), info)
        }
        publish(EngineState.READY, generation, info, null)

        // Allocate everything before capture, and initialise the consumer before starting it.
        val pcm = ShortArray(source.framesPerRead)
        val processor = BlockProcessor(
            generation, activeGeneration, consumer, source.framesPerRead,
            source.format.sampleRateHz, clockNs,
        ) { g -> control.execute { onFirstBlockAccepted(g) } }
        try {
            consumer.onSessionStarting(info)
        } catch (t: Throwable) {
            source.release()
            return failBeforeCapture(generation, CaptureError.ConsumerInitFailed(t.message ?: t.javaClass.simpleName), info)
        }

        activeGeneration.set(generation) // publish generation before start
        publish(EngineState.STARTING, generation, info, null)
        try {
            source.start()
        } catch (e: CaptureException) {
            activeGeneration.set(0)
            source.release()
            consumer.onSessionEnded(generation)
            return failBeforeCapture(generation, e.error, info)
        } catch (e: SecurityException) {
            activeGeneration.set(0)
            source.release()
            consumer.onSessionEnded(generation)
            return failBeforeCapture(generation, CaptureError.PermissionDenied, info)
        } catch (e: Throwable) {
            activeGeneration.set(0)
            source.release()
            consumer.onSessionEnded(generation)
            return failBeforeCapture(generation, CaptureError.StartFailed(e.message ?: e.javaClass.simpleName), info)
        }

        val s = Session(generation, info, source, consumer, processor, pcm)
        session = s
        processor.deliveryEnabled = true // capture has begun and the consumer is ready
        s.worker.start()
    }

    /** Owner notification from the capture thread: the first valid block was accepted. */
    private fun onFirstBlockAccepted(generation: Long) {
        val s = session ?: return
        if (s.generation != generation) return // stale event from an older generation
        if (current.state == EngineState.STARTING) publish(EngineState.RUNNING, generation, s.info, null)
    }

    /** Owner notification from the capture thread: a read failed. */
    private fun onCaptureError(generation: Long, code: Int, codeName: String) {
        val s = session ?: return
        if (s.generation != generation) return // stale
        s.error = CaptureError.ReadError(code, codeName)
        publish(EngineState.FAILED, generation, s.info, s.error)
        doStop()
    }

    private fun doStop() {
        val s = session ?: return
        if (!s.stopping) {
            s.stopping = true
            publish(EngineState.STOPPING, s.generation, s.info, s.error)
            // 1. disable delivery, 2. unblock the read, 3. wait for the worker, 4. release.
            s.processor.deliveryEnabled = false
            s.running.set(false)
            try {
                s.source.requestStop()
            } catch (_: Throwable) {
            }
        }
        s.worker.join(stopTimeoutMs) // a later stop() retries the wait after a timeout
        if (s.worker.isAlive) {
            // Never free a recorder the worker might still be using.
            s.error = CaptureError.StopTimeout
            publish(EngineState.FAILED, s.generation, s.info, s.error)
            return
        }
        try {
            s.source.release()
        } catch (_: Throwable) {
        }
        try {
            s.consumer.onSessionEnded(s.generation)
        } catch (_: Throwable) {
        }
        retiredProcessor = s.processor
        session = null
        publish(EngineState.STOPPED, s.generation, s.info, s.error)
        busy.set(false)
    }

    // ---------------------------------------------------------------- capture thread

    private inner class Session(
        val generation: Long,
        val info: SessionInfo,
        val source: PcmSource,
        val consumer: InputConsumer,
        val processor: BlockProcessor,
        private val pcm: ShortArray,
    ) {
        val running = AtomicBoolean(true)
        var stopping = false // control thread only
        var error: CaptureError? = null // control thread only

        val worker = Thread({ captureLoop() }, "PlayChordCapture-$generation")

        private fun captureLoop() {
            try {
                source.onCaptureThreadStart()
            } catch (_: Throwable) {
            }
            var zeroReads = 0
            while (running.get()) {
                val n = try {
                    source.read(pcm, 0, pcm.size)
                } catch (t: Throwable) {
                    if (running.get()) control.execute { onCaptureError(generation, Int.MIN_VALUE, t.javaClass.simpleName) }
                    return
                }
                if (!running.get()) return // stop requested while we were blocked: drop whatever came back
                when {
                    n > 0 -> {
                        zeroReads = 0
                        processor.process(pcm, minOf(n, pcm.size))
                    }
                    n == 0 -> {
                        // Nothing to deliver. Back off a little if a source keeps returning zero.
                        if (++zeroReads > 64) Thread.sleep(1)
                    }
                    else -> {
                        val name = source.describeReadError(n)
                        control.execute { onCaptureError(generation, n, name) }
                        return
                    }
                }
            }
        }
    }
}
