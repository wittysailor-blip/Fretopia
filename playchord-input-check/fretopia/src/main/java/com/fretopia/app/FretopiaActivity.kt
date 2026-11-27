package com.fretopia.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.playchord.inputcheck.InputCheckActivity

/**
 * Fretopia for Android: the web app (bundled in the APK) in a WebView, listening through the native
 * PlayChord audio-input engine via [NativeBridge]. Microphone check opens the native Input Check screen.
 */
class FretopiaActivity : ComponentActivity(), NativeBridge.Host {

    lateinit var webView: WebView
        private set
    lateinit var bridge: NativeBridge
        private set

    private val clipHandler by lazy { ClipHandler(this) }
    private var pendingWebPermission: PermissionRequest? = null

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        bridge.onMicPermissionResult(granted, shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO))
    }

    private val webPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        pendingWebPermission?.let { grantWhatWeCan(it) }
        pendingWebPermission = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true

        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#FAFAF9")) }
        webView = WebView(this).apply { setBackgroundColor(Color.parseColor("#FAFAF9")) }
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // Keep the page clear of the status bar, navigation bar and camera cut-out.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true) // YouTube player

        bridge = NativeBridge(this)
        val nativeMic = bridge.attach(webView, ORIGIN)
        if (!nativeMic) Log.w(TAG, "WebView too old for the native bridge; the web app will use its own microphone path")

        val assets = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                if (request.isForMainFrame) openExternal(request.url) // e.g. "Listen on YouTube"
                return request.isForMainFrame
            }

            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // Camera (and, on old WebViews, microphone) for clips recorded inside the page.
                if (request.origin.host != HOST) return request.deny()
                val needed = androidPermissionsFor(request).filter { !has(it) }
                if (needed.isEmpty()) grantWhatWeCan(request) else {
                    pendingWebPermission = request
                    webPermissions.launch(needed.toTypedArray())
                }
            }

            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.d(TAG, "web: ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("typeof nativeBack==='function'&&nativeBack()") { handled ->
                    if (handled != "true") finish()
                }
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState) else webView.loadUrl(START_URL)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onStart() {
        super.onStart()
        // Coming back from another screen (Microphone check, a share sheet): make sure the page repaints.
        webView.invalidate()
        webView.post { webView.invalidate() }
        bridge.onAppVisible()
    }

    override fun onStop() {
        bridge.onAppHidden() // capture stops in the background; the page itself is paused by the system
        super.onStop()
    }

    override fun onDestroy() {
        bridge.close()
        webView.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- NativeBridge.Host

    override fun hasMicPermission() = has(Manifest.permission.RECORD_AUDIO)

    override fun requestMicPermission() = micPermission.launch(Manifest.permission.RECORD_AUDIO)

    override fun openMicCheck() {
        startActivity(Intent(this, InputCheckActivity::class.java).putExtra(InputCheckActivity.EXTRA_TITLE, "Microphone check").putExtra(InputCheckActivity.EXTRA_APP_NAME, "Fretopia"))
    }

    override fun clips() = clipHandler

    // ---------------------------------------------------------------- helpers

    private fun has(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun androidPermissionsFor(r: PermissionRequest): List<String> = r.resources.mapNotNull {
        when (it) {
            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
            else -> null
        }
    }

    private fun grantWhatWeCan(r: PermissionRequest) {
        val ok = r.resources.filter {
            (it == PermissionRequest.RESOURCE_VIDEO_CAPTURE && has(Manifest.permission.CAMERA)) ||
                (it == PermissionRequest.RESOURCE_AUDIO_CAPTURE && has(Manifest.permission.RECORD_AUDIO))
        }
        if (ok.isEmpty()) r.deny() else r.grant(ok.toTypedArray())
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
        }
    }

    companion object {
        private const val TAG = "Fretopia"
        const val HOST = "appassets.androidplatform.net"
        const val ORIGIN = "https://$HOST"
        const val START_URL = "$ORIGIN/assets/web/index.html"
    }
}
