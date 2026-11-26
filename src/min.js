/* ================= minimal look ================= */
try{Object.defineProperty(CanvasRenderingContext2D.prototype,'shadowBlur',{set(){},get(){return 0},configurable:true});}catch(e){}
const Sky={off:0,init(){},draw(){}};
const DEVAF="'Kohinoor Devanagari','Noto Sans Devanagari','Devanagari Sangam MN',Inter,sans-serif",INKC='#111113',ACC='#E8572A',GOOD='#1F9D55',BAD='#E5484D',FONT='Inter,system-ui,-apple-system,sans-serif';

/* ================= strings: small, realistic motion that flows ================= */
/* Real strings barely move: a hard strum is a couple of pixels, seen as a soft blur.
   Each pluck starts at the finger and spreads along the string; a strum rolls from one string
   to the next (a few tens of ms apart), and a little energy leaks to the neighbouring strings. */
const AMPK=.48;
VString.prototype.excite=function(amp,s,vel,delay){s=clamp(s,.04,.96);this.modes=[];this.ph=[];
  for(let n=1;n<=4;n++){this.modes.push(2*amp*Math.sin(n*Math.PI*s)/(n*n*Math.PI*Math.PI*s*(1-s)));this.ph.push(Math.random()*6.283);}
  this.t0=now()+delay;this.s0=s;this.amp=Math.abs(amp);this.tn=(.22+this.gauge*.36)*(.75+.45*vel);this.tEnd=this.tn*Math.log(Math.max(1.2,this.amp/.06));this.fvj=(4.2+(1-this.gauge)*4.6)*(.95+Math.random()*.1);};
VString.prototype.mask=function(s,dt){const k=clamp((dt/.18-Math.abs(s-this.s0))/.22,0,1);return k*k*(3-2*k);};
VString.prototype.envAt=function(n,dt){const f=dt>this.tEnd-.2?Math.max(0,(this.tEnd-dt)/.2):1;return Math.exp(-dt/this.tn*(1+1.5*(n-1)))*f;};
VString.prototype.disp=function(s,t){let d=0;const dt=t-this.t0,M=this.modes;
  if(M.length&&dt>0&&dt<this.tEnd){const m=this.mask(s,dt);if(m>0){let v=0;for(let n=1;n<=M.length;n++)v+=M[n-1]*this.envAt(n,dt)*Math.sin(n*Math.PI*s)*Math.cos(6.2832*this.fvj*n*dt+this.ph[n-1]);d=v*m;}}
  if(this.held){const p=this.bendP;d+=this.bend*(s<p?s/p:(1-s)/(1-p));}return d;};
VString.prototype.spread=function(s,t){const dt=t-this.t0,M=this.modes;if(!M.length||dt<=0||dt>this.tEnd)return 0;const m=this.mask(s,dt);if(!m)return 0;let e=0;for(let n=1;n<=M.length;n++)e+=Math.abs(M[n-1]*this.envAt(n,dt)*Math.sin(n*Math.PI*s));return e*m;};
VString.prototype.energy=function(t){const dt=t-this.t0,v=this.modes.length&&dt>0&&dt<this.tEnd?Math.min(1,this.amp/2)*this.envAt(1,dt):0;return Math.max(this.held?Math.min(1,Math.abs(this.bend)/6):0,v);};
VString.prototype.pluck=function(amp,s,vel,delay=0){amp*=(.85+Math.random()*.3)*AMPK;this.excite(amp,s,vel,delay);playString(this,vel,clamp(s,.04,.96),delay);
  const o=this.owner,tn=now();if(o&&o.strings)o.strings.forEach(x=>{const d=Math.abs(x.idx-this.idx);if(x!==this&&d<=2&&!x.held&&tn-x.t0>.6&&x.energy(tn)<.05)x.excite(amp*(d===1?.14:.06),.5,.25,delay+.08*d);});
  if(o&&o.onPluck)o.onPluck(this,vel);if(vel>.55)buzz(4);};
VString.prototype.draw=function(g,t){const N=80,e=this.energy(t),X=(s,d)=>this.a.x+this.u.x*this.len*s+this.n.x*d,Y=(s,d)=>this.a.y+this.u.y*this.len*s+this.n.y*d;
  if(e>.003){g.beginPath();for(let i=0;i<=N;i++){const s=i/N,v=this.spread(s,t);i?g.lineTo(X(s,v),Y(s,v)):g.moveTo(X(s,v),Y(s,v));}
    for(let i=N;i>=0;i--){const s=i/N;g.lineTo(X(s,-this.spread(s,t)),Y(s,-this.spread(s,t)));}g.closePath();g.fillStyle=`rgba(17,17,19,${.06+.08*e})`;g.fill();}
  g.beginPath();for(let i=0;i<=N;i++){const s=i/N,v=this.disp(s,t);i?g.lineTo(X(s,v),Y(s,v)):g.moveTo(X(s,v),Y(s,v));}
  g.lineCap='round';g.lineWidth=this.w;g.strokeStyle=this.wound?'#46423D':'#85878C';g.stroke();
  if(this.wound&&this.w>1.3){g.setLineDash([.7,1.5]);g.strokeStyle='rgba(255,255,255,.32)';g.lineWidth=this.w*.78;g.stroke();g.setLineDash([]);}};
/* a strum rolls across the strings: successive strings sound at least a few tens of ms apart (slower stroke, wider roll) */
function strum(strings,p0,p1,dt,push,velOverride){const speed=Math.hypot(p1.x-p0.x,p1.y-p0.y)/Math.max(1,dt),hits=[];
  for(const st of strings){const L1=st.local(p1),L0=st.local(p0),v=velOverride??vel(speed);
    if(L1.s<-.01||L1.s>1.01){if(st.held){st.held=false;st.pluck(strikeAmp(st,.25)*Math.sign(st.bend),st.bendP,.25);}st.side=0;continue;}
    const sd=Math.sign(L1.d)||st.side||1;if(!st.side){st.side=Math.sign(L0.d)||sd;if(st.side===sd)continue;}
    if(!st.held){if(sd!==st.side){if(Math.abs(L1.d)<push&&speed<.4){st.held=true;st.bend=L1.d;st.bendP=clamp(L1.s,.06,.94);st.touch();}
        else{const f=L0.d!==L1.d?clamp(L0.d/(L0.d-L1.d),0,1):0;hits.push({st,amp:strikeAmp(st,v)*sd,s:lerp(L0.s,L1.s,f),v,at:f*dt/1000});st.side=sd;}}}
    else{st.bend=clamp(L1.d,-push,push);st.bendP=clamp(L1.s,.06,.94);if(sd===st.side){st.held=false;st.bend=0;}
      else if(Math.abs(L1.d)>=push){st.held=false;st.bend=0;const sv=Math.max(.2,v);hits.push({st,amp:strikeAmp(st,sv)*.8*sd,s:L1.s,v:sv,at:0});st.side=sd;}}}
  if(!hits.length)return;hits.sort((a,b)=>a.at-b.at);const o=strings[0].owner||strings,base=now(),gap=clamp(.046-speed*.012,.018,.046);let prev=o._lastOn??-9;
  for(const h of hits){let ta=base+h.at;if(ta-prev<gap&&ta-prev>-.3)ta=prev+gap;prev=ta;h.st.pluck(h.amp,h.s,h.v,Math.max(0,ta-base));}o._lastOn=prev;}

/* instrument tweaks for the ink look */
I.bansuri.draw=function(g,t,glow){g.globalAlpha=.42+.58*glow;g.drawImage(this.base,0,0,this.W,this.H);g.globalAlpha=1;const playing=Object.values(this.voice),gap=this.holes[0].y-this.holes[1].y;
  this.holes.forEach(h=>{if(playing.some(v=>Math.abs(v.y-h.y)<gap*.5))h.lit=t;const f=Math.max(0,1-(t-h.lit)/.45);if(f>0){g.globalAlpha=f;g.fillStyle=ACC;g.beginPath();g.ellipse(this.cx,h.y,this.hw*.46,this.hw*.4,0,0,6.283);g.fill();g.globalAlpha=1;}});};

/* ================= landing ================= */
const Landing={strings:[],parts:[],push:3,plucks:0,ptr:null,W:0,H:0,
  layout(){const c=$('#lc'),W=c.clientWidth,H=c.clientHeight;if(!W)return;this.W=W;this.H=H;
    const gap=this.gap=clamp(W*.046,15,19),br=$('#brand'),bh=br.offsetHeight||44,top=Math.round(H*.43-(bh+40+5*gap)/2);
    br.style.top=top+'px';const y0=this.top=top+bh+40;this.bot=y0+5*gap;$('#hint').style.top=(this.bot+28)+'px';
    this.strings=GTR.map((n,i)=>{const gauge=1-i/5,s=new VString({sample:n,kind:'guitar',freq:[98,123.47,146.83,196,246.94,392][i],gauge,w:.7+gauge*1.5,pan:(i-2.5)*.08,owner:this,idx:i,wound:i<4});s.setLine(-2,y0+i*gap,W+2,y0+i*gap);return s;});},
  onPluck(){this.plucks++;if(this.plucks===1&&soundOn())$('#hint').style.opacity=0;},
  checkSound(){setTimeout(()=>{const h=$('#hint');if(soundOn()){if(this.plucks)h.style.opacity=0;return;}h.textContent='Tap for sound';h.classList.add('ask');h.style.opacity=1;},150);},
  draw(t){const f=fitCanvas($('#lc'));if(!f)return;const{g,W,H}=f;if(!this.strings.length||this.W!==W||this.H!==H)this.layout();g.clearRect(0,0,W,H);this.strings.forEach(st=>st.draw(g,t));}};
(function wireLanding(){const c=$('#lc');const pt=e=>{const r=c.getBoundingClientRect(),k=r.width/c.clientWidth;return{x:(e.clientX-r.left)/k,y:(e.clientY-r.top)/k,t:performance.now()};};
  c.addEventListener('pointerdown',e=>{const p=pt(e);Landing.ptr=p;Landing.strings.forEach(st=>{st.side=Math.sign(st.local(p).d)||1;});tapString(Landing.strings,p,6);try{c.setPointerCapture(e.pointerId);}catch(_){}});
  c.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'&&!e.buttons){Landing.ptr=null;return;}const evs=e.getCoalescedEvents?e.getCoalescedEvents():[];for(const ev of (evs.length?evs:[e])){const p=pt(ev),p0=Landing.ptr||p;strum(Landing.strings,p0,p,p.t-(p0.t||p.t),Landing.push);Landing.ptr=p;}});
  ['pointerup','pointercancel'].forEach(ev=>c.addEventListener(ev,e=>{Landing.checkSound();if(e.pointerType!=='mouse'){releaseAll(Landing.strings);Landing.ptr=null;}}));
  c.addEventListener('pointerleave',()=>{releaseAll(Landing.strings);Landing.ptr=null;});})();

/* ================= icons ================= */
const IC={play:'<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',pause:'<svg viewBox="0 0 24 24"><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" fill="currentColor"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="17.5" r=".9" fill="currentColor"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  ear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  restart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4.5H9"/></svg>'};
const starStr2=n=>[0,1,2].map(i=>`<span class="${i<n?'':'off'}">★</span>`).join('');
const LVL=['','Easy','Medium','Hard'];

