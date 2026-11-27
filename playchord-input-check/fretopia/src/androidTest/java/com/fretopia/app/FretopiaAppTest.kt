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

    private val report = StringBuilder()

    /** Saves a screenshot and returns the share of pixels clearly darker than the page background (ink). */
    private fun shot(name: String): Double {
        device.waitForIdle()
        Thread.sleep(400)
        val bmp = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot() ?: return -1.0
        TestStorage().openOutputFile("$name.png").use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val top = (bmp.height * 0.06).toInt() // skip the status bar
        var ink = 0
        var total = 0
        for (y in top until bmp.height step 4) for (x in 0 until bmp.width step 4) {
            val c = bmp.getPixel(x, y)
            val lum = (android.graphics.Color.red(c) * 299 + android.graphics.Color.green(c) * 587 + android.graphics.Color.blue(c) * 114) / 1000
            if (lum < 180) ink++
            total++
        }
        val f = ink.toDouble() / total
        report.append(name).append(": ink ").append(String.format(java.util.Locale.US, "%.3f", f)).append('\n')
        return f
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

    private fun dims(s: ActivityScenario<FretopiaActivity>, label: String) {
        val page = js(s, "JSON.stringify({iw:innerWidth,ih:innerHeight,hidden:document.hidden,vs:document.visibilityState,bodyH:Math.round(document.body.getBoundingClientRect().height)})")
        var view = ""
        s.onActivity { a ->
            val w = a.webView
            val root = w.parent as android.view.View
            view = "webView ${w.width}x${w.height} shown=${w.isShown} vis=${w.visibility} alpha=${w.alpha} layer=${w.layerType} " +
                "root pad=${root.paddingLeft},${root.paddingTop},${root.paddingRight},${root.paddingBottom} root ${root.width}x${root.height} hasFocus=${a.hasWindowFocus()}"
        }
        report.append(label).append(": ").append(page).append(" | ").append(view).append('\n')
    }

    /** Draws the WebView into a software bitmap: shows whether the page content exists even if the screen doesn't. */
    private fun softwareDraw(s: ActivityScenario<FretopiaActivity>, name: String) {
        var bmp: Bitmap? = null
        s.onActivity { a ->
            val w = a.webView
            bmp = Bitmap.createBitmap(w.width, w.height, Bitmap.Config.ARGB_8888).also { w.draw(android.graphics.Canvas(it)) }
        }
        val b = bmp ?: return
        TestStorage().openOutputFile("$name.png").use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
        var ink = 0
        var total = 0
        for (y in 0 until b.height step 4) for (x in 0 until b.width step 4) {
            val c = b.getPixel(x, y)
            if ((android.graphics.Color.red(c) * 299 + android.graphics.Color.green(c) * 587 + android.graphics.Color.blue(c) * 114) / 1000 < 180) ink++
            total++
        }
        report.append(name).append(": software-draw ink ").append(String.format(java.util.Locale.US, "%.3f", ink.toDouble() / total)).append('\n')
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
            dims(s, "before-mic-check")
            softwareDraw(s, "06b-software-before")
            js(s, "openMicCheck()")
            assertTrue("Microphone check did not open", device.wait(Until.hasObject(By.text("Microphone check")), 10_000))
            shot("07-mic-check")
            device.pressBack()
            assertTrue(waitJs(s, "!document.querySelector('#home').hidden"))
            Thread.sleep(800)
            shot("07b-returned-home")
            dims(s, "after-mic-check")
            // Experiments: which way of waking the WebView brings the pixels back?
            if (shot("x0-blank-check") < 0.01) {
                s.onActivity { act -> act.webView.visibility = android.view.View.INVISIBLE; act.webView.post { act.webView.visibility = android.view.View.VISIBLE } }
                Thread.sleep(1_000)
                if (shot("x1-visibility-toggle") < 0.01) {
                    s.onActivity { act -> val p = act.webView.parent as android.view.ViewGroup; val lp = act.webView.layoutParams; p.removeView(act.webView); p.addView(act.webView, lp) }
                    Thread.sleep(1_000)
                    if (shot("x2-reattach") < 0.01) {
                        s.onActivity { act -> act.webView.setLayerType(android.view.View.LAYER_TYPE_SOFTWARE, null) }
                        Thread.sleep(1_000)
                        shot("x3-software-layer")
                        s.onActivity { act -> act.webView.setLayerType(android.view.View.LAYER_TYPE_NONE, null) }
                        Thread.sleep(600)
                        shot("x4-back-to-hardware")
                    }
                }
            }
            softwareDraw(s, "07c-software-after-check")

            // Back walks the screens: home → instruments.
            device.pressBack()
            assertTrue("back did not go to instruments", waitJs(s, "!document.querySelector('#picker').hidden"))
            Thread.sleep(1_200)
            val inkAfterCheck = shot("08-back-to-instruments")

            // Home and back again (the page is hidden by the system, then shown).
            device.pressHome()
            Thread.sleep(1_500)
            val ctx = InstrumentationRegistry.getInstrumentation().targetContext
            ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
            assertTrue(waitJs(s, "!document.hidden && !document.querySelector('#picker').hidden"))
            Thread.sleep(1_500)
            val inkAfterHome = shot("09-after-home")
            dims(s, "after-home")
            TestStorage().openOutputFile("paint-report.txt").use { it.write(report.toString().toByteArray()) }
            assertTrue("the page is blank after returning from Microphone check (ink $inkAfterCheck)", inkAfterCheck > 0.01)
            // Visible, not just present: the page is shown and the list has finished fading in.
            val vis = js(s, "JSON.stringify({hidden:document.hidden,vs:document.visibilityState,op:getComputedStyle(document.querySelector('#picker')).opacity,rows:document.querySelectorAll('#ilist .irow').length})") as String
            val v = JSONObject(vis)
            assertTrue("instruments not visible after Back: $vis", !v.getBoolean("hidden") && v.getString("op") == "1" && v.getInt("rows") == 6)
        }
    }
}
