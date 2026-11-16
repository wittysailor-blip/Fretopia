"""Listening tests: play recorded guitar into Chrome's fake microphone and check Fretopia's scores.

Each case renders a WAV from the guitar samples in sounds/guitar (optionally with room echo, hiss,
the app's own count-in clicks, strumming during the count-in, a distant guitar, wrong notes,
wrong chords, a muted string or silence), feeds it to the app as the mic, plays the song in Mic
mode and compares the accuracy with what it should be.

Setup (once):  pip install playwright numpy scipy && python -m playwright install chromium
               ffmpeg must be installed (it converts the mp3 samples to wav)
Run:           python3 tests/mic_test.py            (all cases, ~10 minutes)
               python3 tests/mic_test.py quick      (a few cases)
Build first:   python3 build.py
"""
import asyncio, json, os, sys, subprocess, threading, http.server, socketserver, functools
import numpy as np, scipy.io.wavfile as W
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tests', '.cache'); os.makedirs(CACHE, exist_ok=True)
SR = 48000
NAMES = 'E2 G2 A2 B2 D3 E3 G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5'.split()
NM = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
OPEN = [40, 45, 50, 55, 59, 64]
CHROME = os.environ.get('CHROME')  # optional path to a Chrome binary; Playwright's Chromium is used otherwise

# case: (instrument, song id, label, options, (min accuracy, max accuracy))
CASES = [
    ('guitar', 'g-open', 'clean', {}, (90, 100)),
    ('guitar', 'ode', 'clean', {}, (90, 100)),
    ('guitar', 'ode', 'room, quiet', {'room': True, 'level': .25}, (85, 100)),
    ('guitar', 'g-open', 'distant guitar', {'room': True, 'level': .07}, (85, 100)),
    ('guitar', 'ode', 'strum in count-in', {'room': True, 'level': .25, 'warmup': True}, (85, 100)),
    ('guitar', 'c-gcd', 'chords, distant', {'room': True, 'level': .07}, (80, 100)),
    ('harmonium', 'twinkle', 'harmonium, room', {'room': True, 'level': .15}, (90, 100)),
    ('guitar', 'ode', 'wrong notes', {'room': True, 'level': .25, 'transpose': 2}, (0, 30)),
    ('guitar', 'c-emg', 'wrong chords', {'room': True, 'level': .25, 'wrongchord': {'Em': 'Am', 'G': 'C'}}, (0, 15)),
    ('guitar', 'ode', 'silence', {'room': True, 'level': 0.0}, (0, 5)),
]
QUICK = [0, 4, 7, 9]


def wav_samples():
    out = {}
    for n in NAMES:
        w = os.path.join(CACHE, n + '.wav')
        if not os.path.exists(w):
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(ROOT, 'sounds', 'guitar', n + '.mp3'), '-ac', '1', '-ar', str(SR), w], check=True)
        out[12 * (int(n[1]) + 1) + NM[n[0]]] = W.read(w)[1].astype(np.float32) / 32768
    return out


SMP = None


def note(m, dur):
    k = min(SMP, key=lambda x: abs(x - m)); x = SMP[k]; r = 2 ** ((m - k) / 12)
    idx = np.arange(0, min(len(x) - 1, (dur + .4) * SR * r), r)
    return np.interp(idx, np.arange(len(x)), x)