/* ================= instrument home ================= */
const sk=s=>(S.inst||'guitar')+':'+s.id,starsOf=s=>S.stars[sk(s)]||0;
const COLLS={guitar:['all','drill','chords','classical','folk','kids','festive','indian','raag','mine'],melodic:['all','drill','raag','indian','classical','folk','kids','festive','mine'],tabla:['all','drill','taal']};
const COLL_NAME={all:'All',drill:'Technique',classical:'Classical',folk:'Folk',kids:'Rhymes',festive:'Festive',indian:'Indian',raag:'Raag',mine:'My songs',taal:'Taals',chords:'Chords'};
const HV={q:'',lc:'all',sc:'all',sq:'',tab:null};let HOME={cat:[],list:[]};
const ICS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
/* what's under each tab: lessons build skills, songs are things to play */
const LEARN_C={guitar:['all','drill','chords','raag'],melodic:['all','drill','raag'],tabla:['all','drill','taal']},SONG_C=['all','indian','classical','folk','kids','festive','mine'];
const HICON={plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'};
function homeTabs(fam){const t=[['learn','Learn']];if(fam!=='tabla')t.push(['songs','Songs'],['create','Create']);t.push(['chal','Challenges']);return t;}
function renderHome(){const key=S.inst||'guitar',fam=famOf(key),inst=I[key],cat=catalog(fam);HOME={fam,cat,list:cat};
  const hs=$('#hStars');hs.innerHTML=riyazChip();$('#hRiyaz').onclick=openRiyaz;const st=Game.streak();if(renderHome.shown!=null&&st>renderHome.shown)requestAnimationFrame(()=>refreshChip(true));renderHome.shown=st;
  const tabs=homeTabs(fam);if(!HV.tab)HV.tab=goalTab();if(!tabs.some(x=>x[0]===HV.tab))HV.tab='learn';
  $('#hscroll').innerHTML=`<header class="h-head"><h1>${inst.name}</h1><p><span class="hi">${inst.hi}</span> · ${SA_NAME[key]}</p></header>
    <div class="chips tabs" id="htabs" role="tablist">${tabs.map(([k,l])=>`<button class="opt" role="tab" data-tab="${k}" aria-pressed="${HV.tab===k}" aria-selected="${HV.tab===k}">${l}</button>`).join('')}</div><div id="ptab"></div>`;
  $('#htabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b||b.dataset.tab===HV.tab)return;HV.tab=b.dataset.tab;renderHome();$('#hscroll').scrollTop=0;});
  const box=$('#ptab');({learn:renderLearn,songs:renderSongs,create:renderCreate,chal:b=>renderChallenges(b,fam)})[HV.tab](box,fam);}
const ALL_ORDER=['kids','folk','festive','classical','indian','mine','chords','taal','drill','raag'];
function songRow(s){const st=starsOf(s);return `<button class="row" data-song="${s.id}"><span class="t"><b>${s.title}</b><small>${s.sub} · ${fmtDur(songSecs(s))}</small></span>${st?`<span class="r st">${starStr2(st)}</span>`:`<span class="r">${LVL[s.lvl]||''}</span>`}</button>`;}
/* a searchable list of one tab's collections */
function libBlock(box,{colls,ck,qk,place,empty,search=true}){const avail=colls.filter(c=>c==='all'||c==='mine'||HOME.cat.some(s=>s.coll===c));if(!avail.includes(HV[ck]))HV[ck]='all';
  const pool=HOME.cat.filter(s=>avail.includes(s.coll));
  box.insertAdjacentHTML('beforeend',`${search?searchBox(place(pool.length),HV[qk]):''}
    <div class="chips lc">${avail.map(c=>`<button class="opt" data-coll="${c}" aria-pressed="${c===HV[ck]}">${COLL_NAME[c]}</button>`).join('')}</div><div class="list lsongs"></div>`);
  const list=box.querySelector('.lsongs');
  const fill=()=>{let L=pool.filter(s=>HV[ck]==='all'||s.coll===HV[ck]);if(HV[ck]==='all')L=L.map((s,i)=>[s,i]).sort((x,y)=>(ALL_ORDER.indexOf(x[0].coll)-ALL_ORDER.indexOf(y[0].coll))||x[1]-y[1]).map(x=>x[0]);
    const q=(HV[qk]||'').trim().toLowerCase();if(q)L=L.filter(s=>(s.title+' '+(s.sub||'')+' '+(COLL_NAME[s.coll]||'')).toLowerCase().includes(q));HOME.list=L;
    list.innerHTML=L.length?L.map(songRow).join(''):`<p class="empty">${empty(q)}</p>`;};
  fill();if(search)box.querySelector('.lq').addEventListener('input',e=>{HV[qk]=e.target.value;fill();});
  box.querySelector('.lc').addEventListener('click',e=>{const b=e.target.closest('[data-coll]');if(!b)return;HV[ck]=b.dataset.coll;box.querySelectorAll('.lc .opt').forEach(x=>x.setAttribute('aria-pressed',x===b));fill();});return fill;}
function searchBox(place,val){return `<label class="search">${ICS}<input class="lq" type="search" inputmode="search" autocomplete="off" placeholder="${place}" value="${(val||'').replace(/"/g,'&quot;')}"></label>`;}
function renderLearn(box,fam){const colls=LEARN_C[fam],pool=HOME.cat.filter(s=>colls.includes(s.coll));
  const next=pool.find(s=>s.coll==='drill'&&!starsOf(s))||pool.find(s=>!starsOf(s))||pool.find(s=>starsOf(s)<3)||pool[0];HOME.next=next;
  box.innerHTML=next?`<button class="next" data-song="${next.id}"><span class="eyebrow">Up next</span><b>${next.title}</b><span class="meta">${next.sub} · ${fmtDur(songSecs(next))}</span><span class="go">${IC.play}</span></button><h3 class="sh">All lessons</h3>`:'';
  libBlock(box,{colls,ck:'lc',qk:'q',place:n=>`Search ${n} lessons`,empty:()=>'No lessons match.'});}
function renderSongs(box,fam){const opts={colls:SONG_C,ck:'sc',qk:'sq',place:n=>`Search ${n} songs`,empty:q=>HV.sc==='mine'&&!q?'Songs you add in Create show up here.':'No songs match.'};
  if(fam!=='guitar'){box.innerHTML='';libBlock(box,opts);return;}
  box.innerHTML=searchBox('Search songs and artists',HV.sq)+'<div class="ptop"></div><h3 class="sh">Tunes to play</h3><p class="shsub">Melodies and chord songs the app plays with you</p><div class="ltunes"></div>';
  const top=box.querySelector('.ptop');Parts.songsTop(top);const fill=libBlock(box.querySelector('.ltunes'),{...opts,search:false,empty:q=>q?'No tunes match.':opts.empty(q)});
  box.querySelector('.lq').addEventListener('input',e=>{HV.sq=e.target.value;Parts.songsTop(top);fill();});}
function renderCreate(box,fam){if(fam==='guitar')return Parts.renderCreate(box);
  const mine=HOME.cat.filter(s=>s.coll==='mine');
  box.innerHTML=`<button class="next" id="impBig"><span class="eyebrow">Add a song</span><b>Import a MIDI file</b><span class="meta">Its melody becomes a song you can play along to</span><span class="go">${HICON.plus}</span></button>
    <input type="file" id="impf" accept=".mid,.midi,audio/midi,audio/x-midi" hidden>
    <h3 class="sh">My songs</h3><div class="list">${mine.map(songRow).join('')||'<p class="empty">Songs you import show up here.</p>'}</div>
    <p class="fine">Imported songs stay on this phone. Use files you have the rights to.<br>Writing chords and tabs for YouTube songs is on guitar for now.</p>`;
  HOME.list=mine;$('#impBig').onclick=()=>$('#impf').click();$('#impf').onchange=e=>importMidi(e.target.files[0]);}
async function importMidi(f){if(!f)return;try{const r=parseMidi(await f.arrayBuffer());const title=f.name.replace(/\.(mid|midi)$/i,'').replace(/[_-]+/g,' ').trim()||'My song';
    const mine=userSongs();mine.push({id:'u'+Date.now().toString(36),title,by:'Imported',coll:'mine',lvl:2,bpm:clamp(r.bpm,40,200),notes:r.notes});localStorage.setItem('fretopia.mysongs',JSON.stringify(mine));
    buildLibrary();HV.sc='mine';HV.sq='';renderHome();toast('Added “'+title+'”. Find it in Songs.');}catch(e){toast('Not a MIDI file');}}
$('#hscroll').addEventListener('click',e=>{const b=e.target.closest('[data-song]');if(!b)return;const pool=b.classList.contains('next')?HOME.cat:HOME.list,s=pool.find(x=>x.id===b.dataset.song);if(s)Player.open(s,pool);});
function parseSong(song){if(song.part)return Parts.notes(song.part);let t=0;const out=[];
  if(song.kind==='bols'){let seq=[],dur=1;if(song.bols)seq=song.bols.split(/\s+/);else{const T=TAALS[song.taal];for(let r=0;r<song.cycles*(song.dugun?2:1);r++)seq.push(...T.bols);dur=song.dugun?.5:1;}
    seq.forEach(b=>{out.push({bol:b,rest:b==='_',start:t,beats:dur,lanes:bolLanes(b)});t+=dur;});return{notes:out,total:t};}
  if(song.kind==='chords'){for(const tok of song.chords.trim().split(/\s+/)){let[nm,du]=tok.split(':');const beats=du?parseFloat(du):1,shape=CHORD_SHAPES[nm]||[];out.push({chord:nm,shape,midis:shape.map((f,i)=>f<0?null:OPEN[i]+f).filter(x=>x!=null),start:t,beats});t+=beats;}return{notes:out,total:t};}
  if(song.kind==='sargam'||song.lib){const p=libParse(song.notes);if(song.kind==='tab')p.notes.forEach(n=>{if(n.rest)return;const m=song.base+n.semi;Object.assign(n,{midi:m},tabPos(m));});return p;}
  for(const tok of song.notes.trim().split(/\s+/)){let[nm,du]=tok.split(':');const beats=du?parseFloat(du):1;if(nm==='_'){out.push({rest:true,start:t,beats});t+=beats;continue;}const midi=nameMidi(nm);out.push({midi,...tabPos(midi),start:t,beats});t+=beats;}
  return{notes:out,total:t};}
function bolLanes(b){b=b.toLowerCase();if(b==='_')return[];if(['na','ta','tin','ti','te','tun','tu','ra','tirakita','tete'].includes(b))return['d'];if(['ge','ghe','ke','ka','kat','ga'].includes(b))return['b'];return['b','d'];}

const FLAT_MAX={tab:.08,chords:.08,sargam:.15},MUTED_MAX=.08;
/* ================= orientation for play-along =================
   frame: laptop phone frame (the frame itself turns sideways); land: the screen is already landscape;
   rot: a phone held upright (the player is drawn rotated so turning the phone shows it upright); port: anything else */
const Orient={
  mode(){if(document.documentElement.classList.contains('framed'))return'frame';const W=SCREEN.clientWidth,H=SCREEN.clientHeight;if(W>H)return'land';
    return matchMedia('(pointer:coarse)').matches?'rot':'port';},
  size(){SCREEN.style.setProperty('--pw',SCREEN.clientWidth+'px');SCREEN.style.setProperty('--ph',SCREEN.clientHeight+'px');},
  k(){return SCREEN.clientWidth/SCREEN.clientHeight;},
  turnDevice(on,D=0,E='ease'){const dev=$('.device'),s=parseFloat(getComputedStyle(dev).getPropertyValue('--s'))||1,root=document.documentElement;
    const from=dev.style.transform||`scale(${s})`;let to=`scale(${s})`;
    if(on){dev.style.transform='';const r=dev.getBoundingClientRect(),dx=innerWidth/2-(r.left+r.width/2),dy=innerHeight/2-(r.top+r.height/2),sl=Math.min(1,(innerWidth-40)/868,(innerHeight-40)/414);to=`translate(${dx}px,${dy}px) scale(${sl}) rotate(-90deg)`;}
    root.classList.toggle('devland',on);if(D)dev.animate([{transform:from},{transform:to}],{duration:D,easing:E});dev.style.transform=on?to:'';},
  release(){if(document.documentElement.classList.contains('devland'))this.turnDevice(false,0);if(this.locked){this.locked=false;try{screen.orientation.unlock();}catch(e){}try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}}}};
addEventListener('resize',()=>{if($('#player')&&Player.om&&!Player.entering)Player.reorient();});

/* ================= play-along ================= */
const Player={open(song,list,o){const cont=!!$('#player');if(cont)this.close(true,true);ac();this.part=song.part||null;this.challenge=(o&&o.challenge)||null;this.song=song;this.list=list||HOME.list;this.key=S.inst||'guitar';this.kind=song.kind;const p=parseSong(song);this.notes=p.notes;this.total=p.total;this.bpm=song.bpm;this.speed=1;
    if(this.kind==='sargam'){const s=this.notes.filter(n=>!n.rest).map(n=>n.semi);this.min=Math.min(...s)-1;this.max=Math.max(...s)+1;}
    const micOK=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)&&window.isSecureContext;this.mode=S.input||(micOK?'mic':'tap');this.wait=this.kind!=='bols';this.guide=false;if(this.part&&!this.challenge){this.mode='off';this.wait=false;}if(this.challenge)this.wait=false;Ear.want.chroma=this.kind==='chords';
    const el=document.createElement('section');el.className='player';el.id='player';
    el.innerHTML=`<div class="pl-top"><button class="ib" id="plX" aria-label="Close">${IC.x}</button><div class="pl-title"><b>${song.title}</b><small>${I[this.key].name}</small></div><span></span></div>
      <div class="pl-prog"><i id="plProg"></i></div>
      <div class="pl-meta"><span>Accuracy <b id="plAcc">–</b></span><span>${this.kind==='bols'?'Bols':this.kind==='chords'?'Chords':'Notes'} <b id="plCount">0/${this.notes.filter(n=>!n.rest).length}</b></span></div>
      <div class="pl-stage"><canvas id="plCv"></canvas><div class="pl-msg" id="plMsg" hidden></div></div>
      <div class="pl-ctrl"><button class="round" id="plListen" aria-label="Hear it first">${IC.ear}</button><button class="round big" id="plPlay" aria-label="Play">${IC.play}</button><button class="round" id="plRestart" aria-label="Restart">${IC.restart}</button>${Parts.recBtn()}</div>
      <div class="opts" id="plOpts"></div><div class="pad-area" id="plPad"></div>`;
    SCREEN.appendChild(el);if(this.part)Parts.decorate(this,el);if(this.challenge)Parts.chDecorate(this,el);this.wire();this.opts();this.pad();this.reset();;this.enter(cont)},
  close(silent,instant){this.pause();if(this.part)Parts.onClose(this);else Clip.stop();this.flushTime();this.elapsed=0;Mic.stop();closeSheet();const el=$('#player');if(!el)return;el.id='';
    const done=()=>{el.remove();if(!instant){$('.pl-back')?.remove();Orient.release();}if(!silent)renderHome();};
    if(instant){done();return;}this.leave(el,done);},
  /* ---------- landscape: rotate in, rotate out ---------- */
  enter(cont){const el=$('#player'),m=Orient.mode();
    /* Android: go full screen and lock to landscape for real; iPhone can't, so the player is drawn rotated */
    if(m==='rot'&&!cont&&document.fullscreenEnabled&&screen.orientation&&screen.orientation.lock&&!/iPhone|iPad|iPod/.test(navigator.userAgent)){
      this.entering=true;el.style.opacity='0';let fs;try{fs=document.documentElement.requestFullscreen({navigationUI:'hide'});}catch(e){fs=Promise.reject(e);}
      const fallback=()=>{this.entering=false;el.style.opacity='';try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}this.enter2(el,Orient.mode(),false);};
      fs.then(()=>screen.orientation.lock('landscape')).then(()=>{Orient.locked=true;let n=0;const wait=()=>{if(Orient.mode()==='land'||n++>40){this.entering=false;el.style.opacity='';this.enter2(el,Orient.mode(),false);}else setTimeout(wait,25);};wait();}).catch(fallback);return;}
    this.enter2(el,m,cont);},
  enter2(el,m,cont){this.om=m;Orient.size();
    if(!$('.pl-back')){const b=document.createElement('div');b.className='pl-back';SCREEN.insertBefore(b,el);b.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'});}
    if(m==='port'){if(cont)el.style.animation='none';return;}el.classList.add('land');if(m==='rot'||m==='frame')el.classList.add('rot');
    if(cont){el.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'});return;}
    if(m==='land'){el.animate([{opacity:0,transform:'translateY(16px) scale(.985)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});return;}
    const k=Orient.k(),E='cubic-bezier(.3,.9,.18,1)',D=880;
    el.animate([{transform:`translate(-50%,-50%) rotate(0deg) scale(${k*.94})`,opacity:0,borderRadius:'28px',boxShadow:'0 30px 80px rgba(17,17,19,.22)'},{transform:`translate(-50%,-50%) rotate(0deg) scale(${k})`,opacity:1,borderRadius:'22px',boxShadow:'0 30px 80px rgba(17,17,19,.22)',offset:.16},{transform:'translate(-50%,-50%) rotate(90deg) scale(1)',opacity:1,borderRadius:'0px',boxShadow:'0 0 0 rgba(17,17,19,0)'}],{duration:D,easing:E});
    if(m==='frame')Orient.turnDevice(true,D,E);
    else{const t=document.createElement('div');t.className='turn';t.innerHTML='<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>Turn your phone</div>';
      setTimeout(()=>{if(!el.isConnected||Orient.mode()!=='rot')return;el.appendChild(t);t.animate([{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'none'}],{duration:280,easing:'ease-out'});
        setTimeout(()=>{const a=t.animate([{opacity:1},{opacity:0}],{duration:360,easing:'ease-in'});a.onfinish=()=>t.remove();},1900);},D-120);}},
  leave(el,done){const m=this.om,back=$('.pl-back');if(back){const a=back.animate([{opacity:1},{opacity:0}],{duration:420,delay:m==='rot'||m==='frame'?380:120,easing:'ease-in',fill:'forwards'});}
    if(m==='rot'||m==='frame'){const k=Orient.k(),E='cubic-bezier(.5,0,.25,1)',D=700;
      const a=el.animate([{transform:'translate(-50%,-50%) rotate(90deg) scale(1)',opacity:1,borderRadius:'0px'},{transform:`translate(-50%,-50%) rotate(0deg) scale(${k})`,opacity:1,borderRadius:'22px',offset:.82},{transform:`translate(-50%,-50%) rotate(0deg) scale(${k*.94})`,opacity:0,borderRadius:'28px'}],{duration:D,easing:E,fill:'forwards'});
      if(m==='frame')Orient.turnDevice(false,D,E);a.onfinish=done;return;}
    const a=el.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(12px)'}],{duration:240,easing:'ease-in',fill:'forwards'});a.onfinish=done;},
  /* the phone turned (or the window changed) while playing */
  reorient(){const el=$('#player');if(!el)return;const m=Orient.mode();Orient.size();if(m===this.om){if(m==='frame')Orient.turnDevice(true,0);return;}
    const prev=this.om;this.om=m;el.querySelector('.turn')?.remove();const swap=()=>{el.classList.toggle('land',m!=='port');el.classList.toggle('rot',m==='rot'||m==='frame');if(m==='frame')Orient.turnDevice(true,0);else if(prev==='frame')Orient.turnDevice(false,0);};
    const a=el.animate([{opacity:1},{opacity:0}],{duration:120,easing:'ease-in'});a.onfinish=()=>{swap();el.animate([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});};},
  wire(){$('#plX').onclick=()=>this.close();$('#plPlay').onclick=()=>{if(this.running&&this.listen){this.pause();this.reset();}this.start(false);};
    $('#plListen').onclick=()=>{const was=this.running&&this.listen;this.pause();this.reset();if(!was)this.start(true);};
    $('#plRestart').onclick=()=>{const was=this.running&&!this.listen;this.pause();this.reset();if(was)this.start(false);};
    $('#plRec').onclick=()=>Clip.on?Clip.stop():Clip.start();
    $('#plOpts').onclick=e=>{const b=e.target.closest('[data-c]');if(!b)return;const c=b.dataset.c;if(this.part&&!this.challenge&&Parts.optClick(this,c))return;
      if(c==='mic'){this.mode='mic';S.input='mic';saveS();Mic.start().then(ok=>{if(!ok){this.mode='tap';this.msg(micWhy());}else this.msg('Listening');this.opts();this.pad();});}
      if(c==='tap'){this.mode='tap';S.input='tap';saveS();Mic.stop();}if(c==='wait')this.wait=!this.wait;if(c==='guide')this.guide=!this.guide;if(c==='speed')this.speed=this.speed===1?.75:this.speed===.75?.5:1;this.opts();this.pad();this.hud();};
    $('.pl-stage').addEventListener('pointerdown',e=>{if((this.kind==='tab'||this.kind==='chords')&&this.mode==='tap'){e.preventDefault();this.tap({any:true});}});},
  opts(){if(this.part&&!this.challenge)return Parts.opts(this);const o=[],b=(c,l,on)=>`<button class="opt" data-c="${c}" aria-pressed="${on}">${l}</button>`;
    o.push(b('mic','Mic',this.mode==='mic'),b('tap','Tap',this.mode==='tap'));if(this.kind!=='bols')o.push(b('wait','Wait for me',this.wait));
    o.push(b('speed',Math.round(this.speed*100)+'%',this.speed!==1),b('guide','Guide',this.guide));$('#plOpts').innerHTML=o.join('');},
  pad(){const P=$('#plPad');if(this.mode==='off'){P.innerHTML=`<div class="listen-note"><b>Play along with the ${this.part&&this.part.yt?'recording':'song'}</b><span>Turn the mic on to get a score</span></div>`;return;}if(this.kind==='bols'&&this.mode!=='mic'){P.innerHTML=`<div class="drums"><button class="drum" data-l="b">Bayan<small>Left · F</small></button><button class="drum" data-l="d">Dayan<small>Right · J</small></button></div>`;
      P.querySelectorAll('.drum').forEach(d=>d.addEventListener('pointerdown',e=>{e.preventDefault();this.tap({lane:d.dataset.l});d.classList.add('hit');setTimeout(()=>d.classList.remove('hit'),110);}));return;}
    if(this.mode==='mic'){P.innerHTML=`<div class="listen-note"><b id="plHear">${Mic.active?'Listening':'Press play to start listening'}</b><span>${this.kind==='bols'?'Play each bol as it reaches the line':this.kind==='chords'?'Strum each chord as it reaches the line':'Play each note on your '+(this.key==='vocals'?'voice':I[this.key].name.toLowerCase())+' as it reaches the line'}</span><div class="meter"><i id="plLvl"></i></div></div>`;return;}
    if(this.kind==='tab'||this.kind==='chords'){P.innerHTML=`<button class="tapbig" id="plTap">${this.kind==='chords'?'Tap to strum as each chord reaches the line':'Tap as each note reaches the line'}</button>`;$('#plTap').addEventListener('pointerdown',e=>{e.preventDefault();this.tap({any:true});e.currentTarget.classList.add('hit');setTimeout(()=>$('#plTap')?.classList.remove('hit'),100);});return;}
    const semis=[...new Set(this.notes.filter(n=>!n.rest).map(n=>n.semi))].sort((a,b)=>a-b);
    P.innerHTML=`<div class="swaras">${semis.map((s,i)=>{const pc=((s%12)+12)%12,oct=Math.floor(s/12);return `<button data-s="${s}"><span style="${KOMAL[pc]?'text-decoration:underline':''}">${DEVA[pc]}${oct>0?'̇':''}</span><small>${oct<0?'low':oct>0?'high':i+1}</small></button>`;}).join('')}</div>`;
    P.querySelectorAll('[data-s]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();this.tap({semi:+b.dataset.s,btn:b});}));},
  msg(m){const el=$('#plMsg');if(!el)return;el.textContent=m;el.hidden=false;chime();clearTimeout(this.mt);this.mt=setTimeout(()=>el.hidden=true,3500);},
  reset(){this.flushTime();this.clicks=[];this.calib=[];this.pulse=0;this.t=-4;this.ended=false;this.trail=[];this.pops=[];this.nextTick=-4;this.nextIdx=0;this.matchAcc=0;this.floor=[];this.elapsed=0;this.streak=0;this.best=0;this.heard=null;
    this.notes.forEach(n=>Object.assign(n,{frames:0,good:0,judged:false,state:null,unlocked:false,byMic:false,hits:{},score:0,onsetOff:null,off:null,offs:null,cw:0,cs:0,cents:null,other:0,early:0}));this.hud();this.btn();if(this.part)Parts.onReset(this);},
  async start(listen=false){ac();if(this.running){this.pause();return;}if(this.ended)this.reset();this.listen=listen;
    if(!listen&&this.mode==='mic'){const ok=await Mic.start();if(!ok){this.mode='tap';this.opts();this.pad();this.msg(micWhy());}else this.pad();}
    this.running=true;this.lastAudio=ctx.currentTime;this.btn();if(this.part)Parts.onStart(this);},
  pause(){this.running=false;this.btn();if(this.part)Parts.onPause(this);},
  btn(){const b=$('#plPlay');if(!b)return;b.innerHTML=this.running&&!this.listen?IC.pause:IC.play;$('#plListen').classList.toggle('on',!!(this.running&&this.listen));},
  bps(){return this.bpm*this.speed/60;},
  pitchVal(det){if(!det||!det.freq)return null;return this.kind==='tab'?69+12*Math.log2(det.freq/440):12*Math.log2(det.freq/SA[this.key]);},
  matches(v,n){if(v==null)return false;const ref=this.kind==='tab'?n.midi:n.semi;return Math.abs((((v-ref)%12)+18)%12-6)<=.6;},
  current(){return this.notes.find(n=>!n.rest&&this.t>=n.start&&this.t<n.start+n.beats);},
  sound(n,v=.35){if(!n||n.rest)return;if(this.kind==='chords'){n.midis.forEach((m,i)=>guitarNote(m,v*.8,i*.024,n.beats/this.bps()));return;}if(this.kind==='tab')guitarNote(n.midi,v,0,n.beats/this.bps());else if(this.kind==='sargam')playSwara(this.key,n.semi,Math.min(1.4,n.beats/this.bps()*.9),v);else n.lanes.forEach(l=>l==='b'?ready()&&bayan(v*.7,86):tablaHit(n.bol.toLowerCase()==='tin'||n.bol.toLowerCase()==='dhin'?'tin':'na',v*.7));},
  hears(det,pv,n){if(this.kind==='chords'){if(!det||!det.chroma||det.rms<Mic.gate*.6)return false;const f=chordFit(det.chroma.c,n.snd||n.chord);this.chordHeard=f.best;this.noteMissing(det.chroma,n);return f.ok;}return this.matches(pv,n);},
  /* per string: how strongly its own note sounds while the chord rings (only strings whose note name is unique in the shape) */
  noteMissing(ch,n){const sh=CHORD_SHAPES[n.chord];if(!sh||!ch||!ch.act)return;const OPEN=[40,45,50,55,59,64],ms=sh.map((f,i)=>f<0?null:OPEN[i]+f+(n.capo||0));
    if(!n.uniq){n.uniq=ms.map((m,i)=>m!=null&&ms.filter(x=>x!=null&&x%12===m%12).length===1);n.strSum=[0,0,0,0,0,0];n.heardN=0;}
    n.heardN++;ms.forEach((m,i)=>{if(!n.uniq[i])return;const k=m-ch.m0;n.strSum[i]+=k>=0&&k<ch.act.length?ch.act[k]:0;});},
  /* the string most often silent in a chord, e.g. {chord:'C',string:'G'} */
  mutedString(tot){const cnt={};for(const n of tot){if(!n.heardN||n.heardN<4||!n.uniq)continue;n.uniq.forEach((u,i)=>{if(!u)return;const avg=n.strSum[i]/n.heardN;if(avg<MUTED_MAX){const k=n.chord+'|'+i;cnt[k]=(cnt[k]||0)+1;}});}
    let best=null,bc=0;for(const k in cnt)if(cnt[k]>bc){bc=cnt[k];best=k;}if(!best||bc<2)return null;const[ch,si]=best.split('|'),NAMES=['low E','A','D','G','B','high E'];
    return{chord:ch,string:NAMES[+si],num:6-si,count:bc};},
  beatAt(T){return this.t+(T-this.lastAudio)*this.bps();},
  frame(t){if(!this.running)return;const now_=ctx.currentTime;let dt=Math.min(.1,now_-this.lastAudio);this.lastAudio=now_;const bps=this.bps(),mic=this.mode==='mic'&&!this.listen;
    const det=mic?Mic.read():null,pv=this.kind==='chords'?null:this.pitchVal(det);if(det&&this.t<0&&det.rms!=null&&!this.clicks.some(c=>now_-c>-.02&&now_-c<.18))this.floor.push(det.rms);this.heard=pv;
    let adv=true;this.waitFor=null;
    if(this.wait&&!this.listen&&this.kind!=='bols'&&this.mode!=='off'&&this.t>=0){const pend=this.notes.find(n=>!n.rest&&!n.unlocked&&this.t>=n.start);
      if(pend){if(this.mode==='mic'){if(this.hears(det,pv,pend)){this.matchAcc+=dt;if(this.matchAcc>.08){pend.unlocked=true;pend.byMic=true;this.matchAcc=0;}}else this.matchAcc=Math.max(0,this.matchAcc-dt*.4);}if(!pend.unlocked){adv=false;this.t=pend.start;this.waitFor=pend;}}}
    const prev=this.t;if(this.part&&this.part.yt)this.t=Parts.ytBeat(this);else if(adv)this.t+=dt*bps;if(this.part)Parts.tick(this,prev);if(this.t>=0&&!this.listen)this.elapsed+=dt;
    while(this.nextTick<0&&this.t>=this.nextTick){click(now_,this.nextTick===-4);this.clicks.push(now_);this.nextTick++;}
    if(prev<0&&this.t>=0){if(this.floor.length>=5){const f=[...this.floor].sort((a,b)=>a-b)[Math.floor(this.floor.length*.1)];Mic.gate=clamp(f*3,.004,.02);}else Mic.gate=.008;this.calibrate();}
    while(this.nextIdx<this.notes.length&&this.t>=this.notes[this.nextIdx].start){const n=this.notes[this.nextIdx];if(this.listen||this.guide)this.sound(n,this.listen?.4:.22);this.nextIdx++;}
    /* onsets: latency calibration during the count-in, timing per note afterwards, strokes for tabla */
    if(det&&det.onsets)for(const o of det.onsets){if(this.beatAt(o.t)<-.4){const c=this.clicks.find(c=>o.raw-c>.008&&o.raw-c<.4);if(c!=null)this.calib.push(o.raw-c);continue;}
      if(this.kind!=='bols'&&o.flat!=null&&o.flat>(FLAT_MAX[this.kind]||.15))continue;this.pulse=now();
      if(this.kind==='bols'){const sh=o.lo/(o.lo+o.hi+1e-12),lanes=sh>.55?['b']:sh<.2?['d']:['b','d'];lanes.forEach(l=>this.tap({lane:l,t:o.t,silent:true}));continue;}
      const bt=adv?this.beatAt(o.t):this.t;let best=null,bd=.3;for(const n of this.notes){if(n.rest||n.judged)continue;const d=Math.abs(bt-n.start)/bps;if(d<bd){bd=d;best=n;}}
      if(best&&(best.onsetOff==null||bd<Math.abs(best.onsetOff)))best.onsetOff=adv?(bt-best.start)/bps:0;}
    const cur=this.current();
    if(mic&&this.kind!=='bols'&&cur&&adv){cur.frames+=dt;if(this.hears(det,pv,cur)){cur.good+=dt;if(pv!=null){const ref=this.kind==='tab'?cur.midi:cur.semi,c=((((pv-ref)%12)+18)%12-6)*100;cur.cw+=dt;cur.cs+=c*dt;}}else if(pv!=null||(det&&det.rms>Mic.gate*1.5))cur.other+=dt;}
    if(this.mode==='mic'&&this.kind!=='bols'&&adv&&!this.listen&&det){const nx=this.notes.find(n=>!n.rest&&!n.judged&&n.start>this.t&&n!==cur);if(nx&&(nx.start-this.t)/bps<.25&&!(cur&&this.hears(det,pv,cur))&&this.hears(det,pv,nx))nx.early=(nx.early||0)+dt;}
    this.notes.forEach(n=>{if(n.rest||n.judged)return;
      if(this.listen||this.mode==='off'){if(this.t>=n.start+n.beats){n.judged=true;n.state='demo';}return;}
      if(this.mode==='mic'&&this.kind!=='bols'){if(this.t>=n.start+n.beats)this.judgeMic(n);}
      else if((this.t-n.start)/bps>.26&&!(this.waitFor===n)){n.judged=true;n.state='miss';n.score=0;this.combo(false);this.pops.push({txt:'Miss',t:now(),n});}});
    if(mic){this.trail.push({t:this.t,v:pv});if(this.trail.length>300)this.trail.shift();const h=$('#plHear'),lv=$('#plLvl');if(lv)lv.style.width=clamp(Mic.level/Math.max(.02,Mic.gate*4)*100,0,100)+'%';
      if(h){let txt='Listening';if(this.kind==='chords'){const tgt=cur||this.notes.find(n=>!n.rest&&!n.judged);if(det&&det.chroma&&det.rms>Mic.gate&&tgt){const f=chordFit(det.chroma.c,tgt.snd||tgt.chord);if(f.best)txt='Hearing '+(f.ok?tgt.chord:f.best);}}
        else if(pv!=null){const nm=this.kind==='tab'?midiName(pv):DEVA[((Math.round(pv)%12)+12)%12],c=Math.round((pv-Math.round(pv))*100);txt=`Hearing ${nm} · ${Math.abs(c)<=8?'in tune':Math.abs(c)+'¢ '+(c>0?'sharp':'flat')}`;}
        if(h.textContent!==txt)h.textContent=txt;}}
    $('#plProg').style.width=clamp(this.t/this.total*100,0,100)+'%';
    if(this.challenge){Parts.chHud(this);if(Parts.chTick(this))return;}
    if(this.t>=this.total+.6){if(!this.listen&&this.part&&Parts.loop(this))return;if(!this.listen&&this.challenge&&Parts.chLoop(this))return;this.finish();}},
  /* score one note from what the microphone heard: right pitch (or chord) for enough of the note, plus timing of its attack */
  judgeMic(n){n.judged=true;const need=Math.min(.16,Math.max(.06,.35*n.beats/this.bps())),pp=clamp((n.good+(n.early||0))/need,0,1)*(n.other>n.good*2.5&&n.other>.3?.6:1),off=n.onsetOff,a=off==null?null:Math.abs(off),tp=a==null?null:a<=.06?1:a<=.12?.8:a<=.2?.5:.3,tw=this.kind==='sargam'?.15:.35;
    let sc=tp==null||pp<=.3?pp*(tp==null?1:1-tw):pp*(1-tw)+tp*tw;if(n.byMic)sc=Math.max(sc,.85);n.score=clamp(sc,0,1);n.state=n.score>=.5?'hit':'miss';if(n.state==='hit'&&off!=null)n.off=off;
    n.cents=n.cw>.05?n.cs/n.cw:null;let txt;
    if(n.state==='hit'){if(off!=null&&off<-.06&&!n.byMic)txt='Early';else if(off!=null&&off>.06&&!n.byMic)txt='Late';else if(this.kind!=='chords'&&n.cents!=null&&Math.abs(n.cents)>22)txt=n.cents>0?'Sharp':'Flat';else txt=n.score>=.9?'Perfect':'Good';}
    else txt=n.other>n.beats/this.bps()*.3?(this.kind==='chords'?'Wrong chord':'Wrong note'):'Miss';
    this.combo(n.state==='hit');this.pops.push({txt,t:now(),n});},
  calibrate(){const c=this.calib.slice().sort((a,b)=>a-b);if(c.length<3)return;const med=c[c.length>>1],near=c.filter(v=>Math.abs(v-med)<.03);if(near.length<3||med<.005||med>.35)return;
    Ear.lat=med;try{localStorage.setItem('fretopia.lat',med.toFixed(3));}catch(e){}},
  /* what to work on: timing tendency, pitch tendency, one tip */
  feedback(tot,stars){const offs=tot.filter(n=>n.state==='hit'&&n.off!=null).map(n=>n.off),cents=tot.filter(n=>n.state==='hit'&&n.cents!=null).map(n=>n.cents),avg=a=>a.reduce((x,y)=>x+y,0)/a.length,rows=[],tips=[];
    const wrong=tot.filter(n=>n.state==='miss'&&n.other>.2).length,chordy=this.kind==='chords';
    if(wrong>=Math.max(2,tot.length*.25))tips.push(chordy?'Several chords sounded different from the target. Check each shape before you strum.':'Many notes were a different pitch. Try 75% speed with Wait for me on.');
    if(chordy){const m=this.mutedString(tot);rows.push(['Chords',m?'A string was muted':'Clean',m?`${m.string} string in ${m.chord}`:'All strings rang']);if(m)tips.push(`In ${m.chord}, the ${m.string} string wasn’t ringing. Press just behind the fret and keep other fingers off it.`);}
    if(offs.length>=3){const on=offs.filter(o=>Math.abs(o)<=.06).length,ea=offs.filter(o=>o<-.06).length,la=offs.filter(o=>o>.06).length,m=avg(offs)*1000;
      rows.push(['Timing',Math.abs(m)<=60?'Steady':m<0?'Rushing':'Dragging',`On time ${on} · Early ${ea} · Late ${la}`]);
      if(Math.abs(m)>60)tips.push(m<0?`You were about ${Math.round(-m)} ms early on average. Wait for each note to reach the line.`:`You were about ${Math.round(m)} ms late on average. Start each note as it touches the line.`);}
    if(cents.length>=3&&!chordy){const c=avg(cents),r=Math.round(Math.abs(c));rows.push(['Pitch',r<=10?'In tune':c>0?`${r}¢ sharp`:`${r}¢ flat`,`Average over ${cents.length} notes`]);
      if(r>15)tips.push(this.key==='guitar'?'Your guitar sounds out of tune. Tune it, then try again.':`You were ${r}¢ ${c>0?'sharp':'flat'} on average. Match Sa before you start.`);}
    const tip=tips[0]||(stars<2?'Try 75% speed with Wait for me on.':'Ready for the next one?');
    return (rows.length?`<div class="fb">${rows.map(r=>`<div><small>${r[0]}</small><b>${r[1]}</b><span>${r[2]}</span></div>`).join('')}</div>`:'')+`<p class="tipline">${tip}</p>`;},
  combo(ok){this.streak=ok?this.streak+1:0;this.best=Math.max(this.best,this.streak);this.hud();},
  tap(inp){const bps=this.bps();
    if(!this.running||this.listen){if(inp.silent)return;if(this.kind==='sargam'&&inp.semi!=null)playSwara(this.key,inp.semi,.4,.4);else if(this.kind==='bols')inp.lane==='b'?ready()&&bayan(.5,86):tablaHit('na',.5);else{const n=this.notes.find(x=>!x.rest&&x.start>=this.t)||this.notes.find(x=>!x.rest);this.sound(n,.35);}return;}
    const tn=this.beatAt(inp.t!=null?inp.t:ctx.currentTime);let best=null,bd=1e9;
    for(const n of this.notes){if(n.rest||n.judged)continue;if(this.kind==='bols'&&inp.lane&&!n.lanes.includes(inp.lane))continue;const d=Math.abs(tn-n.start)/bps;if((d<=.26||this.waitFor===n)&&d<bd){bd=d;best=n;}}
    if(this.kind==='sargam'){playSwara(this.key,inp.semi,.45,.42);if(!best)return;if(((best.semi-inp.semi)%12+12)%12!==0){inp.btn&&(inp.btn.classList.add('bad'),setTimeout(()=>inp.btn.classList.remove('bad'),200));return;}inp.btn&&(inp.btn.classList.add('hit'),setTimeout(()=>inp.btn.classList.remove('hit'),200));}
    else if(this.kind==='tab'||this.kind==='chords'){this.sound(best||this.notes.find(x=>!x.rest&&x.start>=tn)||this.notes.find(x=>!x.rest),.42);if(!best)return;}
    else{if(!inp.silent)inp.lane==='b'?ready()&&bayan(.55,86):tablaHit('na',.55);if(!best)return;best.hits[inp.lane||'any']=1;if(best.offs==null)best.offs=(tn-best.start)/bps;if(inp.lane&&!best.lanes.every(l=>best.hits[l]))return;}
    const wasWait=this.waitFor===best,off=wasWait?0:(best.offs!=null?best.offs:(tn-best.start)/bps),d=Math.abs(off);best.judged=true;best.unlocked=true;best.score=d<=.06?1:d<=.12?.8:.6;best.state='hit';if(!wasWait)best.off=off;
    this.combo(true);this.pops.push({txt:best.score===1?'Perfect':off<0?'Early':'Late',t:now(),n:best});buzz(6);},
  scores(){return this.notes.filter(n=>!n.rest&&n.judged&&n.state!=='demo').map(n=>n.score);},
  hud(){if(!$('#plAcc'))return;const s=this.scores();$('#plAcc').textContent=s.length?Math.round(s.reduce((a,b)=>a+b,0)/s.length*100)+'%':'–';
    if($('#plCount'))$('#plCount').textContent=`${this.notes.filter(n=>n.state==='hit').length}/${this.notes.filter(n=>!n.rest).length}`;},
  finish(){this.running=false;this.ended=true;this.btn();if(this.listen){this.listen=false;this.reset();toast('Your turn');return;}if(this.part||this.challenge)return Parts.finish(this);
    const tot=this.notes.filter(n=>!n.rest),pct=Math.round(tot.reduce((a,n)=>a+n.score,0)/Math.max(1,tot.length)*100),stars=pct>=90?3:pct>=70?2:pct>=45?1:0,prev=starsOf(this.song);
    if(stars>prev){S.stars[sk(this.song)]=stars;saveS();}const all=this.list||[],ix=all.findIndex(x=>x.id===this.song.id),nx=ix>=0?all[ix+1]:null;const m=Math.floor(this.elapsed/60),s=Math.round(this.elapsed%60);
    const o=Game.record({completed:true,song:this.song,inst:this.key,kind:this.kind,pct,stars,elapsed:this.elapsed,speed:this.speed,mode:this.mode});this.recorded=true;
    sheet(`<span class="grab"></span><div class="res"><div class="res-l">
      <div style="display:flex;justify-content:space-between;align-items:flex-end"><div><p class="eyebrow">${['Keep practising','Good start','Bahut badhiya','Shabash'][stars]}</p><h2>${this.song.title}</h2></div><div class="bigstars">${starStr2(stars)}</div></div>
      <div class="sum"><div><small>Accuracy</small><b id="shPct">${pct}%</b></div><div><small>Best run</small><b>${this.best}</b></div><div><small>Time</small><b>${m}:${String(s).padStart(2,'0')}</b></div></div>
      <div class="nb">${tot.map((n,i)=>`<i style="height:${Math.max(8,n.score*100)}%;background:${n.score>=.75?INKC:n.score>=.4?'#B8B8B4':BAD};animation-delay:${Math.min(900,i*18)}ms"></i>`).join('')}</div>
      ${this.feedback(tot,stars)}</div><div class="res-r">${riyazPanel(o,this.song)}</div></div>
      <div class="btns three"><button class="btn ic" id="shSongs" aria-label="Back to songs">${IC.list}<span>Songs</span></button><button class="btn" id="shAgain">Again</button>${nx?`<button class="btn pri" id="shNext">Next: ${nx.title}</button>`:`<button class="btn pri" id="shDone">Done</button>`}</div>`);
    playResults(o,pct,stars);
    $('#shSongs').onclick=()=>this.close();$('#shAgain').onclick=()=>{closeSheet();this.reset();this.start(false);};if(nx)$('#shNext').onclick=()=>{closeSheet();Player.open(nx,all);};else $('#shDone').onclick=()=>this.close();},
  /* time spent on an unfinished attempt still counts as riyaz */
  flushTime(){if(!this.recorded&&this.elapsed>15&&this.song)Game.record({completed:false,song:this.song,inst:this.key,kind:this.kind,elapsed:this.elapsed});this.recorded=false;},
  draw(t){const cv=$('#plCv');if(!cv)return;const f=fitCanvas(cv);if(!f)return;const{g,W,H}=f;this._H=H;g.clearRect(0,0,W,H);
    if(this.kind==='tab')this.drawTab(g,W,H,t);else if(this.kind==='chords')this.drawChords(g,W,H,t);else if(this.kind==='sargam')this.drawSargam(g,W,H,t);else this.drawBols(g,W,H,t);
    if(this.t<0&&this.running){g.fillStyle='rgba(250,250,249,.85)';g.fillRect(0,0,W,H);g.fillStyle=INKC;g.font=`600 72px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(Math.ceil(-this.t)),W/2,H/2);}
    if(!this.running&&!this.ended&&this.t<=-4){g.fillStyle='#A1A1A6';g.font=`500 12px ${FONT}`;g.textAlign='center';g.textBaseline='alphabetic';g.fillText(this.mode==='tap'?'Press play. Four clicks, then tap along.':'Press play. Four clicks, then play along.',W/2,H-10);}
    const tt=now();this.pops=this.pops.filter(p=>tt-p.t<.7);},
  geom(W){const H=this._H||W,wide=W>H*1.5,gut=wide?40:34,nowX=gut+(W-gut)*(wide?.15:.24),ppb=wide?clamp((W-gut)/9.5,56,150):clamp((W-gut)/5.2,46,120);return{gut,nowX,ppb,wide};},
  beatLines(g,W,H,gut,nowX,ppb){for(let b=Math.ceil(this.t-(nowX-gut)/ppb);b<=this.t+(W-nowX)/ppb;b++){const x=nowX+(b-this.t)*ppb;if(x<gut||b<0)continue;g.fillStyle=b%4===0?'rgba(17,17,19,.08)':'rgba(17,17,19,.035)';g.fillRect(x,8,1,H-16);}},
  nowLine(g,H,nowX){g.fillStyle=INKC;g.fillRect(nowX-.75,4,1.5,H-8);if(this.kind!=='chords'&&now()-(this.pulse||0)<.16){g.fillStyle=ACC;g.beginPath();g.arc(nowX,6,4,0,6.283);g.fill();}},
  noteColor(n,cur){return n.state==='hit'?[GOOD,'#fff']:n.state==='miss'?['rgba(229,72,77,.12)',BAD]:n.state==='demo'?['rgba(17,17,19,.14)',INKC]:cur?[ACC,'#fff']:[INKC,'#fff'];},
  drawTab(g,W,H,t){const{gut,nowX,ppb,wide}=this.geom(W),top=wide?34:26,bot=H-(wide?20:24),gap=(bot-top)/5,ly=s=>top+(5-s)*gap,ph=clamp(gap*.62,15,28),r=clamp(ph*.3,5,8);
    this.beatLines(g,W,H,gut,nowX,ppb);const cur=this.current();
    for(let s=0;s<6;s++){const y=ly(s),hot=cur&&cur.s===s,wound=s<=3,w=.7+(5-s)*.32;g.globalAlpha=hot?1:.6;g.strokeStyle=wound?'#857C70':'#9C9EA3';g.lineWidth=w;g.beginPath();g.moveTo(gut,y);g.lineTo(W,y);g.stroke();
      if(wound&&w>1.3){g.setLineDash([.7,1.6]);g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=w*.7;g.stroke();g.setLineDash([]);}g.globalAlpha=1;
      g.fillStyle=hot?INKC:'#A1A1A6';g.font=`${hot?600:500} 11px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(SNAME[s],gut/2,y);}
    this.nowLine(g,H,nowX);g.save();g.beginPath();g.rect(gut+2,0,W,H);g.clip();
    for(const n of this.notes){if(n.rest)continue;const x0=nowX+(n.start-this.t)*ppb,len=Math.max(ph,n.beats*ppb-6);if(x0-ph/2>W||x0-ph/2+len<gut-10)continue;const y=ly(n.s),c=n===cur&&!n.judged,[fill,ink]=this.noteColor(n,c);
      rr(g,x0-ph/2,y-ph/2,len,ph,ph/2);g.fillStyle=fill;g.fill();if(n.state==='miss'){g.strokeStyle=BAD;g.lineWidth=1;g.stroke();}
      g.fillStyle=ink;g.font=`600 ${Math.round(ph*.5)}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(n.f),x0,y+.5);}g.restore();
    this.drawBall(g,W,nowX,ppb,this.notes.filter(n=>!n.rest).map(n=>({s:n.start,y:ly(n.s)-ph/2-r})),r,gap*1.9);
    this.drawPops(g,nowX,n=>ly(n.s)-ph/2-r*2-14);
    if(this.mode==='mic'&&this.heard!=null&&this.running){const p=tabPos(Math.round(this.heard));g.strokeStyle=INKC;g.lineWidth=1.5;g.beginPath();g.arc(nowX,ly(p.s),ph*.62,0,6.283);g.stroke();}
    if(this.waitFor&&this.running){g.fillStyle=ACC;g.font=`600 12px ${FONT}`;g.textAlign='left';g.textBaseline='top';g.fillText(`Play fret ${this.waitFor.f} on ${SNAME[this.waitFor.s]} · ${midiName(this.waitFor.midi)}`,nowX+12,4);}},
  /* the bouncing ball: rides a dotted path from note to note and lands on each one at the line */
  drawBall(g,W,nowX,ppb,pts,r,maxH){if(!pts.length)return;const X=s=>nowX+(s-this.t)*ppb,hop=(a,b)=>clamp((b.s-a.s)*ppb*.42,10,maxH);
    if(pts[0].s>-4){const f=pts[0],pre=[];for(let b=Math.min(-1,Math.ceil(f.s)-1);b>=-4;b--)pre.unshift({s:b,y:f.y});pts=[...pre,...pts];}
    g.fillStyle='rgba(17,17,19,.26)';for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],xa=X(a.s),xb=X(b.s);if(xb<nowX||xa>W)continue;const h=hop(a,b);
      for(let x=Math.max(xa,nowX+r+4);x<Math.min(xb,W);x+=8){const u=(x-xa)/(xb-xa),y=a.y+(b.y-a.y)*u-4*h*u*(1-u);g.beginPath();g.arc(x,y,1.4,0,6.283);g.fill();}}
    let k=pts.findIndex(p=>p.s>this.t),y;if(k===-1)y=pts[pts.length-1].y;else if(k===0)y=pts[0].y;else{const a=pts[k-1],b=pts[k],u=clamp((this.t-a.s)/(b.s-a.s),0,1);y=a.y+(b.y-a.y)*u-4*hop(a,b)*u*(1-u);}
    const moving=this.running&&!this.waitFor&&this.t>-4,land=!moving?1:k>0?clamp(Math.min(this.t-pts[k-1].s,pts[k].s-this.t)*ppb/(r*3),0,1):1,sq=.82+.18*land;
    g.save();g.translate(nowX,y+r*(1-sq));g.scale(1/Math.sqrt(sq),sq);g.beginPath();g.arc(0,0,r,0,6.283);g.fillStyle=INKC;g.fill();g.restore();
    g.beginPath();g.arc(nowX-r*.3,y-r*.35,r*.28,0,6.283);g.fillStyle='rgba(255,255,255,.55)';g.fill();},
  drawSargam(g,W,H,t){const{gut,nowX,ppb}=this.geom(W),rows=this.max-this.min+1,top=10,rowH=(H-20)/rows,y=s=>top+(this.max-s+.5)*rowH;
    const used=new Set(this.notes.filter(n=>!n.rest).map(n=>((n.semi%12)+12)%12));
    for(let s=this.min;s<=this.max;s++){const pc=((s%12)+12)%12;if(pc===0){g.fillStyle='rgba(232,87,42,.06)';g.fillRect(gut,y(s)-rowH/2,W-gut,rowH);}else if(used.has(pc)){g.fillStyle='rgba(17,17,19,.025)';g.fillRect(gut,y(s)-rowH/2+1,W-gut,rowH-2);}
      if(used.has(pc)||pc===0){g.fillStyle=pc===0?ACC:'#8E8E93';g.font=`500 ${clamp(rowH*.42,10,15)}px ${DEVAF}`;g.textAlign='center';g.textBaseline='middle';g.fillText(DEVA[pc],gut/2,y(s));const oc=Math.floor(s/12);if(oc){g.beginPath();g.arc(gut/2,y(s)+(oc<0?rowH*.32:-rowH*.32),1.4,0,6.283);g.fill();}}}
    this.beatLines(g,W,H,gut,nowX,ppb);const cur=this.current(),h=Math.min(rowH*.66,28);
    for(const n of this.notes){if(n.rest)continue;const x0=nowX+(n.start-this.t)*ppb,w=n.beats*ppb-6;if(x0>W||x0+w<gut)continue;const c=n===cur&&!n.judged,[fill,ink]=this.noteColor(n,c),bx=Math.max(gut,x0),bw=Math.max(4,w-(bx-x0));
      rr(g,bx,y(n.semi)-h/2,bw,h,Math.min(h/2,bw/2));g.fillStyle=fill;g.fill();
      if(c&&n.frames>0){g.save();rr(g,bx,y(n.semi)-h/2,bw,h,Math.min(h/2,bw/2));g.clip();g.fillStyle='rgba(31,157,85,.85)';g.fillRect(x0,y(n.semi)-h/2,(nowX-x0)*(n.good/n.frames),h);g.restore();}
      if(bw>18&&x0+10>gut){const pc=((n.semi%12)+12)%12;g.fillStyle=ink;g.font=`600 ${clamp(h*.5,10,14)}px ${DEVAF}`;g.textAlign='left';g.textBaseline='middle';g.fillText(DEVA[pc],Math.max(gut+6,x0+8),y(n.semi)+1);}}
    if(this.mode==='mic'){const ref=(cur||this.notes.find(n=>!n.rest&&n.start>this.t)||{semi:(this.min+this.max)/2}).semi,fold=v=>v+12*Math.round((ref-v)/12);
      g.strokeStyle='rgba(17,17,19,.6)';g.lineWidth=2;g.lineJoin='round';g.beginPath();let pen=false;for(const p of this.trail){const x=nowX-(this.t-p.t)*ppb;if(x<gut||p.v==null){pen=false;continue;}const yy=y(clamp(fold(p.v),this.min-.5,this.max+.5));pen?g.lineTo(x,yy):g.moveTo(x,yy);pen=true;}g.stroke();}
    this.nowLine(g,H,nowX);{const r=clamp(h*.3,4,7);this.drawBall(g,W,nowX,ppb,this.notes.filter(n=>!n.rest).map(n=>({s:n.start,y:y(n.semi)-h/2-r})),r,rowH*3);}this.drawPops(g,nowX,n=>y(n.semi)-h);
    if(this.waitFor&&this.running){const pc=((this.waitFor.semi%12)+12)%12;g.fillStyle=ACC;g.font=`600 12px ${FONT}`;g.textAlign='left';g.textBaseline='top';g.fillText('Waiting for '+DEVA[pc],nowX+10,2);}},
  drawBols(g,W,H,t){const gut=54,nowX=gut+(W-gut)*.22,ppb=clamp((W-gut)/5.4,46,120),yB=H*.36,yD=H*.68,ly=l=>l==='b'?yB:yD;
    g.fillStyle='rgba(17,17,19,.03)';g.fillRect(gut,yB-18,W-gut,36);g.fillRect(gut,yD-18,W-gut,36);g.fillStyle='#A1A1A6';g.font=`500 11px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText('Bayan',12,yB);g.fillText('Dayan',12,yD);
    const T=this.song.taal?TAALS[this.song.taal]:null,starts=[];if(T){let a=0;T.vibhag.forEach((v,i)=>{starts.push([a,T.marks[i]]);a+=v;});}
    for(let b=Math.ceil(this.t-(nowX-gut)/ppb);b<=this.t+(W-nowX)/ppb;b++){const x=nowX+(b-this.t)*ppb;if(x<gut||b<0)continue;let mk=null;if(T){const m=((b%T.matras)+T.matras)%T.matras,s=starts.find(st=>st[0]===m);if(s)mk=s[1];}
      g.fillStyle=mk==='X'?'rgba(232,87,42,.45)':mk?'rgba(17,17,19,.12)':'rgba(17,17,19,.035)';g.fillRect(x,18,1,H-26);if(mk){g.fillStyle=mk==='X'?ACC:'#8E8E93';g.font=`600 11px ${FONT}`;g.textAlign='center';g.fillText(mk,x,9);}}
    for(const n of this.notes){if(n.rest)continue;const x=nowX+(n.start-this.t)*ppb;if(x<gut-20||x>W+20)continue;const[fill]=this.noteColor(n,false);
      if(n.lanes.length===2){g.strokeStyle=fill;g.lineWidth=1.5;g.beginPath();g.moveTo(x,yB);g.lineTo(x,yD);g.stroke();}
      n.lanes.forEach(l=>{g.beginPath();g.arc(x,ly(l),12,0,6.283);g.fillStyle=fill;g.fill();});
      g.fillStyle=n.state==='miss'?BAD:'#5F5F64';g.font=`500 12px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(n.bol,x,n.lanes.length===2?(yB+yD)/2:ly(n.lanes[0])+(n.lanes[0]==='b'?-26:26));}
    this.nowLine(g,H,nowX);this.drawPops(g,nowX,n=>ly(n.lanes[0]||'d')-28);},
  drawChords(g,W,H,t){const{gut,nowX,ppb,wide}=this.geom(W),cy=Math.round(H*(wide?.66:.3)),h=Math.min(wide?52:58,H*.22);this.beatLines(g,W,H,gut,nowX,ppb);const cur=this.current();
    g.fillStyle='rgba(17,17,19,.03)';g.fillRect(gut,cy-h/2-6,W-gut,h+12);
    for(const n of this.notes){const x0=nowX+(n.start-this.t)*ppb,w=n.beats*ppb-6;if(x0>W||x0+w<gut)continue;const c=n===cur&&!n.judged,[fill,ink]=this.noteColor(n,c),bx=Math.max(gut,x0),bw=Math.max(6,w-(bx-x0));
      rr(g,bx,cy-h/2,bw,h,12);g.fillStyle=fill;g.fill();if(n.state==='miss'){g.strokeStyle=BAD;g.lineWidth=1;g.stroke();}
      for(let b=1;b<n.beats;b++){const xb=x0+b*ppb;if(xb>bx+8&&xb<bx+bw-4){g.fillStyle=n.state||c?'rgba(255,255,255,.35)':'rgba(255,255,255,.25)';g.fillRect(xb-.5,cy+h/2-12,1,8);}}
      const lab=bw>24&&x0+12>gut-40&&(!n.same||x0<=gut);if(lab){g.fillStyle=ink;g.font=`600 17px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText(n.chord,Math.max(gut+8,x0+12),cy-2);}
      if(n.strum&&bw>14){g.fillStyle=ink;g.globalAlpha=lab?.7:.85;g.font=`600 ${lab?12:15}px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText(n.strum==='U'?'↑':'↓',Math.max(gut+6,x0+(lab?12:9)),lab?cy+15:cy);g.globalAlpha=1;}}
    g.fillStyle=INKC;g.fillRect(nowX-.75,cy-h/2-18,1.5,h+30);if(now()-(this.pulse||0)<.16){g.fillStyle=ACC;g.beginPath();g.arc(nowX,cy-h/2-12,4,0,6.283);g.fill();}
    {const r=7;this.drawBall(g,W,nowX,ppb,this.notes.filter(n=>!n.rest).map(n=>({s:n.start,y:cy-h/2-r})),r,Math.min(60,cy-h/2-20));}
    this.drawPops(g,nowX,()=>cy-h/2-34);
    const show=cur||this.notes.find(n=>n.start>=this.t)||this.notes[this.notes.length-1],nx=this.notes[this.notes.indexOf(show)+1];
    if(wide){const dh=clamp(cy-h/2-24,56,150),dw=dh*.62;drawDiagram(g,Math.max(gut+dw*.55,nowX-dw*.8),6,dw,dh,show.chord,true);if(nx&&nx.chord!==show.chord)drawDiagram(g,W-dw*.5-6,6+dh*.2,dw*.6,dh*.6,nx.chord,false);}
    const dh=wide?0:Math.min(140,H-cy-h/2-30),dw=dh*.7,top=cy+h/2+26;if(dh>60){drawDiagram(g,W/2-(nx&&nx.chord!==show.chord?dw*.7:0),top,dw,dh,show.chord,true);if(nx&&nx.chord!==show.chord)drawDiagram(g,W/2+dw*.75,top+dh*.25,dw*.55,dh*.55,nx.chord,false);}
    if(this.waitFor&&this.running){g.fillStyle=ACC;g.font=`600 12px ${FONT}`;g.textAlign='left';g.textBaseline='top';g.fillText('Strum '+this.waitFor.chord,nowX+10,4);}},
  drawPops(g,nowX,yOf){const tt=now();for(const p of this.pops){const a=1-(tt-p.t)/.7;if(a<=0)continue;g.globalAlpha=a;g.fillStyle=/Miss|Wrong/.test(p.txt)?BAD:p.txt==='Perfect'?GOOD:/Early|Late|Sharp|Flat/.test(p.txt)?ACC:INKC;g.font=`600 13px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(p.txt,nowX,yOf(p.n)-(1-a)*12);g.globalAlpha=1;}}};
function drawDiagram(g,cx,top,w,h,name,main){const sh=CHORD_SHAPES[name];if(!sh)return;const x0=cx-w/2,lab=main?22:16,y0=top+lab+20,gw=w,gh=h-lab-14,sx=gw/5,fy=gh/4,base=Math.max(1,Math.min(...sh.filter(f=>f>0)))>3?Math.min(...sh.filter(f=>f>0)):1;
  g.fillStyle=main?INKC:'#A1A1A6';g.font=`600 ${main?17:13}px ${FONT}`;g.textAlign='center';g.textBaseline='alphabetic';g.fillText(name,cx,top+lab-4);
  g.strokeStyle=main?'rgba(17,17,19,.55)':'rgba(17,17,19,.28)';g.lineWidth=1;for(let i=0;i<6;i++){g.beginPath();g.moveTo(x0+i*sx,y0);g.lineTo(x0+i*sx,y0+gh);g.stroke();}
  for(let f=0;f<=4;f++){g.lineWidth=f===0&&base===1?3:1;g.beginPath();g.moveTo(x0,y0+f*fy);g.lineTo(x0+gw,y0+f*fy);g.stroke();}
  sh.forEach((f,i)=>{const x=x0+i*sx;g.fillStyle=main?INKC:'#A1A1A6';g.strokeStyle=g.fillStyle;g.lineWidth=1.2;
    if(f<0){const r=sx*.16;g.beginPath();g.moveTo(x-r,y0-12-r);g.lineTo(x+r,y0-12+r);g.moveTo(x+r,y0-12-r);g.lineTo(x-r,y0-12+r);g.stroke();}
    else if(f===0){g.beginPath();g.arc(x,y0-12,sx*.15,0,6.283);g.stroke();}
    else{g.beginPath();g.arc(x,y0+(f-base+.5)*fy,Math.min(sx,fy)*.32,0,6.283);g.fill();}});}
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function click(t,accent){if(!ready())return;const o=ctx.createOscillator();o.frequency.value=accent?1500:1050;const g=ctx.createGain();g.gain.setValueAtTime(.06,t);g.gain.exponentialRampToValueAtTime(.0005,t+.05);o.connect(g).connect(master);o.start(t);o.stop(t+.06);}
function sheet(html){closeSheet();const w=document.createElement('div');w.className='sheet-wrap';w.id='sheet';w.innerHTML=`<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;($('#player')||SCREEN).appendChild(w);}
function closeSheet(){$('#sheet')?.remove();}
addEventListener('keydown',e=>{if(!$('#player')||e.metaKey||e.ctrlKey)return;const k=e.key.toLowerCase();
  if(e.key===' '){e.preventDefault();if(!e.repeat)$('#plPlay').click();return;}if(e.key==='Escape'){Player.close();return;}if(e.repeat)return;
  if(Player.kind==='bols'&&Player.mode==='tap'){if(k==='f')Player.tap({lane:'b'});if(k==='j')Player.tap({lane:'d'});return;}
  if(Player.mode!=='tap')return;if((Player.kind==='tab'||Player.kind==='chords')&&(k==='j'||k==='enter'))Player.tap({any:true});
  if(Player.kind==='sargam'&&/^[1-9]$/.test(k)){const b=$$('#plPad [data-s]')[+k-1];if(b)Player.tap({semi:+b.dataset.s,btn:b});}});

/* ================= sound that always plays ================= */
/* iPhone: the page asks for the "playback" audio session so sound plays even with the silent switch on;
   a silent <audio> element does the same on older iOS. Notes played before the browser lets audio start
   are queued, not dropped (see ready()). */
let keepAlive=null;
function silentWav(){const n=800,b=new Uint8Array(44+n),v=new DataView(b.buffer),w=(o,s)=>{for(let i=0;i<s.length;i++)b[o+i]=s.charCodeAt(i);};
  w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,'data');v.setUint32(40,n,true);b.fill(128,44);
  return URL.createObjectURL(new Blob([b],{type:'audio/wav'}));}
function unmute(){if(!ctx)ac();if(ctx.state!=='running'){try{ctx.resume();}catch(e){}}
  if(!keepAlive&&!navigator.audioSession&&/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)&&'ontouchend' in document){try{keepAlive=new Audio(silentWav());keepAlive.setAttribute('playsinline','');keepAlive.loop=true;keepAlive.play().catch(()=>{keepAlive=null;});}catch(e){keepAlive=null;}}}
['touchstart','touchend','pointerdown','click','pointerup','keydown'].forEach(ev=>addEventListener(ev,unmute,{capture:true,passive:true}));
const soundOn=()=>!!ctx&&ctx.state==='running';
/* iPhone only starts audio after a tap, not a swipe. Notes played while audio is still off are queued;
   when it starts, any queued for more than half a second are dropped so you never get a late burst. */
const PENDING=[];[window.AudioBufferSourceNode,window.OscillatorNode].forEach(C=>{if(!C)return;const st=C.prototype.start;C.prototype.start=function(...a){if(this.context&&this.context.state!=='running')PENDING.push([this,performance.now()]);return st.apply(this,a);};});
function onAudioState(){if(!soundOn())return;const t=performance.now();while(PENDING.length){const[n,at]=PENDING.shift();if(t-at>450){try{n.stop();}catch(e){}}}
  const h=$('#hint');if(h&&h.classList.contains('ask')){h.style.opacity=0;setTimeout(()=>{h.classList.remove('ask');h.textContent='Run a finger across the strings';},800);}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ctx){try{ctx.resume();}catch(e){}if(keepAlive)keepAlive.play().catch(()=>{});}});
/* a short, cute two-note chime for alerts */
function chime(){try{ac();const t=ctx.currentTime+.02;[[1318.5,0,.11],[1975.5,.09,.09]].forEach(([f,d,a])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(f,t+d);o.frequency.exponentialRampToValueAtTime(f*1.015,t+d+.15);
  g.gain.setValueAtTime(0,t+d);g.gain.linearRampToValueAtTime(a,t+d+.008);g.gain.exponentialRampToValueAtTime(.0005,t+d+.26);o.connect(g).connect(master);o.start(t+d);o.stop(t+d+.3);});}catch(e){}}

/* ================= microphone ================= */
const IN_APP=/FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|LinkedInApp|GSA\/|; wv\)/i.test(navigator.userAgent);
Mic.start=async function(){if(this.active)return true;this.err=null;
  if(!window.isSecureContext){this.err='insecure';return false;}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){this.err=IN_APP?'inapp':'unsupported';return false;}
  try{if(navigator.audioSession)navigator.audioSession.type='play-and-record';}catch(e){}
  try{ac();this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}
  catch(e){const n=e&&e.name;this.err=n==='NotAllowedError'||n==='SecurityError'?(IN_APP?'inapp':'denied'):n==='NotFoundError'||n==='OverconstrainedError'?'nomic':n==='NotReadableError'||n==='AbortError'?'busy':(IN_APP?'inapp':'other');this.stop();return false;}
  try{if(ctx.state!=='running')await ctx.resume().catch(()=>{});
    if(localStorage.getItem('fretopia.lat')==null)Ear.lat=clamp((ctx.outputLatency||0)+(ctx.baseLatency||0)+.02,.02,.25);
    await Ear.attach(this.stream);this.hist=[];this.active=true;return true;}
  catch(e){this.err='other';this.stop();return false;}};
Mic.stop=function(){Ear.detach();try{this.stream&&this.stream.getTracks().forEach(t=>t.stop());}catch(e){}this.stream=null;this.src=null;this.active=false;this.hist=[];this.level=0;
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}};
Mic.read=function(){if(!Ear.active)return null;this.level=Ear.level;const p=Ear.pitch;let f=p&&p.f;
  if(f){this.hist.push(f);if(this.hist.length>3)this.hist.shift();f=[...this.hist].sort((a,b)=>a-b)[this.hist.length>>1];}else this.hist=[];
  return{freq:f||null,rms:Ear.rms||0,onsets:Ear.takeOnsets(),chroma:Ear.chroma};};
function micWhy(){return{denied:'Mic blocked. Allow it in settings.',inapp:'Open in Safari or Chrome to use the mic.',insecure:'The mic needs https.',unsupported:'Mic not supported here.',nomic:'No mic found.',busy:'Mic in use by another app.',other:'Mic didn’t start. Try again.'}[Mic.err||'other'];}

/* ================= picker: swipe anywhere, sound only when you play ================= */
I.harmonium.how='Press the keys';
const PLAY_AXIS={guitar:'y',sitar:'y',bansuri:'y',tabla:'tap',harmonium:'tap',vocals:'x'};
Car.go=function(i,fromVel=0){i=clamp(i,0,ORDER.length-1);if(i!==this.i){this.i=i;buzz(4);this.cards.forEach((c,j)=>c.el.classList.toggle('active',j===i));$$('#dots i').forEach((d,j)=>d.classList.toggle('on',j===i));setChoose(I[ORDER[i]].name);}this.target=i*this.step;this.vel=fromVel;this.settledAt=0;};
Car.update=function(dt){if(!this.drag){const k=210,c=2*Math.sqrt(k)*.86,x=this.pos-this.target,a=-k*x-c*this.vel;this.vel+=a*dt;this.pos+=this.vel*dt;if(Math.abs(x)<.4&&Math.abs(this.vel)<6){this.pos=this.target;this.vel=0;}}this.apply();};
Car.wire=function(){const P=$('#picker'),G={},sc=()=>parseFloat(getComputedStyle($('.device')).getPropertyValue('--s'))||1;
  const feed=(c,e)=>{const evs=e.getCoalescedEvents?e.getCoalescedEvents():[];for(const ev of (evs.length?evs:[e])){const p=this.local(c,ev),p0=c.ptrs[e.pointerId];if(!p0)return;c.inst.move(p0,p,p.t-p0.t,e.pointerId);c.ptrs[e.pointerId]=p;}};
  const startSwipe=(g,e)=>{g.mode='swipe';g.x0=e.clientX;g.pos0=this.pos;g.samples=[[performance.now(),e.clientX/sc()]];this.drag=g;this.cards.forEach(c=>c.el.style.cursor='grabbing');};
  P.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button>0)return;const cardEl=e.target.closest('.card'),ci=cardEl?+cardEl.dataset.i:-1,c=this.cards[ci];
    const g={id:e.pointerId,x0:e.clientX,y0:e.clientY,ci,mode:'pending',pos0:this.pos,samples:[[performance.now(),e.clientX/sc()]]};
    if(c&&ci===this.i&&e.target.tagName==='CANVAS'&&!this.drag&&Math.abs(this.pos-this.target)<3){e.preventDefault();const p=this.local(c,e);c.ptrs[e.pointerId]=p;c.inst.down(p,e.pointerId);g.mode='play';g.card=c;}
    G[e.pointerId]=g;try{P.setPointerCapture(e.pointerId);}catch(_){}});
  P.addEventListener('pointermove',e=>{const g=G[e.pointerId];if(!g)return;const s=sc(),dx=(e.clientX-g.x0)/s,dy=(e.clientY-g.y0)/s;
    if(g.mode==='play'){const ax=PLAY_AXIS[ORDER[g.ci]],lim=ax==='x'?90:16;
      if(!g.locked&&Math.abs(dy)>26&&Math.abs(dy)>Math.abs(dx))g.locked=true;
      if(!g.locked&&Math.abs(dx)>lim&&Math.abs(dx)>Math.abs(dy)*1.4){const c=g.card;c.inst.up(e.pointerId);delete c.ptrs[e.pointerId];if(c.inst.strings)releaseAll(c.inst.strings);startSwipe(g,e);return;}
      feed(g.card,e);return;}
    if(g.mode==='pending'){if(Math.abs(dx)<7&&Math.abs(dy)<7)return;if(Math.abs(dx)>=Math.abs(dy)){startSwipe(g,e);}else{g.mode='none';return;}}
    if(g.mode!=='swipe')return;const ddx=(e.clientX-g.x0)/s;let p=g.pos0-ddx;const max=(ORDER.length-1)*this.step;if(p<0)p*=.32;if(p>max)p=max+(p-max)*.32;this.pos=p;g.samples.push([performance.now(),e.clientX/s]);if(g.samples.length>6)g.samples.shift();});
  const end=e=>{const g=G[e.pointerId];if(!g)return;delete G[e.pointerId];
    if(g.mode==='play'){g.card.inst.up(e.pointerId);delete g.card.ptrs[e.pointerId];return;}
    if(g.mode==='pending'){if(g.ci>=0&&g.ci!==this.i)this.go(g.ci);return;}
    if(g.mode!=='swipe')return;this.drag=null;this.cards.forEach(c=>c.el.style.cursor='');const sm=g.samples,a=sm[0],b=sm[sm.length-1],v=b[0]>a[0]?-(b[1]-a[1])/(b[0]-a[0])*1000:0;
    let idx=Math.round((this.pos+v*.16)/this.step);if(idx===this.i&&Math.abs(v)>320)idx+=Math.sign(v);this.go(clamp(idx,this.i-1,this.i+1),v);};
  P.addEventListener('pointerup',end);P.addEventListener('pointercancel',end);
  P.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)<Math.abs(e.deltaY)||Math.abs(e.deltaX)<2)return;e.preventDefault();this.pos=clamp(this.pos+e.deltaX,-40,(ORDER.length-1)*this.step+40);this.target=this.pos;clearTimeout(this.wt);this.wt=setTimeout(()=>this.go(Math.round(this.pos/this.step)),110);},{passive:false});};

/* ================= no zooming ================= */
['gesturestart','gesturechange','dblclick'].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
let lastTouchEnd=0;document.addEventListener('touchend',e=>{const t=e.timeStamp;if(t-lastTouchEnd<350&&!e.target.closest('input,textarea,select'))e.preventDefault();lastTouchEnd=t;},{passive:false});

/* ================= scenes ================= */
let pickerOpen=false;
function showScene(id){['landing','goal','picker','home'].forEach(s=>{const el=$('#'+s);el.hidden=s!==id;el.classList.remove('enter','leave');});const el=$('#'+id);void el.offsetWidth;el.classList.add('enter');pickerOpen=false;}
function openPicker(){Flow.go('picker');}
function openHome(key){S.inst=key;saveS();showScene('home');renderHome();$('#hscroll').scrollTop=0;}
if(S.goal&&S.onboarded)$('#begin .lbl').textContent='Continue';
$('#begin').onclick=()=>Flow.begin();$('#hback').onclick=()=>Flow.go('picker');
let toastT;function toast(m){chime();$('.toast')?.remove();const t=document.createElement('div');t.className='toast';t.textContent=m;($('#player')||SCREEN).appendChild(t);clearTimeout(toastT);toastT=setTimeout(()=>t.remove(),2600);}

/* ================= loop + layout ================= */
function loop(){const t=now();runGhosts(t);
  if(!$('#landing').hidden)Landing.draw(t);
  if($('#player')){Player.frame(t);Player.draw(t);}loop.p=t;
/* ================= always the latest version on the same link ================= */
const APP_V='15';
function checkUpdate(){const h=location.hostname;if(!/^https?:$/.test(location.protocol)||/claude|localhost|127\.0\.0\.1/.test(h))return;
  fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(!j||!j.v||j.v===APP_V||$('#player'))return;const k='fretopia.updated.'+j.v;
    try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');}catch(e){}location.reload();}).catch(()=>{});}
checkUpdate();document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate();});
requestAnimationFrame(loop);}
function layout(){const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone,framed=!standalone&&innerWidth>=640&&innerHeight>=560;
  document.documentElement.classList.toggle('framed',framed);$('.device').style.setProperty('--s',framed?Math.min(1,(innerHeight-28)/868,(innerWidth-28)/414):1);
  Landing.layout();}
addEventListener('resize',layout);
const clockF=()=>{$('#sbTime').textContent=new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}).replace(/\s?[ap]m/i,'');};clockF();setInterval(clockF,15000);
loadSamples();try{ctx.addEventListener('statechange',onAudioState);}catch(e){}layout();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{Landing.layout();if(!$('#picker').hidden)Flow.drawThumbs();});
try{if('serviceWorker' in navigator&&(['localhost','127.0.0.1'].includes(location.hostname)||(location.protocol==='https:'&&window.top===window&&!location.hostname.endsWith('claude.ai'))))navigator.serviceWorker.register('sw.js').catch(()=>{});}catch(e){}
requestAnimationFrame(loop);
