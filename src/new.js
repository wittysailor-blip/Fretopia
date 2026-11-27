/* ================= realistic metal strings (overrides the glow-line look) ================= */
VString.prototype.draw=function(g,t,glow=1){
  const e=this.energy(t),N=64,pts=[],env=[];for(let i=0;i<=N;i++){const s=i/N;pts.push(this.disp(s,t));env.push(this.spread(s,t));}
  const X=(s,d)=>this.a.x+this.u.x*this.len*s+this.n.x*d,Y=(s,d)=>this.a.y+this.u.y*this.len*s+this.n.y*d;
  const path=()=>{g.beginPath();for(let i=0;i<=N;i++){const s=i/N;i?g.lineTo(X(s,pts[i]),Y(s,pts[i])):g.moveTo(X(s,pts[i]),Y(s,pts[i]));}};
  const wound=this.wound,w=this.w,comp=g.globalCompositeOperation;
  if(e>.004){g.beginPath();for(let i=0;i<=N;i++){const s=i/N;i?g.lineTo(X(s,env[i]),Y(s,env[i])):g.moveTo(X(s,env[i]),Y(s,env[i]));}for(let i=N;i>=0;i--){const s=i/N;g.lineTo(X(s,-env[i]),Y(s,-env[i]));}g.closePath();
    g.fillStyle=wound?`rgba(236,196,140,${.05+.12*e})`:`rgba(210,226,255,${.05+.12*e})`;g.fill();}
  if(comp==='source-over'){g.save();g.translate(this.n.x*2.4,this.n.y*2.4);path();g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=w*1.15;g.lineCap='round';g.shadowColor='rgba(0,0,0,.6)';g.shadowBlur=3*DPR;g.stroke();g.restore();g.shadowBlur=0;}
  path();g.lineCap='round';g.strokeStyle=wound?`rgba(190,152,98,${.7+.3*glow})`:`rgba(190,203,222,${.7+.3*glow})`;g.lineWidth=w;g.shadowColor=wound?'rgba(255,196,120,.85)':'rgba(150,195,255,.85)';g.shadowBlur=(1.5+7*e)*DPR*(.4+.6*glow);g.stroke();g.shadowBlur=0;
  if(wound&&w>1.3){g.setLineDash([.9,1.5]);g.strokeStyle='rgba(60,40,18,.6)';g.lineWidth=w*.92;g.stroke();g.setLineDash([]);}
  g.save();g.translate(-this.n.x*w*.24,-this.n.y*w*.24);path();g.strokeStyle=wound?'rgba(255,236,200,.85)':'rgba(255,255,255,.92)';g.lineWidth=Math.max(.45,w*.3);g.stroke();g.restore();
};

/* ================= landing: guitar neck + soundhole ================= */
const Landing={strings:[],parts:[],push:3,plucks:0,ptr:null,W:0,H:0,
  layout(){const c=$('#lc'),W=c.clientWidth,H=c.clientHeight;if(!W)return;this.W=W;this.H=H;
    const gap=this.gap=clamp(W*.042,14,18),cy=this.cy=H*.5;this.top=cy-2.5*gap-12;this.bot=cy+2.5*gap+12;this.fbEnd=W*.6;this.hole={x:W*.86,y:cy,R:2.5*gap+24};
    const x0=-W*.62,L=W*2.6;this.frets=[];for(let n=1;n<=18;n++){const x=x0+L*(1-Math.pow(2,-n/12));if(x>2&&x<this.fbEnd-3)this.frets.push({n,x});}
    this.strings=GTR.map((n,i)=>{const gauge=1-i/5,y=cy+(i-2.5)*gap;const s=new VString({sample:n,kind:'guitar',freq:[98,123.47,146.83,196,246.94,392][i],gauge,w:.85+gauge*1.9,pan:(i-2.5)*.08,owner:this,idx:i,wound:i<4});s.setLine(-W*.3,y,W*1.3,y);return s;});
    const br=$('#brand');br.style.top=Math.max(8,this.top-br.offsetHeight-30)+'px';$('#hint').style.top=(this.bot+22)+'px';
    this.base=bakeCanvas(W,H,g=>this.bake(g,W,H));},
  bake(g,W,H){const{top,bot,fbEnd,cy,hole,gap}=this;
    const body=g.createRadialGradient(hole.x,cy,hole.R*.8,hole.x,cy,W*.5);body.addColorStop(0,'rgba(40,46,84,.3)');body.addColorStop(1,'rgba(10,12,26,0)');g.fillStyle=body;g.fillRect(0,0,W,H);
    g.beginPath();g.moveTo(fbEnd+6,top-70);g.bezierCurveTo(W*.75,top-38,W*.9,top-120,W+30,top-96);glowStroke(g,1,1.3,.5);
    g.beginPath();g.moveTo(fbEnd+6,bot+70);g.bezierCurveTo(W*.75,bot+38,W*.9,bot+120,W+30,bot+96);glowStroke(g,1,1.3,.5);
    g.fillStyle='rgba(1,2,6,.96)';g.beginPath();g.arc(hole.x,hole.y,hole.R,0,6.283);g.fill();
    g.beginPath();g.arc(hole.x,hole.y,hole.R,0,6.283);glowStroke(g,1,1.4,.85);g.beginPath();g.arc(hole.x,hole.y,hole.R+7,0,6.283);glowStroke(g,1,.9,.55);g.beginPath();g.arc(hole.x,hole.y,hole.R+12,0,6.283);glowStroke(g,1,1.1,.7);
    for(let i=0;i<24;i++){const a=i/24*6.283;star(g,hole.x+Math.cos(a)*(hole.R+9.5),hole.y+Math.sin(a)*(hole.R+9.5),.5,.55);}
    const wood=g.createLinearGradient(0,top,0,bot);wood.addColorStop(0,'rgba(38,28,40,.96)');wood.addColorStop(.5,'rgba(24,18,30,.96)');wood.addColorStop(1,'rgba(38,28,40,.96)');g.fillStyle=wood;g.fillRect(-12,top,fbEnd+12,bot-top);
    for(let i=0;i<14;i++){const y=lerp(top+3,bot-3,rnd());g.strokeStyle=`rgba(255,220,190,${.018+rnd()*.02})`;g.lineWidth=.6;g.beginPath();g.moveTo(-12,y);g.bezierCurveTo(fbEnd*.3,y+rnd()*3-1.5,fbEnd*.7,y+rnd()*3-1.5,fbEnd,y);g.stroke();}
    g.beginPath();g.moveTo(-12,top);g.lineTo(fbEnd,top);g.moveTo(-12,bot);g.lineTo(fbEnd,bot);glowStroke(g,1,1.3,.75);g.beginPath();g.moveTo(fbEnd,top);g.lineTo(fbEnd,bot);glowStroke(g,1,1.1,.6);
    this.frets.forEach(f=>{const fr=g.createLinearGradient(f.x-1.5,0,f.x+1.5,0);fr.addColorStop(0,'rgba(150,160,180,.8)');fr.addColorStop(.5,'rgba(235,242,252,.95)');fr.addColorStop(1,'rgba(110,118,136,.8)');g.fillStyle=fr;g.fillRect(f.x-1.4,top+1,2.8,bot-top-2);});
    const mid=n=>{const a=this.frets.find(f=>f.n===n-1),b=this.frets.find(f=>f.n===n);return a&&b?(a.x+b.x)/2:null;};
    this.inlays=[];[3,5,7,9].forEach(n=>{const x=mid(n);if(x)this.inlays.push([x,cy]);});const x12=mid(12);if(x12)this.inlays.push([x12,cy-gap*1.5],[x12,cy+gap*1.5]);
    this.inlays.forEach(([x,y])=>{g.fillStyle='rgba(220,232,255,.18)';g.beginPath();g.arc(x,y,3.4,0,6.283);g.fill();});
    g.fillStyle='rgba(230,236,244,.85)';const sx=W+2;g.fillRect(sx-4,top+8,3,bot-top-16);},
  onPluck(){this.plucks++;if(this.plucks===1)$('#hint').style.opacity=0;if(this.plucks===3)$('#begin').classList.add('lit');},
  draw(t){const f=fitCanvas($('#lc'));if(!f)return;const{g,W,H}=f;g.clearRect(0,0,W,H);if(!this.strings.length||this.W!==W||this.H!==H)this.layout();
    g.drawImage(this.base,0,0,W,H);
    (this.inlays||[]).forEach(([x,y],i)=>star(g,x,y,1.3,.55+.3*Math.sin(t*1.3+i*1.9),.2));
    const fade=g.createLinearGradient(0,0,W,0);
    this.strings.forEach(st=>st.draw(g,t,1));
    g.save();g.globalCompositeOperation='destination-out';const l=g.createLinearGradient(0,0,W*.08,0);l.addColorStop(0,'rgba(0,0,0,1)');l.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=l;g.fillRect(0,this.top-20,W*.08,this.bot-this.top+40);g.restore();
    g.globalCompositeOperation='lighter';drawSparks(g,this.parts,t);drawGhost(g,this);g.globalCompositeOperation='source-over';}};
