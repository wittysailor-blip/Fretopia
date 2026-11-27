package com.fretopia.app

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.playchord.audioinput.AudioInputEngine
import com.playchord.audioinput.AudioRecordSourceFactory
import com.playchord.audioinput.CaptureError
import com.playchord.audioinput.InputConsumer
import com.playchord.audioinput.OutputBlock
import com.playchord.audioinput.SessionSnapshot
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicInteger

/**
 * Connects the bundled Fretopia web app to the native PlayChord audio-input engine.
 *
 * The web app sees a `FretopiaNative` object, injected only for the app's own origin. It sends JSON
 * commands; the bridge answers with JSON state messages and binary audio blocks:
 * `[float64 generation, float64 firstOutputFrame, float64 count, float64 discontinuity] + float32[count]`.
 */
class NativeBridge(
    private val host: Host,
    private val engine: AudioInputEngine = AudioInputEngine(AudioRecordSourceFactory()),
) : WebViewCompat.WebMessageListener {

    interface Host {
        fun hasMicPermission(): Boolean
        fun requestMicPermission()
        fun openMicCheck()
        fun clips(): ClipHandler
    }

    private val main = Handler(Looper.getMainLooper())
    private var reply: JavaScriptReplyProxy? = null
    private var binary = false

    /** Blocks posted to the UI thread but not yet sent. Beyond the cap, blocks are dropped (the web side sees a frame gap). */
    private val inFlight = AtomicInteger(0)

    @Volatile
    var droppedBlocks = 0L
        private set

    /** The consumer registered with the engine: copies each borrowed block into an owned message. */
    private val consumer = object : InputConsumer {
        override fun onBlock(block: OutputBlock): Boolean {
            if (inFlight.get() >= MAX_IN_FLIGHT) {
                droppedBlocks++
                return false
            }
            val bytes = ByteArray(HEADER_BYTES + block.count * 4)
            val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            buf.putDouble(block.generation.toDouble())
            buf.putDouble(block.firstOutputFrame.toDouble())
            buf.putDouble(block.count.toDouble())
            buf.putDouble(if (block.discontinuityBefore) 1.0 else 0.0)
            buf.asFloatBuffer().put(block.samples, 0, block.count)
            inFlight.incrementAndGet()
            main.post {
                inFlight.decrementAndGet()
                sendAudio(bytes)
            }
            return true
        }
    }

    init {
        engine.addListener { s -> main.post { sendState(s) } }
    }

    /** Registers the bridge on [webView] for [origin]. Returns false if this WebView is too old. */
    fun attach(webView: WebView, origin: String): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        binary = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)
        WebViewCompat.addWebMessageListener(webView, "FretopiaNative", setOf(origin), this)
        return true
    }

    override fun onPostMessage(
        view: WebView,
        message: WebMessageCompat,
        sourceOrigin: Uri,
        isMainFrame: Boolean,
        replyProxy: JavaScriptReplyProxy,
    ) {
        if (!isMainFrame) return
        reply = replyProxy
        val text = message.data ?: return
        val m = try {
            JSONObject(text)
        } catch (e: Exception) {
            return
        }
        when (m.optString("t")) {
            "hello" -> sendState(engine.snapshot)
            "mic-start" -> startMic()
            "mic-stop" -> engine.stop()
            "open-mic-check" -> {
                engine.stop()
                host.openMicCheck()
            }
            "file-begin" -> host.clips().begin(m.getString("id"), m.optString("name", "fretopia-take.mp4"), m.optString("mime", "video/mp4"))
            "file-chunk" -> host.clips().chunk(m.getString("id"), m.getString("d"))
            "file-end" -> host.clips().end(m.getString("id"), m.optString("action", "share")) { ok, action ->
                send(JSONObject().put("t", "file-done").put("ok", ok).put("action", action))
            }
        }
    }

    fun startMic() {
        if (!host.hasMicPermission()) {
            host.requestMicPermission()
            return
        }
        if (!engine.start(consumer)) sendState(engine.snapshot) // already starting or running
    }

    fun onMicPermissionResult(granted: Boolean, canAskAgain: Boolean) {
        if (granted) {
            startMic()
        } else {
            send(
                JSONObject().put("t", "mic-state").put("state", "STOPPED").put("gen", engine.snapshot.generation)
                    .put("error", if (canAskAgain) "denied" else "denied-permanent"),
            )
        }
    }

    /** The app went to the background: capture never continues there (Gate A). */
    fun onAppHidden() = engine.stop()

    /** The app is visible again: the web side restarts the mic if it was in use. */
    fun onAppVisible() = send(JSONObject().put("t", "resume"))

    fun close() = engine.close()

    val snapshot: SessionSnapshot get() = engine.snapshot

    // ---------------------------------------------------------------- sending (UI thread)

    private fun sendState(s: SessionSnapshot) {
        val o = JSONObject().put("t", "mic-state").put("state", s.state.name).put("gen", s.generation)
        s.info?.let { o.put("rate", it.format.sampleRateHz).put("channels", it.format.channelCount) }
        errorCode(s.error)?.let { o.put("error", it) }
        send(o)
    }

    private fun errorCode(e: CaptureError?): String? = when (e) {
        null -> null
        is CaptureError.PermissionDenied -> "denied"
        is CaptureError.UnsupportedFormat -> "unsupported"
        is CaptureError.InitFailed, is CaptureError.StartFailed -> "busy"
        else -> "other"
    }

    private fun send(o: JSONObject) {
        try {
            reply?.postMessage(o.toString())
        } catch (e: Exception) {
            Log.w(TAG, "send failed", e)
        }
    }

    private fun sendAudio(bytes: ByteArray) {
        val r = reply ?: return
        try {
            if (binary) r.postMessage(bytes) else r.postMessage("A:" + Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (e: Exception) {
            binary = false // fall back to text if this WebView refuses binary messages
        }
    }

    companion object {
        private const val TAG = "FretopiaBridge"
        private const val HEADER_BYTES = 32
        private const val MAX_IN_FLIGHT = 64
    }
}
