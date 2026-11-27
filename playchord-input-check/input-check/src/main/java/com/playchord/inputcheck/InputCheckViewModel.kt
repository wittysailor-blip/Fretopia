package com.playchord.inputcheck

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.playchord.audioinput.AudioInputEngine
import com.playchord.audioinput.AudioRecordSourceFactory
import com.playchord.audioinput.EngineState
import com.playchord.audioinput.SessionListener
import com.playchord.audioinput.SessionSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Everything the meter and diagnostics panel show. Values are null before the first session. */
data class LiveUi(
    val peakDbfs: Double? = null,
    /** 0..1 bar position, with a short release so a pluck stays visible. */
    val meterLevel: Float = 0f,
    val loudestDbfs: Double? = null,
    val diag: DiagnosticConsumer.Snapshot? = null,
)

sealed class PermissionUi {
    object Unknown : PermissionUi()
    object Granted : PermissionUi()

    /** Denied; [permanently] means Android will not ask again, so only Settings can change it. */
    class Denied(val permanently: Boolean) : PermissionUi()
}

sealed class SelfTestUi {
    object NotRun : SelfTestUi()
    object Running : SelfTestUi()
    class Done(val results: List<SelfTestResult>) : SelfTestUi()
}

class InputCheckViewModel(
    private val engine: AudioInputEngine = AudioInputEngine(AudioRecordSourceFactory()),
) : ViewModel() {

    /** The test consumer registered with the engine. The meter is driven only from here. */
    val consumer = DiagnosticConsumer()

    private val _session = MutableStateFlow(SessionSnapshot.INITIAL)
    val session: StateFlow<SessionSnapshot> = _session.asStateFlow()

    private val _live = MutableStateFlow(LiveUi())
    val live: StateFlow<LiveUi> = _live.asStateFlow()

    private val _permission = MutableStateFlow<PermissionUi>(PermissionUi.Unknown)
    val permission: StateFlow<PermissionUi> = _permission.asStateFlow()

    private val _selfTest = MutableStateFlow<SelfTestUi>(SelfTestUi.NotRun)
    val selfTest: StateFlow<SelfTestUi> = _selfTest.asStateFlow()

    private val _backgroundStop = MutableStateFlow(false)
    val stoppedForBackground: StateFlow<Boolean> = _backgroundStop.asStateFlow()

    private val listener = SessionListener { s -> _session.value = s }

    init {
        engine.addListener(listener)
        viewModelScope.launch { pollDiagnostics() }
    }

    fun onPermissionResult(granted: Boolean, canAskAgain: Boolean) {
        _permission.value = if (granted) PermissionUi.Granted else PermissionUi.Denied(permanently = !canAskAgain)
        if (granted) start()
    }

    fun onPermissionAlreadyGranted() {
        _permission.value = PermissionUi.Granted
    }

    /** Starts a fresh session. Ignored if one is already starting, running or stopping. */
    fun start() {
        if (_session.value.isCapturing || _selfTest.value is SelfTestUi.Running) return
        _backgroundStop.value = false
        _live.value = LiveUi() // a new session clears the meter, counters and errors
        engine.start(consumer)
    }

    fun stop() = engine.stop()

    /** The app went to the background: stop, and require a fresh tap to start again. */
    fun stopForBackground() {
        if (_session.value.isCapturing) {
            _backgroundStop.value = true
            engine.stop()
        }
    }

    fun runSelfTest() {
        if (_session.value.isCapturing || _selfTest.value is SelfTestUi.Running) return
        _selfTest.value = SelfTestUi.Running
        viewModelScope.launch {
            val results = withContext(Dispatchers.Default) { SelfTestRunner().runAll() }
            _selfTest.value = SelfTestUi.Done(results)
        }
    }

    /** UI work at 10 Hz, off the capture thread. Counters freeze once the session stops. */
    private suspend fun pollDiagnostics() {
        var lastPolledGeneration = -1L
        var finalPollDone = true
        while (viewModelScope.isActive) {
            delay(100)
            val s = _session.value
            if (s.generation == 0L) continue
            if (s.generation != lastPolledGeneration) {
                lastPolledGeneration = s.generation
                finalPollDone = false
            }
            val capturing = s.isCapturing
            if (!capturing && finalPollDone) continue

            val d = consumer.snapshot()
            if (d.generation != s.generation) continue // consumer not yet reset for this session
            val prev = _live.value
            if (capturing) {
                val db = DiagnosticConsumer.peakDbfs(d.peakSinceLast)
                val target = levelOf(db)
                val level = maxOf(target, prev.meterLevel - RELEASE_PER_TICK)
                val loudest = if (d.blocks > 0) maxOf(prev.loudestDbfs ?: DiagnosticConsumer.FLOOR_DBFS, db) else prev.loudestDbfs
                _live.value = LiveUi(if (d.blocks > 0) db else prev.peakDbfs, level, loudest, d)
            } else {
                // Session is over: keep the last meter reading and freeze the counters.
                _live.value = prev.copy(diag = d)
                finalPollDone = true
            }
        }
    }

    override fun onCleared() {
        engine.removeListener(listener)
        engine.close()
    }

    companion object {
        const val METER_FLOOR_DB = -60.0
        private const val RELEASE_PER_TICK = 0.05f // the bar falls 3 dB per 100 ms after the string is muted

        fun levelOf(db: Double): Float = ((db - METER_FLOOR_DB) / -METER_FLOOR_DB).coerceIn(0.0, 1.0).toFloat()
    }
}

/** What the status line should say, mapped from the engine state and permission. */
enum class ScreenStatus { READY, STARTING, LISTENING, STOPPING, STOPPED, PERMISSION_DENIED, ERROR }

fun screenStatus(s: SessionSnapshot, p: PermissionUi): ScreenStatus = when {
    s.state == EngineState.OPENING || s.state == EngineState.READY || s.state == EngineState.STARTING -> ScreenStatus.STARTING
    s.state == EngineState.RUNNING -> ScreenStatus.LISTENING
    s.state == EngineState.STOPPING -> ScreenStatus.STOPPING
    s.state == EngineState.FAILED -> ScreenStatus.ERROR
    p is PermissionUi.Denied -> ScreenStatus.PERMISSION_DENIED
    s.error is com.playchord.audioinput.CaptureError.PermissionDenied -> ScreenStatus.PERMISSION_DENIED
    s.error != null -> ScreenStatus.ERROR
    s.generation == 0L -> ScreenStatus.READY
    else -> ScreenStatus.STOPPED
}
