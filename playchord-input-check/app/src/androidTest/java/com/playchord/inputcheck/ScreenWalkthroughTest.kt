package com.playchord.inputcheck

import android.Manifest
import android.graphics.Bitmap
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.services.storage.TestStorage
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Drives the real screen: Ready → Listening → Stopped → self-test, saving a screenshot at each step. */
@RunWith(AndroidJUnit4::class)
class ScreenWalkthroughTest {
    @get:Rule
    val mic: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    private fun shot(name: String) {
        device.waitForIdle()
        val bmp = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot() ?: return
        TestStorage().openOutputFile("$name.png").use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** Swipes up until [text] is on screen (Compose scroll containers don't answer UiScrollable). */
    private fun scrollTo(text: String) {
        repeat(10) {
            val o = device.findObject(By.text(text))
            if (o != null && o.visibleBounds.bottom < device.displayHeight - 40) return
            device.swipe(device.displayWidth / 2, device.displayHeight * 3 / 4, device.displayWidth / 2, device.displayHeight / 4, 30)
            device.waitForIdle()
        }
    }

    /** Swipes down until [text] is on screen again. */
    private fun scrollBackTo(text: String) {
        repeat(10) {
            val o = device.findObject(By.text(text))
            if (o != null && o.visibleBounds.top > 40) return
            device.swipe(device.displayWidth / 2, device.displayHeight / 4, device.displayWidth / 2, device.displayHeight * 3 / 4, 30)
            device.waitForIdle()
        }
    }

    @Test
    fun walkThroughTheScreen() {
        ActivityScenario.launch(MainActivity::class.java).use {
            assertTrue("Ready not shown", device.wait(Until.hasObject(By.text("Ready")), 10_000))
            shot("01-ready")

            device.findObject(By.text("Start mic")).click()
            assertTrue("Listening not shown", device.wait(Until.hasObject(By.text("Listening")), 10_000))
            Thread.sleep(2_500)
            shot("02-listening")

            device.findObject(By.text("Stop mic")).click()
            assertTrue("Stopped not shown", device.wait(Until.hasObject(By.text("Stopped")), 10_000))
            shot("03-stopped")
            scrollTo("Consumer continuity")
            shot("04-stopped-diagnostics")

            scrollTo("Run self-test")
            device.findObject(By.text("Run self-test")).click()
            assertTrue("self-test did not pass", device.wait(Until.hasObject(By.text("Passed: 9 of 9")), 20_000))
            scrollTo("Unsupported format is reported")
            shot("05-self-test")
        }
    }
}