def render(r, transpose=0, wrongchord=None, mute=None, room=False, level=1.0, warmup=False):
    beat = 60 / r['bpm']; lead = 4 * beat + .08
    total = lead + max(n['s'] + n['b'] for n in r['notes']) * beat + 2
    out = np.zeros(int(total * SR))
    for n in r['notes']:
        t0 = lead + n['s'] * beat; dur = n['b'] * beat
        if n['ch']:
            name = wrongchord.get(n['ch'], n['ch']) if wrongchord else n['ch']; sh = r['shapes'][name]
            ms = [OPEN[i] + f for i, f in enumerate(sh) if f >= 0 and not (mute and mute.get(name) == i)]
            for j, m in enumerate(ms):
                x = note(m + transpose, dur)[:int((dur + .05) * SR)] * .5; i = int((t0 + j * .02) * SR)
                out[i:i + len(x)] += x[:max(0, len(out) - i)]
        elif n['m'] is not None:
            x = note(n['m'] + transpose, dur)[:int((dur + .05) * SR)] * .8; i = int(t0 * SR); out[i:i + len(x)] += x
    if room:  # the phone's own count-in clicks reach the mic
        for i in range(4):
            t = i * beat + .02; n = int(.05 * SR); tt = np.arange(n) / SR
            b = np.sin(2 * np.pi * (1500 if i == 0 else 1050) * tt) * np.exp(-tt / .012) * .25; j = int(t * SR); out[j:j + n] += b
    if warmup:  # the player strums or tunes during the count-in
        for j, m in enumerate([40, 45, 50, 55]):
            x = note(m, 1.2)[:int(1.2 * SR)] * .6; i = int((.3 + j * beat * .8) * SR); out[i:i + len(x)] += x[:max(0, len(out) - i)]
    if room:  # room echo, distance, hiss and rumble
        ir = np.random.randn(int(.45 * SR)) * np.exp(-np.arange(int(.45 * SR)) / (.09 * SR)) * .06; ir[0] = 1.0
        out = np.convolve(out, ir)[:len(out)] * level
        w = np.random.randn(len(out)); b = np.cumsum(w); b -= np.convolve(b, np.ones(400) / 400, 'same')
        out += (w * .6 + b * .02) * .0035
    out += np.random.randn(len(out)) * .002
    return out, total


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/index.html'


async def song_info(p, url, inst, sid):
    b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
    pg = await b.new_page(); await pg.goto(url); await pg.wait_for_timeout(800)
    r = await pg.evaluate(f"""(()=>{{S.inst='{inst}';openHome('{inst}');const s=HOME.cat.find(x=>x.id==='{sid}');const p=parseSong(s);const sa={{harmonium:60,bansuri:67,vocals:49,sitar:49}}['{inst}'];
      return {{bpm:s.bpm,notes:p.notes.filter(n=>!n.rest).map(n=>({{m:n.midi!=null?n.midi:(n.semi!=null?sa+n.semi:null),ch:n.chord||null,s:n.start,b:n.beats}})),shapes:CHORD_SHAPES}}}})()""")
    await b.close(); return r


async def run_case(p, url, inst, sid, label, opts):
    r = await song_info(p, url, inst, sid); out, total = render(r, **opts)
    f = os.path.join(CACHE, f'case_{sid}.wav'); W.write(f, SR, (np.clip(out, -1, 1) * 32767).astype(np.int16))
    args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={f}%noloop', '--autoplay-policy=no-user-gesture-required']
    b = await p.chromium.launch(executable_path=CHROME, args=args) if CHROME else await p.chromium.launch(args=args)
    c = await b.new_context(permissions=['microphone']); pg = await c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(url); await pg.wait_for_timeout(900)
    await pg.evaluate("try{localStorage.setItem('fretopia.lat','0.000')}catch(e){}")
    await pg.evaluate(f"""(()=>{{openHome('{inst}');const s=HOME.cat.find(x=>x.id==='{sid}');Player.open(s,HOME.cat);Player.mode='mic';Player.wait=false;Player.guide=false;Player.opts();Player.pad();}})()""")
    await pg.click('#plPlay'); await pg.wait_for_timeout(int(total * 1000) + 1500)
    res = await pg.evaluate("({pct:parseInt(document.querySelector('#shPct')?.textContent||'-1'),err:Mic.err,scores:Player.notes.filter(n=>!n.rest).map(n=>+(n.score||0).toFixed(2))})")
    await b.close(); return res, errs


async def main():
    global SMP
    SMP = wav_samples()
    httpd, url = serve()
    cases = [CASES[i] for i in QUICK] if 'quick' in sys.argv else CASES
    failed = 0
    async with async_playwright() as p:
        for inst, sid, label, opts, (lo, hi) in cases:
            res, errs = await run_case(p, url, inst, sid, label, opts)
            ok = lo <= res['pct'] <= hi and not errs
            failed += not ok
            print(f"{'PASS' if ok else 'FAIL'}  {inst:9} {sid:8} {label:20} accuracy {res['pct']:>3}%  (expected {lo}-{hi})" + (f"  errors: {errs}" if errs else ''), flush=True)
    httpd.shutdown()
    print(f"\n{len(cases) - failed} of {len(cases)} passed")
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    asyncio.run(main())
