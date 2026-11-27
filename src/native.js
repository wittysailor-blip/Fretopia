
/* ================= inside the Fretopia Android app =================
   The Android app injects `FretopiaNative` (a WebView message listener limited to the app's own origin).
   When it is there, the microphone comes from the native PlayChord audio-input engine (AudioRecord,
   44,100 Hz mono, ordered blocks numbered from 0 per session) instead of getUserMedia.
   Blocks arrive as ArrayBuffers: 4 float64 header values [generation, firstOutputFrame, count, discontinuity]
   followed by `count` float32 samples. Older WebViews get the same bytes as base64 text prefixed "A:". */
const NATIVE = (() => {
  const b = window.FretopiaNative;
  if (!b || typeof b.postMessage !== 'function') return null;
  const RATE = 44100;
  const N = {
    bridge: b, gen: 0, next: -1, gaps: 0, blocks: 0, frames: 0, anchor: null, attached: false,
    waiters: [], resumeWanted: false, out: null, outDest: null, files: {},
    send(o) { try { b.postMessage(JSON.stringify(o)); } catch (e) {} },
    settle(r) { const w = this.waiters; this.waiters = []; w.forEach(f => f(r)); },
    /* one block of native audio → Ear, with frame-counter timing in AudioContext seconds */
    audio(buf) {
      if (buf.byteLength < 32) return;
      const h = new Float64Array(buf, 0, 4), gen = h[0], first = h[1], count = h[2];
      if (gen !== this.gen || !this.attached || count <= 0 || 32 + count * 4 > buf.byteLength) return; // stale or malformed
      const x = new Float32Array(buf, 32, count);
      if (this.next >= 0 && first !== this.next) { this.gaps++; this.anchor = null; } // a gap: re-anchor time
      this.next = first + count; this.blocks++; this.frames += count;
      const endFrame = first + count, cand = ctx.currentTime - endFrame / RATE;
      // lowest-delay arrival anchors the clock; a slow upward creep follows clock drift
      this.anchor = this.anchor == null ? cand : Math.min(this.anchor + 0.00002, cand);
      Ear.push(x, this.anchor + endFrame / RATE);
      if (this.out) { try { this.out.port.postMessage(x.slice()); } catch (e) {} }
    },
    control(m) {
      if (m.t === 'mic-state') {
        if (m.state === 'STARTING' || m.state === 'OPENING' || m.state === 'READY') {
          if (m.gen && m.gen !== this.gen) { this.gen = m.gen; this.next = -1; this.anchor = null; this.gaps = 0; this.blocks = 0; this.frames = 0; }
          if (!this.attached) { Ear.attachNative(RATE); this.attached = true; }
        } else if (m.state === 'RUNNING') {
          this.settle({ ok: true });
        } else if (m.state === 'STOPPED' || m.state === 'FAILED') {
          const err = m.error ? m.error : null;
          if (this.waiters.length) this.settle({ ok: false, err: err || 'other' });
          if (Mic.active && Mic.native) { // the app stopped capture (e.g. it went to the background)
            if (document.hidden) this.resumeWanted = true;
            if (err) Mic.err = err;
            Mic.release();
          }
        }
      } else if (m.t === 'file-done') {
        toast(m.ok ? (m.action === 'save' ? 'Saved to Downloads' : 'Shared') : 'That didn’t work. Try again.');
      } else if (m.t === 'resume') {
        if (this.resumeWanted) { this.resumeWanted = false; Mic.start().then(ok => { if (ok && $('#player')) Player.msg('Listening'); }); }
      }
    },
    /* a MediaStream track made from the native samples (for clips), resampled to the context rate */
    track() {
      if (!this.outDest) {
        const code = `class S extends AudioWorkletProcessor{constructor(){super();this.N=65536;this.r=new Float32Array(this.N);this.w=0;this.p=-1;this.step=${RATE}/sampleRate;
          this.port.onmessage=e=>{const d=e.data;for(let k=0;k<d.length;k++)this.r[(this.w+k)%this.N]=d[k];this.w+=d.length;if(this.p<0)this.p=Math.max(0,this.w-2205);if(this.w-this.p>${RATE}*0.4)this.p=this.w-${RATE}*0.1;};}
          process(_,o){const out=o[0][0];for(let k=0;k<out.length;k++){if(this.p>=0&&this.p+1<this.w){const i=Math.floor(this.p),f=this.p-i;out[k]=this.r[i%this.N]*(1-f)+this.r[(i+1)%this.N]*f;this.p+=this.step;}else out[k]=0;}return true;}}
          registerProcessor('fretopia-native-src',S);`;
        this.outDest = ctx.createMediaStreamDestination();
        ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))).then(() => {
          this.out = new AudioWorkletNode(ctx, 'fretopia-native-src', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
          this.out.connect(this.outDest);
        }).catch(() => {});
      }
      return this.outDest.stream.getAudioTracks()[0];
    },
    /* hand a recorded clip to Android to share or save */
    async sendFile(blob, name, action) {
      const bytes = new Uint8Array(await blob.arrayBuffer()), id = Date.now().toString(36), CH = 384 * 1024;
      this.send({ t: 'file-begin', id, name, mime: blob.type || 'video/mp4', size: bytes.length });
      for (let o = 0; o < bytes.length; o += CH) {
        let s = ''; const part = bytes.subarray(o, Math.min(bytes.length, o + CH));
        for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode.apply(null, part.subarray(i, i + 0x8000));
        this.send({ t: 'file-chunk', id, d: btoa(s) });
      }
      this.send({ t: 'file-end', id, action });
    },
  };
  const fromB64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const onMsg = ev => {
    const d = ev.data;
    if (typeof d === 'string') {
      if (d.length > 2 && d[0] === 'A' && d[1] === ':') N.audio(fromB64(d.slice(2)));
      else { try { N.control(JSON.parse(d)); } catch (e) {} }
    } else if (d instanceof ArrayBuffer) N.audio(d);
  };
  try { b.addEventListener('message', onMsg); } catch (e) { b.onmessage = onMsg; }
  document.documentElement.classList.add('in-app');
  N.send({ t: 'hello' });
  return N;
})();

