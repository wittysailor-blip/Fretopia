package com.playchord.inputcheck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.playchord.audioinput.CaptureError
import com.playchord.audioinput.SessionSnapshot
import java.util.Locale

private val Good = Color(0xFF1F7A3D)
private val Bad = Color(0xFFB3261E)
private val Busy = Color(0xFF8A5A00)
private val Neutral = Color(0xFF5F5F64)

@Composable
fun InputCheckScreen(
    title: String = "PlayChord Input Check",
    session: SessionSnapshot,
    live: LiveUi,
    permission: PermissionUi,
    selfTest: SelfTestUi,
    stoppedForBackground: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onOpenSettings: () -> Unit,
    onRunSelfTest: () -> Unit,
) {
    val status = screenStatus(session, permission)
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // A. Header
        Column {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text("Pluck a string to check what reaches PlayChord.", style = MaterialTheme.typography.bodyLarge, color = Neutral)
        }

        // B. Session status and main button
        Section("Live microphone") {
            StatusLine(status, session, permission)
            if (stoppedForBackground && status == ScreenStatus.STOPPED) {
                Text(
                    "Stopped because the app went to the background. Tap Start mic for a fresh session.",
                    style = MaterialTheme.typography.bodyMedium, color = Neutral,
                )
            }
            Spacer(Modifier.height(4.dp))
            when (status) {
                ScreenStatus.READY, ScreenStatus.STOPPED -> BigButton("Start mic", enabled = selfTest !is SelfTestUi.Running, onClick = onStart)
                ScreenStatus.STARTING, ScreenStatus.LISTENING -> BigButton("Stop mic", onClick = onStop)
                ScreenStatus.STOPPING -> BigButton("Stopping…", enabled = false, onClick = {})
                ScreenStatus.PERMISSION_DENIED -> {
                    val permanently = (permission as? PermissionUi.Denied)?.permanently ?: true
                    if (permanently) {
                        BigButton("Open settings", onClick = onOpenSettings)
                        Spacer(Modifier.height(8.dp))
                        SecondaryButton("Try again", onClick = onStart)
                    } else {
                        BigButton("Try again", onClick = onStart)
                    }
                }
                ScreenStatus.ERROR -> {
                    if (session.isCapturing) BigButton("Stopping…", enabled = false, onClick = {})
                    else BigButton("Try again", onClick = onStart)
                }
            }
        }

        // C. Live input meter
        Section("Level received by processor") {
            Meter(live.meterLevel)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("−60", style = MaterialTheme.typography.labelSmall, color = Neutral)
                Text("−30", style = MaterialTheme.typography.labelSmall, color = Neutral)
                Text("0 dBFS", style = MaterialTheme.typography.labelSmall, color = Neutral)
            }
            Text(dbText(live.peakDbfs), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.SemiBold)
            Text("Peak over the last 0.1 s", style = MaterialTheme.typography.bodyMedium, color = Neutral)
            Text("Loudest this session: ${dbText(live.loudestDbfs)}", style = MaterialTheme.typography.bodyMedium, color = Neutral)
            Text(
                "Measured from the samples the test consumer received, not from the recorder.",
                style = MaterialTheme.typography.bodySmall, color = Neutral,
            )
        }

        // D. Diagnostics
        Section("Diagnostics") {
            val d = live.diag
            val info = session.info
            DiagRow("Session ID", if (session.generation > 0) session.generation.toString() else "–")
            DiagRow("Actual sample rate", info?.let { "${it.format.sampleRateHz} Hz" } ?: "–")
            DiagRow("Channels", info?.let { if (it.format.channelCount == 1) "1 (mono)" else it.format.channelCount.toString() } ?: "–")
            DiagRow("Read size", info?.let { "${it.framesPerRead} frames (min buffer ${it.minBufferBytes} bytes)" } ?: "–")
            DiagRow("Frames in latest block", d?.takeIf { it.blocks > 0 }?.latestBlockFrames?.toString() ?: "–")
            DiagRow("Total frames received", d?.totalFrames?.let { "%,d".format(Locale.US, it) } ?: "–")
            DiagRow("Frame gaps", d?.let { gapText(it.gaps, it.gapFrames) } ?: "–")
            DiagRow("Frame overlaps", d?.let { gapText(it.overlaps, it.overlapFrames) } ?: "–")
            DiagRow("Most recent capture error", session.error?.message ?: if (session.generation > 0) "None" else "–")
            HorizontalDivider(Modifier.padding(vertical = 4.dp))
            val continuity = when {
                d == null || d.blocks < 2 -> "–" to Neutral
                d.gaps == 0L && d.overlaps == 0L -> "Ordered: every block started where the previous one ended" to Good
                else -> "Problem: ${d.gaps} gap(s), ${d.overlaps} overlap(s)" to Bad
            }
            Text("Consumer continuity", style = MaterialTheme.typography.titleSmall)
            Text(continuity.first, color = continuity.second, style = MaterialTheme.typography.bodyMedium)
            Text(
                "Checks delivery at the app interface. It cannot detect every loss inside the phone's audio hardware.",
                style = MaterialTheme.typography.bodySmall, color = Neutral,
            )
        }

        // E. Self-test
        Section("Self-test (synthetic input)") {
            Text(
                "Feeds known samples through the same conversion and delivery code. It doesn't use the microphone, so it can't show that the microphone works.",
                style = MaterialTheme.typography.bodySmall, color = Neutral,
            )
            val canRun = !session.isCapturing && selfTest !is SelfTestUi.Running
            BigButton(if (selfTest is SelfTestUi.Running) "Running…" else "Run self-test", enabled = canRun, onClick = onRunSelfTest)
            if (session.isCapturing) Text("Stop the microphone to run the self-test.", style = MaterialTheme.typography.bodySmall, color = Neutral)
            when (selfTest) {
                SelfTestUi.NotRun -> {}
                SelfTestUi.Running -> Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(10.dp))
                    Text("Running…")
                }
                is SelfTestUi.Done -> {
                    val passed = selfTest.results.count { it.passed }
                    val all = passed == selfTest.results.size
                    Text(
                        if (all) "Passed: $passed of ${selfTest.results.size}" else "Failed: ${selfTest.results.size - passed} of ${selfTest.results.size}",
                        color = if (all) Good else Bad, style = MaterialTheme.typography.titleMedium,
                    )
                    selfTest.results.forEach { ResultRow(it) }
                }
            }
        }
    }
}

