"""Checks the web side of the Android bridge in a browser, with a fake FretopiaNative that speaks the
same protocol as the app: JSON control messages and ArrayBuffer audio blocks
[float64 generation, firstOutputFrame, count, discontinuity] + float32 samples at 44,100 Hz."""
import asyncio, os, sys, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []
def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
FAKE = r"""
(() => {
  const sent = []; window.__sent = sent; let listener = null; let timer = null, gen = 0, frame = 0, mode = 'b64';
  const deliver = d => setTimeout(() => listener && listener({ data: d }), 0);
  const block = (n, f0) => { const buf = new ArrayBuffer(32 + n * 4), h = new Float64Array(buf, 0, 4), x = new Float32Array(buf, 32, n);
    h[0] = gen; h[1] = frame; h[2] = n; h[3] = 0;
    for (let i = 0; i < n; i++) { const t = (frame + i) / 44100; x[i] = 0.3 * Math.sin(2 * Math.PI * f0 * t) + 0.12 * Math.sin(2 * Math.PI * 2 * f0 * t) + 0.05 * Math.sin(2 * Math.PI * 3 * f0 * t); }
    frame += n; return buf; };
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return 'A:' + btoa(s); };
  window.FretopiaNative = {
    postMessage(s) { sent.push(s); const m = JSON.parse(s);
      if (m.t === 'mic-start') { gen++; frame = 0; deliver(JSON.stringify({ t: 'mic-state', state: 'STARTING', gen }));
        let first = true;
        timer = setInterval(() => { const buf = block(1024, window.__f0 || 196); deliver(window.__binary ? buf : b64(buf));
          if (first) { first = false; deliver(JSON.stringify({ t: 'mic-state', state: 'RUNNING', gen })); } }, 1024 / 44.1);
      }
      if (m.t === 'mic-stop') { clearInterval(timer); deliver(JSON.stringify({ t: 'mic-state', state: 'STOPPED', gen })); }
    },
    addEventListener(t, f) { if (t === 'message') listener = f; },
    __stale() { const g = gen, f = frame; gen = gen - 1; const b = block(1024, 1000); gen = g; frame = f; deliver(b); },
    __deny() { window.FretopiaNative.postMessage = s => { sent.push(s); const m = JSON.parse(s); if (m.t === 'mic-start') deliver(JSON.stringify({ t: 'mic-state', state: 'STOPPED', gen: 9, error: 'denied' })); }; },
  };
})();
"""
async def main():
    h = functools.partial(Q, directory=ROOT); s = socketserver.TCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844})
        await ctx.add_init_script(FAKE)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{s.server_address[1]}/index.html'); await pg.wait_for_timeout(800)
        check(await pg.evaluate('!!NATIVE && document.documentElement.classList.contains("in-app")'), 'bridge detected')
        check(await pg.evaluate('window.__sent.some(x=>JSON.parse(x).t==="hello")'), 'app says hello to Android')
        ok = await pg.evaluate('Mic.start()')
        check(ok is True, 'Mic.start resolves through the native engine')
        await pg.wait_for_timeout(2500)
        st = await pg.evaluate('({sr:Ear.sr,w:Ear.w,act:Ear.active,nat:Mic.native,gaps:NATIVE.gaps,blocks:NATIVE.blocks,f:Ear.pitch&&Ear.pitch.f,lvl:Ear.level})')
        print('   ', st)
        check(st['sr'] == 44100 and st['nat'] is True, 'Ear runs at 44,100 Hz on native samples')
        check(st['w'] > 44100, f"samples reach Ear ({st['w']})")
        check(st['gaps'] == 0, 'no gaps in native frame numbers')
        check(st['f'] is not None and abs(st['f'] - 196) < 3, f"pitch detected from native audio ({st['f']})")
        r = await pg.evaluate('(()=>{const x=Mic.read();return x&&x.freq})()')
        check(r is not None and abs(r - 196) < 3, f'Mic.read returns the guitar pitch ({r})')
        before = await pg.evaluate('Ear.w')
        nb = await pg.evaluate('NATIVE.blocks')
        await pg.evaluate('FretopiaNative.__stale()'); await pg.wait_for_timeout(5)
        check(await pg.evaluate('NATIVE.gaps') == 0, 'a block from an older session is ignored')
        await pg.evaluate('window.__binary=true'); await pg.wait_for_timeout(500)
        check(await pg.evaluate('Ear.w') > before, 'ArrayBuffer blocks work too')
        await pg.evaluate('Mic.stop()'); await pg.wait_for_timeout(200)
        check(await pg.evaluate('!Mic.active && !Ear.active && window.__sent.some(x=>JSON.parse(x).t==="mic-stop")'), 'Mic.stop tells Android and detaches')
        # a lesson in the player listens through the bridge
        await pg.evaluate("S.goal='learn';S.onboarded=true;S.inst='guitar';S.input='mic';HV.tab='learn';showScene('home');renderHome();Player.open(HOME.cat[0],HOME.cat)")
        await pg.wait_for_timeout(300)
        await pg.evaluate("Player.start(false)"); await pg.wait_for_timeout(1500)
        check(await pg.evaluate('Player.mode==="mic" && Mic.active && Mic.native'), 'the player listens with the native mic')
        await pg.screenshot(path='/tmp/native-player.png')
        await pg.evaluate('Player.close(true,true)')
        # back button walks the screens
        check(await pg.evaluate("nativeBack()"), "back is handled on home"); await pg.wait_for_timeout(500)
        check(not await pg.evaluate("$('#picker').hidden"), "back from home goes to instruments")
        check(await pg.evaluate("!!document.querySelector('#micCheck')"), 'instruments page offers Check your microphone')
        await pg.evaluate("document.querySelector('#micCheck').click()")
        check(await pg.evaluate('window.__sent.some(x=>JSON.parse(x).t==="open-mic-check")'), 'tapping it asks Android to open the check')
        # denial is explained
        await pg.evaluate('FretopiaNative.__deny()')
        ok = await pg.evaluate('Mic.start()')
        check(ok is False and await pg.evaluate('Mic.err') == 'denied', 'a denied permission comes back as "denied"')
        check(not errs, 'no page errors' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
        await b.close()
    print('\n%d failed' % len(fails) if fails else '\nall passed'); sys.exit(1 if fails else 0)
asyncio.run(main())