if (NATIVE) {
  Ear.attachNative = function (rate) {
    this.setup(); this.sr = rate; this.w = 0; this.next = 4096; this.endW = 0; this.flux = []; this.fluxT = []; this.bands = []; this.onsets = [];
    this.pitch = null; this.chroma = null; this.prevL.fill(0); this.hopN = 0; this.src = this.node = this.sink = null; this.active = true;
  };
  Mic.start = async function () {
    if (this.active) return true;
    this.err = null; ac();
    try { if (ctx.state !== 'running') await ctx.resume().catch(() => {}); } catch (e) {}
    if (localStorage.getItem('fretopia.lat') == null) Ear.lat = clamp((ctx.outputLatency || 0) + (ctx.baseLatency || 0) + .02, .02, .25);
    const r = await new Promise(res => { NATIVE.waiters.push(res); NATIVE.send({ t: 'mic-start' }); setTimeout(() => res({ ok: false, err: 'other' }), 12000); });
    if (!r.ok) { this.err = r.err || 'other'; this.release(); return false; }
    this.hist = []; this.active = true; this.native = true; return true;
  };
  /* local teardown only (the engine has already stopped or is being told to) */
  Mic.release = function () {
    Ear.detach(); NATIVE.attached = false; this.active = false; this.native = false; this.hist = []; this.level = 0; this.stream = null;
    if (NATIVE.waiters.length) NATIVE.settle({ ok: false, err: this.err || 'other' });
  };
  Mic.stop = function () { NATIVE.resumeWanted = false; NATIVE.send({ t: 'mic-stop' }); this.release(); };
  // the app stops capture in the background; bring it back when it's visible again
  document.addEventListener('visibilitychange', () => { if (document.hidden && Mic.active) NATIVE.resumeWanted = true; });
}

/* the system back button inside the app: close what's on top, else step back through the screens */
function nativeBack() {
  if ($('#sheet')) { closeSheet(); return true; }
  if ($('#player')) { Player.close(); return true; }
  if (typeof PUI !== 'undefined' && PUI.stack.length) { popScreen(); return true; }
  const vis = ['home', 'picker', 'goal'].find(id => !$('#' + id).hidden);
  if (vis === 'home') { Flow.go('picker'); return true; }
  if (vis === 'picker') { Flow.go('goal'); return true; }
  if (vis === 'goal') { Flow.go('landing'); return true; }
  return false;
}
function openMicCheck() { if (NATIVE) { if (Mic.active) Mic.stop(); NATIVE.send({ t: 'open-mic-check' }); } }