@Composable
private fun StatusLine(status: ScreenStatus, s: SessionSnapshot, p: PermissionUi) {
    val (label, color) = when (status) {
        ScreenStatus.READY -> "Ready" to Neutral
        ScreenStatus.STARTING -> "Starting microphone…" to Busy
        ScreenStatus.LISTENING -> "Listening" to Good
        ScreenStatus.STOPPING -> "Stopping…" to Busy
        ScreenStatus.STOPPED -> "Stopped" to Neutral
        ScreenStatus.PERMISSION_DENIED -> "Microphone permission denied" to Bad
        ScreenStatus.ERROR -> "Capture error" to Bad
    }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics { contentDescription = "Status: $label" }) {
        Box(Modifier.size(14.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(10.dp))
        Text(label, style = MaterialTheme.typography.titleLarge, color = color, fontWeight = FontWeight.SemiBold)
    }
    val detail = when (status) {
        ScreenStatus.PERMISSION_DENIED ->
            if ((p as? PermissionUi.Denied)?.permanently != false) {
                "Android won't ask again. Open Settings → Permissions → Microphone → Allow, then come back and tap Try again."
            } else {
                "PlayChord needs the microphone to hear your guitar. Tap Try again and choose Allow."
            }
        ScreenStatus.ERROR -> s.error?.message
        else -> null
    }
    if (detail != null) Text(detail, style = MaterialTheme.typography.bodyMedium)
    if (status == ScreenStatus.ERROR && s.error is CaptureError.UnsupportedFormat) {
        Text("Result: unsupported format for Build Gate A.", style = MaterialTheme.typography.bodyMedium, color = Bad)
    }
}

@Composable
private fun Meter(level: Float) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFFE9E9E6))
            .semantics { contentDescription = "Input level ${(level * 100).toInt()} percent" },
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(level.coerceIn(0f, 1f))
                .background(if (level > 0.95f) Bad else Good),
        )
    }
}

@Composable
private fun ResultRow(r: SelfTestResult) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (r.passed) "PASS" else "FAIL",
                color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(if (r.passed) Good else Bad).padding(horizontal = 8.dp, vertical = 3.dp),
            )
            Spacer(Modifier.width(10.dp))
            Text(r.name, style = MaterialTheme.typography.bodyLarge)
        }
        if (!r.passed) {
            Text("Expected: ${r.expected}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
            Text("Actual: ${r.actual}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = Bad)
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            content()
        }
    }
}

@Composable
private fun DiagRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Neutral, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(12.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun BigButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(56.dp)) {
        Text(text, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun SecondaryButton(text: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        Text(text, style = MaterialTheme.typography.titleMedium)
    }
}

private fun dbText(db: Double?): String = when {
    db == null -> "–"
    db <= DiagnosticConsumer.FLOOR_DBFS -> "≤ −90 dBFS"
    else -> String.format(Locale.US, "%.1f dBFS", db).replace("-", "−")
}

private fun gapText(count: Long, frames: Long) = if (count == 0L) "0" else "$count ($frames frames)"
