"""Journey tests for song parts, the arrangement creator, challenges and clips.

Run:  python3 build.py && python3 tests/parts_test.py
Uses Playwright's Chromium with a fake camera and microphone. YouTube may be unreachable where this
runs, so YouTube recordings are only checked for a clear message; the full play-through uses the
recordings Fretopia plays itself.
"""
import asyncio, os, sys, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', '.shots'); os.makedirs(SHOTS, exist_ok=True)
fails = []

def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=ROOT)
    s = socketserver.TCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]

async def main():
    port = serve(); url = f'http://127.0.0.1:{port}/index.html'
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=False, permissions=['camera', 'microphone'])
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_timeout(900)
        await pg.evaluate("localStorage.removeItem('fretopia.parts1')")
        await pg.evaluate("openHome('guitar')"); await pg.wait_for_timeout(300)
        tabs = await pg.locator('#htabs .opt').all_inner_texts()
        check(tabs == ['Lessons', 'Song parts', 'Challenges'], f'guitar home tabs {tabs}')
        await pg.screenshot(path=f'{SHOTS}/01-home.png')

        # ---- song parts: browse, filter, play the demo chorus, results ----
        await pg.click('[data-tab=parts]'); await pg.wait_for_timeout(200)
        n = await pg.locator('#precs .row').count(); check(n >= 9, f'{n} recordings listed')
        await pg.fill('#pq', 'saints'); await pg.wait_for_timeout(150)
        check(await pg.locator('#precs .row').count() == 1, 'search narrows to one recording')
        check(await pg.input_value('#pq') == 'saints', 'search text kept while typing')
        await pg.screenshot(path=f'{SHOTS}/02-parts.png')
        await pg.click('[data-rec="demo:saints"]'); await pg.wait_for_timeout(450)
        rows = await pg.locator('.arow').count(); check(rows == 4, f'Saints has 4 arrangements ({rows})')
        await pg.screenshot(path=f'{SHOTS}/03-recording.png')
        await pg.click('[data-f=level]'); await pg.wait_for_timeout(150)
        await pg.click('#sheet [data-v=Advanced]'); await pg.wait_for_timeout(200)
        check(await pg.locator('.arow').count() == 1, 'difficulty filter')
        await pg.click('[data-clear]'); await pg.wait_for_timeout(150)
        check(await pg.locator('.arow').count() == 4, 'clear filters')
        await pg.click('.arow[data-arr="saints-intro-b"]'); await pg.wait_for_timeout(100)
        await pg.click('[data-play]'); await pg.wait_for_timeout(600)
        check(await pg.locator('#player').count() == 1, 'part player opens')
        mode = await pg.evaluate('Player.mode'); check(mode == 'off', f'mic off by default ({mode})')
        opts = await pg.locator('#plOpts .opt').all_inner_texts(); check('Loop' in opts and 'Song' in opts, f'part options {opts}')
        await pg.screenshot(path=f'{SHOTS}/04-player.png')
        await pg.evaluate("Player.speed=1"); await pg.click('#plPlay')
        tot = await pg.evaluate('(Player.total+4)*60/Player.bpm'); await pg.wait_for_timeout(int(tot * 1000) + 1500)
        sh = await pg.locator('#sheet h2').count(); check(sh == 1, 'results sheet after the passage')
        txt = await pg.locator('#sheet').inner_text() if sh else ''
        check('How did it feel?' in txt, 'unscored run asks how it felt')
        check('First time through this part' in txt, 'progress line on first run')
        await pg.screenshot(path=f'{SHOTS}/05-result.png')
        await pg.click('#shSave'); await pg.wait_for_timeout(100)
        check(await pg.evaluate("!!JSON.parse(localStorage.getItem('fretopia.parts1')).saved['saints-intro-b']"), 'Save to My practice')
        await pg.click('#shAgain'); await pg.wait_for_timeout(1200)
        check(await pg.evaluate('Player.running'), 'Play again starts a new run')
        # seek marks the run unscored
        await pg.evaluate("Parts.seekTo(Player,4)"); await pg.wait_for_timeout(200)
        check(await pg.evaluate('Player.part.seeked'), 'seeking marks the run unscored')
        await pg.click('#plX'); await pg.wait_for_timeout(700)
        check(await pg.locator('.scene.ps').count() == 1, 'closing the player returns to the arrangements')
        # next version link from the beginner chorus
        await pg.click('.arow[data-arr="saints-chorus-b"]'); await pg.click('[data-play]'); await pg.wait_for_timeout(500)
        await pg.evaluate("Player.t=Player.total+.7;Player.running=true;Player.lastAudio=ctx.currentTime"); await pg.wait_for_timeout(400)
        check(await pg.locator('#shNextV').count() == 1, 'Try the next version offered')
        await pg.click('#shNextV'); await pg.wait_for_timeout(600)
        check(await pg.evaluate("Player.part.a.id") == 'saints-chorus-i', 'next version opens the intermediate chorus')
        await pg.click('#plX'); await pg.wait_for_timeout(700)

        # ---- YouTube recording: unchecked timing tag, then a clear message if YouTube can't load ----
        await pg.evaluate("popAll();PS.q='';HV.tab='parts';renderHome()"); await pg.wait_for_timeout(200)
        await pg.click('[data-rec="yt:CGj85pVzRJs"]'); await pg.wait_for_timeout(400)
        check(await pg.locator('.tag', has_text='Timing not checked').count() >= 1, 'real recording flagged timing not checked')
        await pg.screenshot(path=f'{SHOTS}/06-youtube-rec.png')
        await pg.evaluate("popAll()"); await pg.wait_for_timeout(200)

        # ---- My practice ----
        await pg.evaluate("HV.tab='parts';renderHome()"); await pg.click('[data-go=practice]'); await pg.wait_for_timeout(400)
        check(await pg.locator('.ps .list .row').count() == 1, 'My practice lists the saved part')
        await pg.evaluate("popAll()")

        # ---- creator on a recording Fretopia plays: mark, write chords, review, publish ----
        await pg.evaluate("HV.tab='parts';renderHome()"); await pg.click('[data-go=create]'); await pg.wait_for_timeout(400)
        await pg.click('[data-search]'); await pg.wait_for_timeout(150)
        await pg.click('#cres [data-rec="demo:grace"]'); await pg.wait_for_timeout(450)
        check(await pg.locator('.bounds').count() == 1, 'mark the passage screen')
        await pg.click('[data-n="1"]'); await pg.wait_for_timeout(80)
        st = await pg.evaluate("$$('.bnd b')[0].textContent"); check(st.strip() == '0:00.10', f'nudge start +0.1 s ({st})')
        await pg.click('[data-sec="Verse"]'); await pg.click('[data-lvl="Beginner"]')
        await pg.screenshot(path=f'{SHOTS}/07-mark.png')
        await pg.click('[data-write]'); await pg.wait_for_timeout(450)
        check(await pg.locator('#grid .cell').count() > 0, 'editor grid')
        await pg.click('[data-ch="G"]'); await pg.wait_for_timeout(80)
        await pg.click('[data-tool="add"]'); await pg.wait_for_timeout(80)
        await pg.click('[data-ch="D"]'); await pg.wait_for_timeout(80)
        await pg.click('[data-st="U"]'); await pg.wait_for_timeout(80)
        await pg.click('[data-tool="undo"]'); await pg.wait_for_timeout(80)
        ev = await pg.evaluate("Object.values(JSON.parse(localStorage.getItem('fretopia.parts1')).drafts)[0].ev.map(e=>e.c+e.st).join(' ')")
        check(ev == 'GD DD', f'chords, strum direction and undo autosaved ({ev})')
        await pg.screenshot(path=f'{SHOTS}/08-editor.png')
        await pg.click('[data-mode="tab"]'); await pg.wait_for_timeout(120)
        await pg.click('.cell[data-cell="0,0,1"]'); await pg.click('[data-k="1"]'); await pg.click('[data-k="2"]'); await pg.wait_for_timeout(1100)
        f = await pg.evaluate("Object.values(PS.drafts)[0].ev.find(e=>e.s===1).f"); check(f == 12, f'two-digit fret entry ({f})')
        await pg.screenshot(path=f'{SHOTS}/09-tab.png')
        await pg.click('[data-mode="chords"]'); await pg.click('[data-review]'); await pg.wait_for_timeout(400)
        check(await pg.locator('[data-pub]:not([disabled])').count() == 1, 'publish enabled when complete')
        await pg.fill('#rgoal', 'Two chords to start')
        await pg.screenshot(path=f'{SHOTS}/10-review.png')
        await pg.click('[data-pub]'); await pg.wait_for_timeout(600)
        pub = await pg.evaluate("Object.values(PS.arrs).map(a=>a.section+'|'+a.rev+'|'+a.goal)")
        check(pub == ['Verse|1|Two chords to start'], f'published once ({pub})')
        check(await pg.evaluate("Object.keys(PS.drafts).length") == 0, 'draft cleared after publish')
        check(await pg.locator('.arow.on').count() == 1, 'lands on the recording with the new arrangement selected')
        await pg.click('[data-editarr]'); await pg.wait_for_timeout(400); await pg.click('[data-review]'); await pg.wait_for_timeout(300)
        await pg.click('[data-pub]'); await pg.wait_for_timeout(500)
        revs = await pg.evaluate("Object.values(PS.arrs).map(a=>a.rev)"); check(revs == [2], f'editing publishes a new revision ({revs})')
        await pg.evaluate("popAll()")
        # missing step is named
        await pg.evaluate("PS.drafts['dx']={id:'dx',rec:'yt:CGj85pVzRJs',section:'Verse',part:'Rhythm',level:'Beginner',start:1,end:9,bpm:72,meter:4,bars:1,mode:'chords',ev:[{b:0,c:'C',st:'D'}],anchors:[],tuning:'std',capo:0,cur:{bar:0,cell:0,s:0},at:Date.now()};savePS();openReview('dx')")
        await pg.wait_for_timeout(400)
        e = await pg.locator('.ps .err').inner_text(); check('Sync' in e, f'publish names the missing step ({e})')
        await pg.evaluate("delete PS.drafts.dx;savePS();popAll()")

        # ---- challenges: section challenge in tap mode, duel, leaderboard ----
        await pg.evaluate("S.input='tap';HV.tab='chal';renderHome()"); await pg.wait_for_timeout(200)
        cards = await pg.locator('.ccard').count(); check(cards >= 4, f'{cards} challenges')
        await pg.screenshot(path=f'{SHOTS}/11-challenges.png')
        await pg.evaluate("PS.players=['You','Asha'];savePS()")
        await pg.click('.ccard[data-ch="saints-ch-rhythm"]'); await pg.wait_for_timeout(300)
        await pg.click('#chDuel'); await pg.wait_for_timeout(200); await pg.click('#sheet [data-p="Asha"]'); await pg.wait_for_timeout(700)
        check(await pg.evaluate("Player.challenge&&Player.challenge.duel.turn") == 1, 'duel turn 1')
        await pg.evaluate("Player.notes.forEach((n,i)=>{n.judged=true;n.state='hit';n.score=i%2?1:.8});Player.t=Player.total+.7;Player.running=true;Player.lastAudio=ctx.currentTime"); await pg.wait_for_timeout(400)
        check(await pg.locator('#dqGo').count() == 1, 'pass the phone')
        await pg.click('#dqGo'); await pg.wait_for_timeout(700)
        await pg.evaluate("Player.notes.forEach(n=>{n.judged=true;n.state='hit';n.score=1});Player.t=Player.total+.7;Player.running=true;Player.lastAudio=ctx.currentTime"); await pg.wait_for_timeout(400)
        t = await pg.locator('#sheet h2').inner_text(); check(t == 'Asha wins', f'duel result ({t})')
        await pg.screenshot(path=f'{SHOTS}/12-duel.png')
        await pg.click('#duDone'); await pg.wait_for_timeout(700)
        bd = await pg.evaluate("board('saints-ch-rhythm').map(x=>x.name)"); check(bd == ['Asha', 'You'], f'leaderboard order {bd}')
        # timed challenge ends on the clock
        await pg.evaluate("startChallenge(challengesFor('guitar')[0],{player:'You'})"); await pg.wait_for_timeout(600)
        await pg.evaluate("Player.challenge.secs=3"); await pg.click('#plPlay'); await pg.wait_for_timeout(int((4 * 60 / await pg.evaluate('Player.bpm') + 3.5) * 1000))
        check(await pg.locator('#sheet .bigpts').count() == 1, 'timed challenge ends when time runs out')
        await pg.evaluate("Player.close(true,true)")

        # ---- record a clip with the fake camera ----
        await pg.evaluate("openHome('guitar');HV.tab='lessons';renderHome();Player.open(HOME.cat[0],HOME.cat)"); await pg.wait_for_timeout(700)
        await pg.click('#plRec'); await pg.wait_for_timeout(1800)
        check(await pg.locator('.pl-cam video').count() == 1, 'camera self-view while recording')
        await pg.screenshot(path=f'{SHOTS}/13-recording.png')
        await pg.click('#plRec'); await pg.wait_for_timeout(1200)
        check(await pg.locator('video.clipv').count() == 1, 'clip sheet with preview')
        await pg.screenshot(path=f'{SHOTS}/14-clip.png')
        await pg.click('#clDel'); await pg.evaluate("Player.close(true,true)")

        # ---- other instruments: Challenges but no Song parts ----
        await pg.evaluate("openHome('sitar')"); await pg.wait_for_timeout(200)
        tabs = await pg.locator('#htabs .opt').all_inner_texts(); check(tabs == ['Lessons', 'Challenges'], f'sitar tabs {tabs}')
        check(not errs, 'no page errors' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
        await b.close()
    print('\n%d failed' % len(fails) if fails else '\nall passed'); sys.exit(1 if fails else 0)

asyncio.run(main())