(function wireLanding(){const c=$('#lc');const pt=e=>{const r=c.getBoundingClientRect(),k=r.width/c.clientWidth;return{x:(e.clientX-r.left)/k,y:(e.clientY-r.top)/k,t:performance.now()};};
  c.addEventListener('pointerdown',e=>{const p=pt(e);Landing.ptr=p;Landing.strings.forEach(st=>{st.side=Math.sign(st.local(p).d)||1;});tapString(Landing.strings,p,6);c.setPointerCapture?.(e.pointerId);});
  c.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'&&!e.buttons){Landing.ptr=null;return;}const evs=e.getCoalescedEvents?e.getCoalescedEvents():[];for(const ev of (evs.length?evs:[e])){const p=pt(ev),p0=Landing.ptr||p;strum(Landing.strings,p0,p,p.t-(p0.t||p.t),Landing.push);Landing.ptr=p;}});
  ['pointerup','pointercancel'].forEach(ev=>c.addEventListener(ev,e=>{if(e.pointerType!=='mouse'){releaseAll(Landing.strings);Landing.ptr=null;}}));
  c.addEventListener('pointerleave',()=>{releaseAll(Landing.strings);Landing.ptr=null;});})();

/* ================= guitar sampler ================= */
const NOTE_PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11},NNAME=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function nameMidi(n){const m=/^([A-G])(#|s|b)?(\d)$/.exec(n);if(!m)return null;let pc=NOTE_PC[m[1]];if(m[2]==='#'||m[2]==='s')pc++;if(m[2]==='b')pc--;return 12*(+m[3]+1)+pc;}
const midiHz=m=>440*Math.pow(2,(m-69)/12),midiName=m=>NNAME[((Math.round(m)%12)+12)%12]+(Math.floor(Math.round(m)/12)-1);
function guitarNote(midi,vel=.4,delay=0,dur=0){if(!ready())return;let best=null,bd=99;for(const n of SAMPLE_NOTES){if(!SAMPLES[n])continue;const d=Math.abs(nameMidi(n)-midi);if(d<bd){bd=d;best=n;}}
  if(!best)return pluckSound(midiHz(midi),'guitar',vel,0,.2,delay);const t=ctx.currentTime+delay,src=ctx.createBufferSource();src.buffer=SAMPLES[best];src.playbackRate.value=Math.pow(2,(midi-nameMidi(best))/12);
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900+vel*vel*4000;const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.06+.4*Math.pow(vel,1.4),t+.005);if(dur)g.gain.setTargetAtTime(0,t+dur,.25);
  src.connect(lp).connect(g).connect(master);src.start(t);src.stop(t+4.2);}
function voiceSyn(freq,vel=.1){const t=ctx.currentTime,out=ctx.createGain();out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(vel,t+.09);const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=freq;
  const lfo=ctx.createOscillator();lfo.frequency.value=5.2;const lg=ctx.createGain();lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(freq*.008,t+.5);lfo.connect(lg).connect(o.frequency);
  [[700,6,1],[1150,8,.55],[2600,10,.22]].forEach(([f,q,a])=>{const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;const gg=ctx.createGain();gg.gain.value=a*2;o.connect(bp).connect(gg).connect(out);});
  out.connect(master);o.start(t);lfo.start(t);return{stop(){const s=ctx.currentTime;release(out.gain,s,.2);o.stop(s+.6);lfo.stop(s+.6);}};}
const SA={harmonium:261.63,bansuri:392,vocals:138.59,sitar:138.59};
const SA_NAME={harmonium:'Sa · Safed 1 (C4)',bansuri:'Sa · Safed 5 (G4)',vocals:'Sa · Kali 1 (C♯3)',sitar:'Sa · Kali 1 (C♯3)',guitar:'Standard tuning · E A D G B E',tabla:'Dayan tuned to Sa'};
function playSwara(key,semi,dur=.55,vel=.5){if(!ready())return;const f=SA[key]*Math.pow(2,semi/12);
  if(key==='sitar'){pluckSound(f,'sitar',vel*.8,0,.1);return;}const v=key==='harmonium'?reed(f,.05+.08*vel):key==='bansuri'?flute(f,.06+.09*vel):voiceSyn(f,.05+.07*vel);setTimeout(()=>v.stop(),dur*1000);}

/* ================= mic pitch detection (YIN) ================= */
function yin(buf,sr){const half=buf.length>>1,maxTau=Math.min(half-2,Math.floor(sr/65)),minTau=Math.floor(sr/1500),d=new Float32Array(maxTau+2);
  for(let tau=1;tau<=maxTau+1;tau++){let s=0;for(let i=0;i<half;i++){const x=buf[i]-buf[i+tau];s+=x*x;}d[tau]=s;}
  let run=0;d[0]=1;for(let tau=1;tau<=maxTau+1;tau++){run+=d[tau];d[tau]=run?d[tau]*tau/run:1;}
  let tau=-1;for(let t=minTau;t<=maxTau;t++){if(d[t]<.15){while(t+1<=maxTau&&d[t+1]<d[t])t++;tau=t;break;}}if(tau<2)return null;
  const x0=d[tau-1],x1=d[tau],x2=d[tau+1],a=(x0+x2-2*x1)/2,b=(x2-x0)/2;return{freq:sr/(a?tau-b/(2*a):tau),clarity:1-x1};}
const Mic={active:false,gate:.012,hist:[],env:0,lastOnset:0,level:0,
  async start(){if(this.active)return true;try{ac();if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw 0;
    this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const src=ctx.createMediaStreamSource(this.stream);this.an=ctx.createAnalyser();this.an.fftSize=2048;src.connect(this.an);this.buf=new Float32Array(2048);this.active=true;return true;}catch(e){return false;}},
  read(){if(!this.active)return null;this.an.getFloatTimeDomainData(this.buf);let rms=0;for(const v of this.buf)rms+=v*v;rms=Math.sqrt(rms/this.buf.length);this.level=this.level*.8+rms*.2;
    const tt=ctx.currentTime;let onset=false;if(rms>Math.max(this.gate*1.6,this.env*1.9)&&tt-this.lastOnset>.09){onset=true;this.lastOnset=tt;}this.env=this.env*.9+rms*.1;
    if(rms<this.gate){this.hist=[];return{freq:null,rms,onset};}const r=yin(this.buf,ctx.sampleRate);if(!r||r.clarity<.8)return{freq:null,rms,onset};
    this.hist.push(r.freq);if(this.hist.length>3)this.hist.shift();return{freq:[...this.hist].sort((a,b)=>a-b)[this.hist.length>>1],rms,onset};}};

/* ================= song library ================= */
const SONGS={
  guitar:{warm:[
    {id:'g-open',title:'Open strings',sub:'Each string, low to high and back',lvl:1,bpm:66,kind:'tab',notes:'E2:2 A2:2 D3:2 G3:2 B3:2 E4:2 E4:2 B3:2 G3:2 D3:2 A2:2 E2:2'},
    {id:'g-first',title:'First notes',sub:'E, F and G on the high E string',lvl:1,bpm:70,kind:'tab',notes:'E4 F4 G4:2 G4 F4 E4:2 E4 G4 F4 E4 F4:2 E4:2'},
    {id:'g-sargam',title:'Sargam on guitar',sub:'Sa Re Ga Ma Pa Dha Ni Sa in C',lvl:1,bpm:72,kind:'tab',notes:'C3 D3 E3 F3 G3 A3 B3 C4:2 C4 B3 A3 G3 F3 E3 D3 C3:2'}],
   songs:[
    {id:'g-twinkle',title:'Twinkle Twinkle',sub:'Traditional',lvl:1,bpm:88,kind:'tab',notes:'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2'},
    {id:'g-ode',title:'Ode to Joy',sub:'Beethoven',lvl:2,bpm:96,kind:'tab',notes:'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2'},
    {id:'g-bday',title:'Happy Birthday',sub:'Traditional',lvl:2,bpm:96,kind:'tab',notes:'G3:.75 G3:.25 A3 G3 C4 B3:2 G3:.75 G3:.25 A3 G3 D4 C4:2 G3:.75 G3:.25 G4 E4 C4 B3 A3:2 F4:.75 F4:.25 E4 C4 D4 C4:2'},
    {id:'g-jingle',title:'Jingle Bells',sub:'J. Pierpont',lvl:2,bpm:112,kind:'tab',notes:'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2'}]},
  melodic:{warm:[
    {id:'m-sa',title:'Find your Sa',sub:'Hold Sa steady with the tanpura',lvl:1,bpm:60,kind:'sargam',notes:'S:4 _:2 S:4 _:2 S:4'},
    {id:'m-srg',title:'Sa Re Ga',sub:'Your first three swaras',lvl:1,bpm:66,kind:'sargam',notes:'S:2 R:2 G:2 R:2 S:4 _:2 S R G R S:2'},
    {id:'m-aaroh',title:'Aaroh and avaroh',sub:'The full saptak, up and down',lvl:1,bpm:72,kind:'sargam',notes:"S R G m P D N S':2 S' N D P m G R S:2"},
    {id:'m-alankar',title:'Alankar',sub:'S R G, R G m, G m P…',lvl:2,bpm:76,kind:'sargam',notes:"S R G R G m G m P m P D P D N D N S':2 S' N D N D P D P m P m G m G R G R S:2"}],
   songs:[
    {id:'m-twinkle',title:'Twinkle Twinkle',sub:'Traditional · in sargam',lvl:1,bpm:84,kind:'sargam',notes:'S S P P D D P:2 m m G G R R S:2 P P m m G G R:2 P P m m G G R:2 S S P P D D P:2 m m G G R R S:2'},
    {id:'m-bday',title:'Happy Birthday',sub:'Traditional · in sargam',lvl:2,bpm:90,kind:'sargam',notes:'.P:.75 .P:.25 .D .P S .N:2 .P:.75 .P:.25 .D .P R S:2 .P:.75 .P:.25 P G S .N .D:2 m:.75 m:.25 G S R S:2'},
    {id:'m-bhupali',title:'Bhupali geet',sub:'Raag Bhupali · teentaal',lvl:2,bpm:80,kind:'sargam',notes:"G G R S R G P G D P G R S:2 S:2 G P D S' D P G R G P G R S:4"},
    {id:'m-yaman',title:'Raag Yaman',sub:'Evening raag with tivra Ma',lvl:3,bpm:60,kind:'sargam',notes:".N R G M D N S':2 S' N D P M G R S:2 .N R G R S:2 P M G R S:4"}]},
  tabla:{warm:[
    {id:'t-na',title:'Na on the dayan',sub:'The ringing right-hand stroke',lvl:1,bpm:70,kind:'bols',bols:'Na Na Na Na Na Na Na Na'},
    {id:'t-ge',title:'Ge on the bayan',sub:'The deep left-hand stroke',lvl:1,bpm:70,kind:'bols',bols:'Ge Ge Ge Ge Na Na Na Na'},
    {id:'t-dha',title:'Dha = Na + Ge',sub:'Both drums together',lvl:1,bpm:70,kind:'bols',bols:'Dha _ Dha _ Na Ge Dha _ Dha Dha Na Na Dha _ _ _'}],
   songs:[
    {id:'t-keherwa',title:'Keherwa groove',sub:'8 matras · film and bhajan songs',lvl:1,bpm:80,kind:'bols',taal:'keherwa',cycles:2},
    {id:'t-dadra',title:'Dadra groove',sub:'6 matras · light classical',lvl:1,bpm:84,kind:'bols',taal:'dadra',cycles:3},
    {id:'t-teentaal',title:'Teentaal',sub:'16 matras · the king of taals',lvl:2,bpm:72,kind:'bols',taal:'teentaal',cycles:1},
    {id:'t-dugun',title:'Keherwa dugun',sub:'Double speed',lvl:3,bpm:60,kind:'bols',taal:'keherwa',cycles:2,dugun:true}]}};
const TAALS={dadra:{matras:6,bols:'Dha Dhi Na Dha Ti Na',vibhag:[3,3],marks:['X','0']},keherwa:{matras:8,bols:'Dha Ge Na Ti Na Ke Dhi Na',vibhag:[4,4],marks:['X','0']},teentaal:{matras:16,bols:'Dha Dhin Dhin Dha Dha Dhin Dhin Dha Dha Tin Tin Ta Ta Dhin Dhin Dha',vibhag:[4,4,4,4],marks:['X','2','0','3']}};
for(const k in TAALS)TAALS[k].bols=TAALS[k].bols.split(' ');
const famOf=k=>k==='guitar'?'guitar':k==='tabla'?'tabla':'melodic';
const LET=['S','r','R','g','G','m','M','P','d','D','n','N'],DEVA=['सा','रे','रे','ग','ग','म','म॑','प','ध','ध','नि','नि'],KOMAL=[0,1,0,1,0,0,0,0,1,0,1,0];
const OPEN=[40,45,50,55,59,64],SNAME=['E','A','D','G','B','e'];
function tabPos(m){for(let s=5;s>=0;s--){const f=m-OPEN[s];if(f>=0&&f<=5)return{s,f};}let b={s:0,f:Math.max(0,m-40)};for(let s=0;s<6;s++){const f=m-OPEN[s];if(f>=0&&f<b.f)b={s,f};}return b;}
function parseSong(song){let t=0;const out=[];
  if(song.kind==='bols'){let seq=[],dur=1;if(song.bols)seq=song.bols.split(/\s+/);else{const T=TAALS[song.taal];for(let r=0;r<song.cycles*(song.dugun?2:1);r++)seq.push(...T.bols);dur=song.dugun?.5:1;}
    seq.forEach(b=>{out.push({bol:b,rest:b==='_',start:t,beats:dur,lanes:bolLanes(b)});t+=dur;});return{notes:out,total:t};}
  for(const tok of song.notes.trim().split(/\s+/)){let[nm,du]=tok.split(':');const beats=du?parseFloat(du):1;if(nm==='_'){out.push({rest:true,start:t,beats});t+=beats;continue;}
    if(song.kind==='tab'){const midi=nameMidi(nm);out.push({midi,...tabPos(midi),start:t,beats});}
    else{let lo=0,hi=0;while(nm.startsWith('.')){lo++;nm=nm.slice(1);}while(nm.endsWith("'")){hi++;nm=nm.slice(0,-1);}out.push({semi:LET.indexOf(nm)+12*(hi-lo),start:t,beats});}t+=beats;}
  return{notes:out,total:t};}
function bolLanes(b){b=b.toLowerCase();if(b==='_')return[];if(['na','ta','tin','ti','te','tun','ra'].includes(b))return['d'];if(['ge','ghe','ke','ka','kat','ga'].includes(b))return['b'];return['b','d'];}
const songSecs=s=>{const p=parseSong(s);return Math.round((p.total+4)*60/s.bpm);};
const fmtDur=s=>s<60?s+' s':Math.floor(s/60)+':'+String(s%60).padStart(2,'0');

/* ================= state ================= */
const SKEY='fretopia.c1';
let S=(()=>{try{return Object.assign({inst:null,stars:{},input:null},JSON.parse(localStorage.getItem(SKEY)||'{}'));}catch(e){return{inst:null,stars:{},input:null};}})();
const saveS=()=>{try{localStorage.setItem(SKEY,JSON.stringify(S));}catch(e){}};
const starStr=n=>[0,1,2].map(i=>`<span class="${i<n?'':'off'}">★</span>`).join('');

/* ================= instrument home ================= */
const IC={play:'<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',pause:'<svg viewBox="0 0 24 24"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',ear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 2.8-1.8 3.8-2.8 5.2S13.6 20 11 20"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0"/></svg>',
  restart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4.5H9"/></svg>',
  mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  tap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.6 15a1.5 1.5 0 0 1 2.3-1.9L9 15"/></svg>',
  wait:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg>',
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'};
let hero=null;
function libFor(k){return SONGS[famOf(k)];}
function allSongs(k){const l=libFor(k);return[...l.warm,...l.songs];}
let renderTok=0;
function renderHome(){const tok=++renderTok,key=S.inst||'guitar',inst=I[key],lib=libFor(key),all=allSongs(key);
  $('#hTitle').innerHTML=`${inst.name}<span class="hi">${inst.hi}</span>`;$('#hSub').textContent=SA_NAME[key];
  $('#hStars').innerHTML=`<span class="st">★</span>${all.reduce((a,s)=>a+(S.stars[s.id]||0),0)}`;
  const next=all.find(s=>!S.stars[s.id])||all.find(s=>(S.stars[s.id]||0)<3)||all[0],isWarm=lib.warm.includes(next);
  $('#hscroll').innerHTML=`<div class="hero"><canvas id="heroCv" aria-label="${inst.name}, playable"></canvas><div class="ov"><span class="eyebrow">Up next · ${isWarm?'Warm-up':'Song'}</span><h2>${next.title}</h2><p class="meta">${next.sub} · ${fmtDur(songSecs(next))}</p></div><button class="go" data-song="${next.id}" aria-label="Play ${next.title}">${IC.play}</button></div>
    <div class="sec"><div class="sec-h"><h3>Songs for you</h3><span>swipe</span></div><div class="row">${lib.songs.map(s=>`<button class="song" data-song="${s.id}"><canvas data-cv="${s.id}"></canvas><h4>${s.title}</h4><div class="s2"><span>${s.sub.split(' · ')[0]}</span><span class="lvl">${[1,2,3].map(i=>`<i class="${i<=s.lvl?'on':''}"></i>`).join('')}</span></div><div class="s2"><span>${fmtDur(songSecs(s))} · ${s.bpm} BPM</span><span class="stars">${starStr(S.stars[s.id]||0)}</span></div></button>`).join('')}</div></div>
    <div class="sec"><div class="sec-h"><h3>Warm-ups</h3><span>${lib.warm.length} exercises</span></div><div class="list">${lib.warm.map((s,i)=>`<button class="li${S.stars[s.id]?' done':''}" data-song="${s.id}"><span class="n">${S.stars[s.id]?'✓':i+1}</span><span><b>${s.title}</b><small>${s.sub} · ${fmtDur(songSecs(s))}</small></span><span class="stars">${starStr(S.stars[s.id]||0)}</span></button>`).join('')}</div></div>
    <p class="note">${key==='tabla'?'Tap the drums on screen, or play a real tabla near your mic.':'Fretopia listens through your microphone and scores every note. No instrument nearby? Switch to Tap in the player.'}</p>`;
  requestAnimationFrame(()=>{if(tok!==renderTok)return;lib.songs.forEach(s=>{const c=$(`[data-cv="${s.id}"]`);if(c)drawConstellation(c,s);});const c=$('#heroCv');if(!c)return;hero={c,inst:Object.create(inst),W:0,H:0,ptrs:{}};wireHero();});}
function drawConstellation(c,song){const f=fitCanvas(c);if(!f)return;const{g,W,H}=f;const p=parseSong(song).notes.filter(n=>!n.rest).slice(0,14);if(!p.length)return;
  const vals=p.map(n=>n.midi??n.semi??(n.lanes.length===2?1:n.lanes[0]==='b'?0:2)),mn=Math.min(...vals),mx=Math.max(...vals)||1,T=p[p.length-1].start||1;
  const pts=p.map((n,i)=>[16+(W-32)*(n.start/T),H-18-(H-36)*((vals[i]-mn)/((mx-mn)||1))]);
  g.strokeStyle='rgba(170,205,255,.32)';g.lineWidth=1;g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();pts.forEach(([x,y],i)=>star(g,x,y,i%4===0?1.3:.9,.9));}
function wireHero(){const H=hero,c=H.c;const loc=e=>{const r=c.getBoundingClientRect(),k=r.width/c.clientWidth,X=(e.clientX-r.left)/k,Y=(e.clientY-r.top)/k;return H.inst.rot?{x:c.clientHeight-Y,y:X,t:performance.now()}:{x:X,y:Y,t:performance.now()};};
  c.addEventListener('pointerdown',e=>{e.preventDefault();c.setPointerCapture?.(e.pointerId);const p=loc(e);H.ptrs[e.pointerId]=p;H.inst.down(p,e.pointerId);});
  c.addEventListener('pointermove',e=>{const p0=H.ptrs[e.pointerId];if(!p0)return;const p=loc(e);H.inst.move(p0,p,p.t-p0.t,e.pointerId);H.ptrs[e.pointerId]=p;});
  ['pointerup','pointercancel'].forEach(ev=>c.addEventListener(ev,e=>{if(H.ptrs[e.pointerId]){H.inst.up(e.pointerId);delete H.ptrs[e.pointerId];}}));c.style.touchAction='none';}
function drawHero(t){if(!hero)return;const f=fitCanvas(hero.c);if(!f)return;if(hero.W!==f.W||hero.H!==f.H){hero.W=f.W;hero.H=f.H;hero.inst.rot?hero.inst.init(f.H,f.W):hero.inst.init(f.W,f.H);}
  f.g.clearRect(0,0,f.W,f.H);if(hero.inst.rot){f.g.save();f.g.translate(0,f.H);f.g.rotate(-Math.PI/2);hero.inst.draw(f.g,t,1);f.g.restore();}else hero.inst.draw(f.g,t,1);}
$('#hscroll').addEventListener('click',e=>{const b=e.target.closest('[data-song]');if(!b||rowDrag.moved)return;const s=allSongs(S.inst).find(x=>x.id===b.dataset.song);if(s)Player.open(s);});
const rowDrag={el:null,moved:false};
document.addEventListener('pointerdown',e=>{const r=e.target.closest('.row');rowDrag.moved=false;if(!r||e.pointerType!=='mouse')return;rowDrag.el=r;rowDrag.x=e.clientX;rowDrag.sl=r.scrollLeft;r.style.scrollSnapType='none';});
document.addEventListener('pointermove',e=>{if(!rowDrag.el)return;const dx=e.clientX-rowDrag.x;if(Math.abs(dx)>5)rowDrag.moved=true;rowDrag.el.scrollLeft=rowDrag.sl-dx;});
document.addEventListener('pointerup',()=>{if(!rowDrag.el)return;const r=rowDrag.el;rowDrag.el=null;r.style.scrollSnapType='';setTimeout(()=>rowDrag.moved=false,30);});

/* ================= play-along player ================= */
const Player={open(song){if($('#player'))this.close(true);ac();this.song=song;this.key=S.inst||'guitar';this.kind=song.kind;const p=parseSong(song);this.notes=p.notes;this.total=p.total;this.bpm=song.bpm;this.speed=1;
    if(this.kind==='sargam'){const s=this.notes.filter(n=>!n.rest).map(n=>n.semi);this.min=Math.min(...s)-1;this.max=Math.max(...s)+1;}
    const micOK=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)&&window.isSecureContext;this.mode=this.kind==='bols'?'tap':(S.input||(micOK?'mic':'tap'));this.wait=this.kind!=='bols';this.guide=false;
    const el=document.createElement('section');el.className='player';el.id='player';
    el.innerHTML=`<div class="pl-top"><button class="ib" id="plX" aria-label="Close">${IC.x}</button><div class="pl-title"><small>${I[this.key].name} · ${song.sub.split(' · ')[0]}</small><b>${song.title}</b></div><span></span></div>
      <div class="pl-prog"><i id="plProg"></i></div>
      <div class="pl-stats"><div><small>Accuracy</small><b id="plAcc">–</b></div><div><small>${this.kind==='bols'?'Bols':'Notes'}</small><b id="plCount">0/${this.notes.filter(n=>!n.rest).length}</b></div><div><small>Streak</small><b id="plStreak">0</b></div></div>
      <div class="pl-stage" id="plStage"><canvas id="plCv"></canvas><div class="pl-msg" id="plMsg" hidden></div></div>
      <div class="pl-ctrl"><button class="round" id="plListen" aria-label="Hear it first">${IC.ear}</button><button class="round big" id="plPlay" aria-label="Play">${IC.play}</button><button class="round" id="plRestart" aria-label="Restart">${IC.restart}</button></div>
      <div class="chips" id="plChips"></div><div class="pad-area" id="plPad"></div>`;
    SCREEN.appendChild(el);this.wire();this.chips();this.pad();this.reset();},
  close(silent){this.pause();$('#player')?.remove();closeSheet();if(!silent)renderHome();},
  wire(){$('#plX').onclick=()=>this.close();$('#plPlay').onclick=()=>{if(this.running&&this.listen){this.pause();this.reset();}this.start(false);};
    $('#plListen').onclick=()=>{const was=this.running&&this.listen;this.pause();this.reset();if(!was)this.start(true);};
    $('#plRestart').onclick=()=>{const was=this.running&&!this.listen;this.pause();this.reset();if(was)this.start(false);};
    $('#plChips').onclick=e=>{const b=e.target.closest('[data-c]');if(!b)return;const c=b.dataset.c;
      if(c==='mic'){this.mode='mic';S.input='mic';saveS();Mic.start().then(ok=>{if(!ok){this.mode='tap';this.msg('Microphone is not available here. Open fretopia.vercel.app on your phone, or keep tapping along.');}this.chips();this.pad();});}
      if(c==='tap'){this.mode='tap';S.input='tap';saveS();}if(c==='wait')this.wait=!this.wait;if(c==='guide')this.guide=!this.guide;if(c.startsWith('sp'))this.speed=+c.slice(2);this.chips();this.pad();this.hud();};
    const st=$('#plStage');st.addEventListener('pointerdown',e=>{if(this.kind==='tab'&&this.mode==='tap'){e.preventDefault();this.tap({any:true});}});},
  chips(){const c=[];if(this.kind!=='bols')c.push(`<button class="chip" data-c="mic" aria-pressed="${this.mode==='mic'}">${IC.mic}Mic</button>`);
    c.push(`<button class="chip" data-c="tap" aria-pressed="${this.mode==='tap'}">${IC.tap}Tap</button>`);if(this.kind!=='bols')c.push(`<button class="chip" data-c="wait" aria-pressed="${this.wait}">${IC.wait}Wait for me</button>`);
    c.push(`<button class="chip" data-c="guide" aria-pressed="${this.guide}">${IC.note}Melody</button>`);[.5,.75,1].forEach(s=>c.push(`<button class="chip" data-c="sp${s}" aria-pressed="${this.speed===s}">${s*100}%</button>`));$('#plChips').innerHTML=c.join('');},
  pad(){const P=$('#plPad');if(this.kind==='bols'){P.innerHTML=`<div class="drums"><button class="drum" data-l="b">Bayan<small>left · F</small></button><button class="drum" data-l="d">Dayan<small>right · J</small></button></div>`;
      P.querySelectorAll('.drum').forEach(d=>d.addEventListener('pointerdown',e=>{e.preventDefault();this.tap({lane:d.dataset.l});d.classList.add('hit');setTimeout(()=>d.classList.remove('hit'),120);}));return;}
    if(this.mode==='mic'){P.innerHTML=`<p class="note" style="margin:6px 0 4px">Listening. Play the highlighted note on your ${I[this.key].name.toLowerCase()}.<br><span id="plHear" style="color:var(--ink)">&nbsp;</span></p>`;return;}
    if(this.kind==='tab'){P.innerHTML=`<button class="tapbig" id="plTap">Tap as each note reaches the line</button>`;$('#plTap').addEventListener('pointerdown',e=>{e.preventDefault();this.tap({any:true});e.currentTarget.classList.add('hit');setTimeout(()=>$('#plTap')?.classList.remove('hit'),110);});return;}
    const semis=[...new Set(this.notes.filter(n=>!n.rest).map(n=>n.semi))].sort((a,b)=>a-b);
    P.innerHTML=`<div class="swaras">${semis.map((s,i)=>{const pc=((s%12)+12)%12,oct=Math.floor(s/12);return `<button data-s="${s}"><span style="${KOMAL[pc]?'text-decoration:underline':''}">${DEVA[pc]}${oct>0?'̇':''}</span><small>${oct<0?'low ':oct>0?'high ':''}${i+1}</small></button>`;}).join('')}</div>`;
    P.querySelectorAll('[data-s]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();this.tap({semi:+b.dataset.s,btn:b});}));},
  msg(m){const el=$('#plMsg');el.textContent=m;el.hidden=false;clearTimeout(this.mt);this.mt=setTimeout(()=>el.hidden=true,6000);},
  reset(){this.t=-4;this.ended=false;this.trail=[];this.pops=[];this.nextTick=-4;this.nextIdx=0;this.matchAcc=0;this.floor=[];this.elapsed=0;this.streak=0;this.best=0;this.heard=null;
    this.notes.forEach(n=>Object.assign(n,{frames:0,good:0,judged:false,state:null,unlocked:false,hits:{},score:0}));this.hud();this.btn();},
  async start(listen=false){ac();if(this.running){this.pause();return;}if(this.ended)this.reset();this.listen=listen;
    if(!listen&&this.mode==='mic'){const ok=await Mic.start();if(!ok){this.mode='tap';this.chips();this.pad();this.msg('Microphone is not available here, so you are in Tap mode. On fretopia.vercel.app your mic works.');}}
    this.running=true;this.lastAudio=ctx.currentTime;this.btn();},
  pause(){this.running=false;this.btn();},
  btn(){const b=$('#plPlay');if(!b)return;b.innerHTML=this.running&&!this.listen?IC.pause:IC.play;$('#plListen').classList.toggle('on',!!(this.running&&this.listen));},
  bps(){return this.bpm*this.speed/60;},
  pitchVal(det){if(!det||!det.freq)return null;return this.kind==='tab'?69+12*Math.log2(det.freq/440):12*Math.log2(det.freq/SA[this.key]);},
  matches(v,n){if(v==null)return false;const ref=this.kind==='tab'?n.midi:n.semi;return Math.abs((((v-ref)%12)+18)%12-6)<=.5;},
  current(){return this.notes.find(n=>!n.rest&&this.t>=n.start&&this.t<n.start+n.beats);},
  sound(n,v=.35){if(!n||n.rest)return;if(this.kind==='tab')guitarNote(n.midi,v,0,n.beats/this.bps());else if(this.kind==='sargam')playSwara(this.key,n.semi,Math.min(1.4,n.beats/this.bps()*.9),v);else n.lanes.forEach(l=>l==='b'?ready()&&bayan(v*.7,86):tablaHit(n.bol.toLowerCase()==='tin'||n.bol.toLowerCase()==='dhin'?'tin':'na',v*.7));},
  frame(t){if(!this.running)return;const now_=ctx.currentTime;let dt=Math.min(.1,now_-this.lastAudio);this.lastAudio=now_;const bps=this.bps();
    const det=(!this.listen&&this.mode==='mic')?Mic.read():null,pv=this.pitchVal(det);if(det&&this.t<0&&det.rms!=null)this.floor.push(det.rms);this.heard=pv;
    let adv=true;this.waitFor=null;
    if(this.wait&&!this.listen&&this.kind!=='bols'&&this.t>=0){const pend=this.notes.find(n=>!n.rest&&!n.unlocked&&this.t>=n.start);
      if(pend){if(this.mode==='mic'){if(this.matches(pv,pend)){this.matchAcc+=dt;if(this.matchAcc>.1){pend.unlocked=true;this.matchAcc=0;}}else this.matchAcc=0;}if(!pend.unlocked){adv=false;this.t=pend.start;this.waitFor=pend;}}}
    const prev=this.t;if(adv)this.t+=dt*bps;if(this.t>=0)this.elapsed+=dt;
    while(this.nextTick<0&&this.t>=this.nextTick){click(now_,this.nextTick===-4);this.nextTick++;}
    if(prev<0&&this.t>=0&&this.floor.length){const f=[...this.floor].sort((a,b)=>a-b)[this.floor.length>>1];Mic.gate=clamp(f*2.5,.008,.08);}
    while(this.nextIdx<this.notes.length&&this.t>=this.notes[this.nextIdx].start){const n=this.notes[this.nextIdx];if(this.listen||this.guide)this.sound(n,this.listen?.4:.22);this.nextIdx++;}
    const cur=this.current();
    if(this.mode==='mic'&&this.kind!=='bols'&&cur&&adv&&!this.listen){cur.frames+=dt;if(this.matches(pv,cur))cur.good+=dt;}
    if(this.kind==='bols'&&det&&det.onset&&!this.listen)this.tap({any:true});
    this.notes.forEach(n=>{if(n.rest||n.judged)return;
      if(this.listen){if(this.t>=n.start+n.beats){n.judged=true;n.state='demo';}return;}
      if(this.mode==='mic'&&this.kind!=='bols'){if(this.t>=n.start+n.beats){n.judged=true;const a=n.frames?n.good/n.frames:0;n.score=clamp(a/.6,0,1);n.state=n.score>=.5?'hit':'miss';this.combo(n.state==='hit');}}
      else if((this.t-n.start)/bps>.26&&!(this.waitFor===n)){n.judged=true;n.state='miss';n.score=0;this.combo(false);this.pops.push({txt:'Miss',t:now(),n});}});
    if(this.mode==='mic'&&!this.listen){this.trail.push({t:this.t,v:pv});if(this.trail.length>300)this.trail.shift();const h=$('#plHear');if(h)h.textContent=pv==null?' ':(this.kind==='tab'?'Hearing '+midiName(pv):'Hearing '+DEVA[((Math.round(pv)%12)+12)%12]);}
    $('#plProg').style.width=clamp(this.t/this.total*100,0,100)+'%';
    if(this.t>=this.total+.6)this.finish();},
  combo(ok){this.streak=ok?this.streak+1:0;this.best=Math.max(this.best,this.streak);this.hud();},
  tap(inp){const bps=this.bps();
    if(!this.running||this.listen){if(this.kind==='sargam'&&inp.semi!=null)playSwara(this.key,inp.semi,.4,.4);else if(this.kind==='bols')inp.lane==='b'?ready()&&bayan(.5,86):tablaHit('na',.5);else{const n=this.notes.find(x=>!x.rest&&x.start>=this.t)||this.notes.find(x=>!x.rest);this.sound(n,.35);}return;}
    const tn=this.t+(ctx.currentTime-this.lastAudio)*bps;let best=null,bd=1e9;
    for(const n of this.notes){if(n.rest||n.judged)continue;if(this.kind==='bols'&&inp.lane&&!n.lanes.includes(inp.lane))continue;const d=Math.abs(tn-n.start)/bps;if((d<=.26||this.waitFor===n)&&d<bd){bd=d;best=n;}}
    if(this.kind==='sargam'){playSwara(this.key,inp.semi,.45,.42);if(!best)return;if(((best.semi-inp.semi)%12+12)%12!==0){inp.btn&&(inp.btn.classList.add('bad'),setTimeout(()=>inp.btn.classList.remove('bad'),200));return;}inp.btn&&(inp.btn.classList.add('hit'),setTimeout(()=>inp.btn.classList.remove('hit'),200));}
    else if(this.kind==='tab'){this.sound(best||this.notes.find(x=>!x.rest&&x.start>=tn)||this.notes.find(x=>!x.rest),.42);if(!best)return;}
    else{inp.lane==='b'?ready()&&bayan(.55,86):tablaHit('na',.55);if(!best)return;best.hits[inp.lane||'any']=1;if(inp.lane&&!best.lanes.every(l=>best.hits[l]))return;}
    const d=this.waitFor===best?0:bd;best.judged=true;best.unlocked=true;best.score=d<=.08?1:d<=.16?.8:.6;best.state='hit';this.combo(true);this.pops.push({txt:best.score===1?'Perfect':'Good',t:now(),n:best});buzz(6);},
  scores(){return this.notes.filter(n=>!n.rest&&n.judged&&n.state!=='demo').map(n=>n.score);},
  hud(){if(!$('#plAcc'))return;const s=this.scores();$('#plAcc').textContent=s.length?Math.round(s.reduce((a,b)=>a+b,0)/s.length*100)+'%':'–';
    $('#plCount').textContent=`${this.notes.filter(n=>n.state==='hit').length}/${this.notes.filter(n=>!n.rest).length}`;$('#plStreak').textContent=this.streak;},
  finish(){this.running=false;this.ended=true;this.btn();if(this.listen){this.listen=false;this.reset();toast('Your turn. Press play when ready.');return;}
    const tot=this.notes.filter(n=>!n.rest),pct=Math.round(tot.reduce((a,n)=>a+n.score,0)/Math.max(1,tot.length)*100),stars=pct>=90?3:pct>=70?2:pct>=45?1:0,prev=S.stars[this.song.id]||0;
    if(stars>prev){S.stars[this.song.id]=stars;saveS();}const all=allSongs(this.key),nx=all[all.indexOf(this.song)+1];const m=Math.floor(this.elapsed/60),s=Math.round(this.elapsed%60);
    sheet(`<span class="grab"></span><div style="display:flex;justify-content:space-between;align-items:center"><div><p class="eyebrow">${['Keep going','Good start','Bahut badhiya','Shabash!'][stars]}</p><h2 class="hand" style="font-size:30px;margin-top:4px">${this.song.title}</h2></div><div class="bigstars">${starStr(stars)}</div></div>
      <div class="sum"><div><small>Accuracy</small><b>${pct}%</b></div><div><small>Best streak</small><b>${this.best}</b></div><div><small>Time</small><b>${m}:${String(s).padStart(2,'0')}</b></div></div>
      <div class="nb">${tot.map(n=>`<i style="height:${Math.max(8,n.score*100)}%;background:${n.score>=.75?'#7EE2A8':n.score>=.4?'#F2C98A':'#FF8A8A'}"></i>`).join('')}</div>
      <p style="font-size:13px;color:var(--ink-2)">${stars<2?'Try 75% speed with Wait for me on. Fretopia waits until you hit each note.':'Ready for the next one?'}</p>
      <div class="btns"><button class="btn" id="shAgain">${IC.restart}Again</button>${nx?`<button class="btn pri" id="shNext">Next: ${nx.title}</button>`:`<button class="btn pri" id="shDone">Done</button>`}</div>`);
    $('#shAgain').onclick=()=>{closeSheet();this.reset();this.start(false);};if(nx)$('#shNext').onclick=()=>{closeSheet();Player.open(nx);};else $('#shDone').onclick=()=>this.close();},
  draw(t){const cv=$('#plCv');if(!cv)return;const f=fitCanvas(cv);if(!f)return;const{g,W,H}=f;g.clearRect(0,0,W,H);
    if(this.kind==='tab')this.drawTab(g,W,H,t);else if(this.kind==='sargam')this.drawSargam(g,W,H,t);else this.drawBols(g,W,H,t);
    if(this.t<0&&this.running){g.fillStyle='rgba(234,242,255,.95)';g.font='86px "Petaluma Script",cursive';g.textAlign='center';g.textBaseline='middle';g.fillText(String(Math.ceil(-this.t)),W/2,H/2);}
    if(!this.running&&!this.ended&&this.t<=-4){g.fillStyle='rgba(234,242,255,.55)';g.font='600 12px "Plus Jakarta Sans",sans-serif';g.textAlign='center';g.fillText(this.mode==='mic'?'Press play · 4-beat count-in · then play your instrument':'Press play · 4-beat count-in · then tap along',W/2,H-14);}
    const tt=now();this.pops=this.pops.filter(p=>tt-p.t<.7);},
  geom(W){const gut=36,nowX=gut+(W-gut)*.24,ppb=clamp((W-gut)/5.2,46,120);return{gut,nowX,ppb};},
  beatLines(g,W,H,gut,nowX,ppb){for(let b=Math.ceil(this.t-(nowX-gut)/ppb);b<=this.t+(W-nowX)/ppb;b++){const x=nowX+(b-this.t)*ppb;if(x<gut||b<0)continue;g.fillStyle=b%4===0?'rgba(170,205,255,.12)':'rgba(170,205,255,.05)';g.fillRect(x,8,1,H-16);}},
  nowLine(g,H,nowX){g.fillStyle='rgba(234,242,255,.9)';g.shadowColor='rgba(150,200,255,.9)';g.shadowBlur=12*DPR;g.fillRect(nowX-1,6,2,H-12);g.shadowBlur=0;},
  noteColor(n,cur){return n.state==='hit'?['#7EE2A8','#05140c']:n.state==='miss'?['rgba(255,138,138,.35)','#FF8A8A']:n.state==='demo'?['rgba(234,242,255,.3)','#05060B']:cur?['#F2C98A','#1a1206']:['rgba(234,242,255,.92)','#05060B'];},
  drawTab(g,W,H,t){const{gut,nowX,ppb}=this.geom(W),top=26,bot=H-26,ly=s=>top+(5-s)*(bot-top)/5;this.beatLines(g,W,H,gut,nowX,ppb);
    const cur=this.current();
    for(let s=0;s<6;s++){const y=ly(s),hot=cur&&cur.s===s;g.strokeStyle=s<4?`rgba(196,158,104,${hot?.95:.6})`:`rgba(196,208,224,${hot?.95:.6})`;g.lineWidth=.8+(5-s)*.32;g.shadowColor=hot?'rgba(242,201,138,.9)':'transparent';g.shadowBlur=hot?10*DPR:0;g.beginPath();g.moveTo(gut,y);g.lineTo(W,y);g.stroke();g.shadowBlur=0;
      g.fillStyle='rgba(234,242,255,.5)';g.font='600 11px "Plus Jakarta Sans",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(SNAME[s],gut/2,y);}
    for(const n of this.notes){if(n.rest)continue;const x0=nowX+(n.start-this.t)*ppb,len=n.beats*ppb-10;if(x0>W+20||x0+len<gut-20)continue;const y=ly(n.s),c=n===cur&&!n.judged,[fill,ink]=this.noteColor(n,c);
      g.fillStyle=fill;g.globalAlpha=.35;rr(g,x0,y-3,Math.max(0,len),6,3);g.fill();g.globalAlpha=1;
      g.beginPath();g.arc(x0,y,12.5,0,6.283);g.fillStyle=fill;g.shadowColor=fill;g.shadowBlur=(c?18:8)*DPR;g.fill();g.shadowBlur=0;g.fillStyle=ink;g.font='700 13px "Plus Jakarta Sans",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(n.f),x0,y+.5);}
    this.nowLine(g,H,nowX);this.drawPops(g,nowX,n=>ly(n.s)-24);
    if(this.mode==='mic'&&this.heard!=null&&this.running){const p=tabPos(Math.round(this.heard));star(g,nowX,ly(p.s),2.4,.9,.3);}
    if(this.waitFor&&this.running){g.fillStyle='#F2C98A';g.font='600 12px "Plus Jakarta Sans",sans-serif';g.textAlign='left';g.textBaseline='top';g.fillText(`Play fret ${this.waitFor.f} on ${SNAME[this.waitFor.s]} (${midiName(this.waitFor.midi)})`,nowX+10,6);}},
  drawSargam(g,W,H,t){const{gut,nowX,ppb}=this.geom(W),rows=this.max-this.min+1,top=10,rowH=(H-20)/rows,y=s=>top+(this.max-s+.5)*rowH;
    const used=new Set(this.notes.filter(n=>!n.rest).map(n=>((n.semi%12)+12)%12));
    for(let s=this.min;s<=this.max;s++){const pc=((s%12)+12)%12;if(pc===0){g.fillStyle='rgba(242,201,138,.08)';g.fillRect(gut,y(s)-rowH/2,W-gut,rowH);}else if(used.has(pc)){g.fillStyle='rgba(170,205,255,.04)';g.fillRect(gut,y(s)-rowH/2+1,W-gut,rowH-2);}
      if(used.has(pc)||pc===0){g.fillStyle=pc===0?'#F2C98A':'rgba(234,242,255,.6)';g.font=`500 ${clamp(rowH*.42,10,15)}px "Noto Sans Devanagari",sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(DEVA[pc],gut/2,y(s));const oc=Math.floor(s/12);if(oc){g.beginPath();g.arc(gut/2,y(s)+(oc<0?rowH*.32:-rowH*.32),1.5,0,6.283);g.fill();}}}
    this.beatLines(g,W,H,gut,nowX,ppb);const cur=this.current(),h=Math.min(rowH*.7,30);
    for(const n of this.notes){if(n.rest)continue;const x0=nowX+(n.start-this.t)*ppb,w=n.beats*ppb-6;if(x0>W||x0+w<gut)continue;const c=n===cur&&!n.judged,[fill,ink]=this.noteColor(n,c),bx=Math.max(gut,x0),bw=Math.max(4,w-(bx-x0));
      rr(g,bx,y(n.semi)-h/2,bw,h,Math.min(h/2,bw/2));g.fillStyle=fill;g.shadowColor=fill;g.shadowBlur=(c?16:6)*DPR;g.fill();g.shadowBlur=0;
      if(c&&n.frames>0){g.save();rr(g,bx,y(n.semi)-h/2,bw,h,Math.min(h/2,bw/2));g.clip();g.fillStyle='rgba(126,226,168,.8)';g.fillRect(x0,y(n.semi)-h/2,(nowX-x0)*(n.good/n.frames),h);g.restore();}
      if(bw>18&&x0+10>gut){const pc=((n.semi%12)+12)%12;g.fillStyle=ink;g.font=`600 ${clamp(h*.5,10,15)}px "Noto Sans Devanagari",sans-serif`;g.textAlign='left';g.textBaseline='middle';g.fillText(DEVA[pc],Math.max(gut+6,x0+8),y(n.semi)+1);}}
    if(this.mode==='mic'){const ref=(cur||this.notes.find(n=>!n.rest&&n.start>this.t)||{semi:(this.min+this.max)/2}).semi,fold=v=>v+12*Math.round((ref-v)/12);
      g.strokeStyle='#9cc9ff';g.lineWidth=2.5;g.shadowColor='#9cc9ff';g.shadowBlur=8*DPR;g.beginPath();let pen=false;for(const p of this.trail){const x=nowX-(this.t-p.t)*ppb;if(x<gut||p.v==null){pen=false;continue;}const yy=y(clamp(fold(p.v),this.min-.5,this.max+.5));pen?g.lineTo(x,yy):g.moveTo(x,yy);pen=true;}g.stroke();g.shadowBlur=0;}
    this.nowLine(g,H,nowX);this.drawPops(g,nowX,n=>y(n.semi)-h);
    if(this.waitFor&&this.running){const pc=((this.waitFor.semi%12)+12)%12;g.fillStyle='#F2C98A';g.font='600 12px "Plus Jakarta Sans",sans-serif';g.textAlign='left';g.textBaseline='top';g.fillText('Waiting for '+DEVA[pc],nowX+10,6);}},
  drawBols(g,W,H,t){const gut=56,nowX=gut+(W-gut)*.22,ppb=clamp((W-gut)/5.4,46,120),yB=H*.36,yD=H*.68,ly=l=>l==='b'?yB:yD;
    g.fillStyle='rgba(170,205,255,.05)';g.fillRect(gut,yB-20,W-gut,40);g.fillRect(gut,yD-20,W-gut,40);g.fillStyle='rgba(234,242,255,.55)';g.font='600 11px "Plus Jakarta Sans",sans-serif';g.textAlign='left';g.textBaseline='middle';g.fillText('Bayan',10,yB);g.fillText('Dayan',10,yD);
    const T=this.song.taal?TAALS[this.song.taal]:null,starts=[];if(T){let a=0;T.vibhag.forEach((v,i)=>{starts.push([a,T.marks[i]]);a+=v;});}
    for(let b=Math.ceil(this.t-(nowX-gut)/ppb);b<=this.t+(W-nowX)/ppb;b++){const x=nowX+(b-this.t)*ppb;if(x<gut||b<0)continue;let mk=null;if(T){const m=((b%T.matras)+T.matras)%T.matras,s=starts.find(st=>st[0]===m);if(s)mk=s[1];}
      g.fillStyle=mk==='X'?'rgba(242,201,138,.4)':mk?'rgba(170,205,255,.16)':'rgba(170,205,255,.05)';g.fillRect(x,16,mk?2:1,H-24);if(mk){g.fillStyle=mk==='X'?'#F2C98A':'rgba(234,242,255,.6)';g.font='700 11px "Plus Jakarta Sans",sans-serif';g.textAlign='center';g.fillText(mk,x,9);}}
    for(const n of this.notes){if(n.rest)continue;const x=nowX+(n.start-this.t)*ppb;if(x<gut-20||x>W+20)continue;const[fill,ink]=this.noteColor(n,false);
      if(n.lanes.length===2){g.strokeStyle=fill;g.lineWidth=2;g.beginPath();g.moveTo(x,yB);g.lineTo(x,yD);g.stroke();}
      n.lanes.forEach(l=>{g.beginPath();g.arc(x,ly(l),14,0,6.283);g.fillStyle=fill;g.shadowColor=fill;g.shadowBlur=8*DPR;g.fill();g.shadowBlur=0;});
      g.fillStyle=n.state==='miss'?'#FF8A8A':'rgba(234,242,255,.85)';g.font='600 12px "Plus Jakarta Sans",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(n.bol,x,n.lanes.length===2?(yB+yD)/2:ly(n.lanes[0])+(n.lanes[0]==='b'?-27:27));}
    this.nowLine(g,H,nowX);this.drawPops(g,nowX,n=>ly(n.lanes[0]||'d')-28);},
  drawPops(g,nowX,yOf){const tt=now();for(const p of this.pops){const a=1-(tt-p.t)/.7;if(a<=0)continue;g.globalAlpha=a;g.fillStyle=p.txt==='Miss'?'#FF8A8A':p.txt==='Perfect'?'#7EE2A8':'#F2C98A';g.font='22px "Petaluma Script",cursive';g.textAlign='center';g.textBaseline='middle';g.fillText(p.txt,nowX,yOf(p.n)-(1-a)*14);g.globalAlpha=1;}}};
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function click(t,accent){if(!ready())return;const o=ctx.createOscillator();o.frequency.value=accent?1500:1050;const g=ctx.createGain();g.gain.setValueAtTime(.08,t);g.gain.exponentialRampToValueAtTime(.0005,t+.05);o.connect(g).connect(master);o.start(t);o.stop(t+.06);}
function sheet(html){closeSheet();const w=document.createElement('div');w.className='sheet-wrap';w.id='sheet';w.innerHTML=`<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;SCREEN.appendChild(w);}
function closeSheet(){$('#sheet')?.remove();}
addEventListener('keydown',e=>{if(!$('#player')||e.metaKey||e.ctrlKey)return;const k=e.key.toLowerCase();
  if(e.key===' '){e.preventDefault();if(!e.repeat)$('#plPlay').click();return;}if(e.key==='Escape'){Player.close();return;}if(e.repeat)return;
  if(Player.kind==='bols'){if(k==='f')Player.tap({lane:'b'});if(k==='j')Player.tap({lane:'d'});return;}
  if(Player.mode!=='tap')return;if(Player.kind==='tab'&&(k==='j'||k==='enter'))Player.tap({any:true});
  if(Player.kind==='sargam'&&/^[1-9]$/.test(k)){const b=$$('#plPad [data-s]')[+k-1];if(b)Player.tap({semi:+b.dataset.s,btn:b});}});

/* ================= scenes ================= */
let pickerOpen=false;
function showScene(id){['landing','picker','home'].forEach(s=>{const el=$('#'+s);el.hidden=s!==id;el.classList.remove('enter','leave');});const el=$('#'+id);void el.offsetWidth;el.classList.add('enter');pickerOpen=id==='picker';}
function openPicker(){const L=Landing;$('#begin').classList.add('lit');ghostStrum(L,{x:L.W*.7,y:L.strings[0].a.y-18},{x:L.W*.74,y:L.strings[5].a.y+18},.34,.4);
  setTimeout(()=>$('#landing').classList.add('leave'),380);setTimeout(()=>{showScene('picker');Car.previewed=-1;Car.settledAt=now();const i=ORDER.indexOf(S.inst);requestAnimationFrame(()=>{Car.layout();if(i>0){Car.i=-1;Car.go(i);Car.pos=Car.target;}});},980);}
function openHome(key){S.inst=key;saveS();showScene('home');renderHome();$('#hscroll').scrollTop=0;}
$('#begin').onclick=openPicker;$('#back').onclick=()=>{showScene('landing');requestAnimationFrame(()=>Landing.layout());};$('#hback').onclick=()=>{showScene('picker');requestAnimationFrame(()=>Car.layout());};
$('#sound').onclick=()=>{ac();setTimeout(()=>{if(!ready())toast('Sound is blocked here. Check volume or silent mode.');},600);};
$('#choose').onclick=()=>openHome(ORDER[Car.i]);
let toastT;function toast(m){$('.toast')?.remove();const t=document.createElement('div');t.className='toast';t.textContent=m;SCREEN.appendChild(t);clearTimeout(toastT);toastT=setTimeout(()=>t.remove(),2600);}

/* ================= loop + layout ================= */
let last=now();
function loop(){const t=now();last=t;runGhosts(t);Sky.draw(t);
  if(!$('#landing').hidden)Landing.draw(t);if(!$('#picker').hidden){Car.update(Math.min(.05,t-(loop.p||t)));Car.draw(t);}if(!$('#home').hidden&&!$('#player'))drawHero(t);
  if($('#player')){Player.frame(t);Player.draw(t);}loop.p=t;requestAnimationFrame(loop);}
function layout(){const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone,framed=!standalone&&innerWidth>=640&&innerHeight>=560;
  document.documentElement.classList.toggle('framed',framed);$('.device').style.setProperty('--s',framed?Math.min(1,(innerHeight-28)/868,(innerWidth-28)/414):1);
  Landing.layout();if(!$('#picker').hidden)Car.layout();}
addEventListener('resize',layout);
const clockF=()=>{$('#sbTime').textContent=new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}).replace(/\s?[ap]m/i,'');};clockF();setInterval(clockF,15000);
Sky.init();loadSamples();Car.build();layout();Car.go(0);Car.cards[0].el.classList.add('active');
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{Landing.layout();Car.cards.forEach(c=>{c.W=0;});});
try{if(!window.FretopiaNative&&'serviceWorker' in navigator&&(['localhost','127.0.0.1'].includes(location.hostname)||(location.protocol==='https:'&&window.top===window&&!location.hostname.endsWith('claude.ai'))))navigator.serviceWorker.register('sw.js').catch(()=>{});}catch(e){}
requestAnimationFrame(loop);
