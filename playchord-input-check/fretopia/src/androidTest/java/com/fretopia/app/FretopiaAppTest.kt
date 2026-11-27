package com.fretopia.app

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
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The finished app on an emulator: the bundled web app loads, the new first steps work, the app hears
 * through the native engine (virtual microphone), Microphone check opens, and Back walks the screens.
 */
@RunWith(AndroidJUnit4::class)
class FretopiaAppTest {
    @get:Rule
    val mic: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    private fun shot(name: String) {
        device.waitForIdle()
        Thread.sleep(400)
        val bmp = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot() ?: return
        TestStorage().openOutputFile("$name.png").use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun js(s: ActivityScenario<FretopiaActivity>, expr: String): Any? {
        val latch = CountDownLatch(1)
        var out: String? = null
        s.onActivity { a -> a.webView.evaluateJavascript(expr) { r -> out = r; latch.countDown() } }
        latch.await(10, TimeUnit.SECONDS)
        return out?.let { JSONTokener(it).nextValue() }
    }

    private fun waitJs(s: ActivityScenario<FretopiaActivity>, expr: String, ms: Long = 15_000): Boolean {
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) {
            if (js(s, expr) == true) return true
            Thread.sleep(200)
        }
        return false
    }

    @Test
    fun theWholeAppWorksOnTheNativeMicrophone() {
        ActivityScenario.launch(FretopiaActivity::class.java).use { s ->
            assertTrue("web app did not load", waitJs(s, "document.readyState==='complete' && typeof Flow!=='undefined'"))
            js(s, "localStorage.clear()")
            assertEquals("the native bridge is missing", true, js(s, "typeof NATIVE!=='undefined' && NATIVE!==null"))
            shot("01-landing")

            js(s, "Flow.begin()")
            assertTrue(waitJs(s, "!document.querySelector('#goal').hidden"))
            shot("02-goal")
            js(s, "document.querySelector('[data-g=songs]').click()")
            shot("03-goal-chosen")
            js(s, "document.querySelector('#gnext').click()")
            assertTrue(waitJs(s, "!document.querySelector('#picker').hidden && document.querySelectorAll('#ilist .irow').length===6"))
            shot("04-instruments")

            js(s, "Flow.choose('guitar')")
            assertTrue(waitJs(s, "!document.querySelector('#home').hidden"))
            shot("05-home-songs")

            // Listen through the native engine.
            js(s, "Mic.start().then(ok=>{window.__micOk=ok})")
            assertTrue("native mic did not start: " + js(s, "String(Mic.err)"), waitJs(s, "window.__micOk===true"))
            Thread.sleep(3_000)
            val st = JSONObject(js(s, "JSON.stringify({sr:Ear.sr,w:Ear.w,gaps:NATIVE.gaps,blocks:NATIVE.blocks,native:!!Mic.native,level:Ear.level})") as String)
            assertEquals(44_100, st.getInt("sr"))
            assertTrue("native mic flag", st.getBoolean("native"))
            assertTrue("too few samples reached the app: $st", st.getLong("w") > 44_100L * 2)
            assertEquals("frame gaps: $st", 0, st.getInt("gaps"))
            s.onActivity { a -> assertEquals("RUNNING", a.bridge.snapshot.state.name) }

            js(s, "HV.tab='learn';renderHome();Player.open(HOME.cat[0],HOME.cat)")
            Thread.sleep(800)
            js(s, "Player.start(false)")
            Thread.sleep(2_500)
            assertEquals(true, js(s, "Player.mode==='mic' && Mic.active && !!Mic.native"))
            shot("06-player-listening")
            js(s, "Player.close(true,true)")
            js(s, "Mic.stop()")
            Thread.sleep(800)
            s.onActivity { a -> assertEquals("STOPPED", a.bridge.snapshot.state.name) }

            // Microphone check, from the Learn tab.
            js(s, "Flow.go('home')")
            Thread.sleep(600)
            js(s, "openMicCheck()")
            assertTrue("Microphone check did not open", device.wait(Until.hasObject(By.text("Microphone check")), 10_000))
            shot("07-mic-check")
            device.pressBack()
            assertTrue(waitJs(s, "!document.querySelector('#home').hidden"))
            Thread.sleep(800)
            shot("07b-returned-home")

            // Back walks the screens: home → instruments.
            device.pressBack()
            assertTrue("back did not go to instruments", waitJs(s, "!document.querySelector('#picker').hidden"))
            Thread.sleep(1_200)
            shot("08-back-to-instruments")
            device.swipe(device.displayWidth / 2, device.displayHeight * 2 / 3, device.displayWidth / 2, device.displayHeight / 2, 20)
            Thread.sleep(600)
            shot("09-after-swipe")
            // Visible, not just present: the page is shown and the list has finished fading in.
            val vis = js(s, "JSON.stringify({hidden:document.hidden,vs:document.visibilityState,op:getComputedStyle(document.querySelector('#picker')).opacity,rows:document.querySelectorAll('#ilist .irow').length})") as String
            val v = JSONObject(vis)
            assertTrue("instruments not visible after Back: $vis", !v.getBoolean("hidden") && v.getString("op") == "1" && v.getInt("rows") == 6)
        }
    }
}
