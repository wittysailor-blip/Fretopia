package com.playchord.inputcheck

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * The microphone check screen. Used as the launcher of the standalone PlayChord Input Check app and
 * opened from inside Fretopia as "Microphone check" (pass [EXTRA_TITLE] to rename it).
 */
class InputCheckActivity : ComponentActivity() {

    companion object {
        const val EXTRA_TITLE = "com.playchord.inputcheck.TITLE"
        const val EXTRA_APP_NAME = "com.playchord.inputcheck.APP_NAME"
    }

    private val vm: InputCheckViewModel by viewModels()

    private val requestMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        // After a denial, Android only shows the rationale flag if it is still willing to ask.
        val canAskAgain = shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)
        vm.onPermissionResult(granted, canAskAgain)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF111113), background = Color(0xFFFAFAF9), surface = Color(0xFFFAFAF9))) {
                Surface(Modifier.fillMaxSize().safeDrawingPadding(), color = Color(0xFFFAFAF9)) {
                    val session by vm.session.collectAsStateWithLifecycle()
                    val live by vm.live.collectAsStateWithLifecycle()
                    val permission by vm.permission.collectAsStateWithLifecycle()
                    val selfTest by vm.selfTest.collectAsStateWithLifecycle()
                    val bg by vm.stoppedForBackground.collectAsStateWithLifecycle()
                    InputCheckScreen(
                        title = intent.getStringExtra(EXTRA_TITLE) ?: "PlayChord Input Check",
                        appName = intent.getStringExtra(EXTRA_APP_NAME) ?: "PlayChord",
                        session = session,
                        live = live,
                        permission = permission,
                        selfTest = selfTest,
                        stoppedForBackground = bg,
                        onStart = ::onStartTapped,
                        onStop = vm::stop,
                        onOpenSettings = ::openAppSettings,
                        onRunSelfTest = vm::runSelfTest,
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // The person may have granted the permission in Settings while we were away.
        if (hasMicPermission() && vm.permission.value is PermissionUi.Denied) vm.onPermissionAlreadyGranted()
    }

    override fun onStop() {
        super.onStop()
        // Capture never continues in the background; coming back needs a fresh tap on Start mic.
        if (!isChangingConfigurations) vm.stopForBackground()
    }

    private fun onStartTapped() {
        if (hasMicPermission()) {
            vm.onPermissionAlreadyGranted()
            vm.start()
        } else {
            requestMic.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun hasMicPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun openAppSettings() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
