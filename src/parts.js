
/* ================= Song parts, creator, challenges and clips =================
   Practise one part of a real song (a chorus, an intro) at your level, move up to a harder
   version of the same part, chart parts yourself, challenge friends on this phone, and record
   a clip of your take. Everything is stored on this phone (localStorage 'fretopia.parts1'). */
const PK='fretopia.parts1';
const PS=(()=>{const d={saved:{},attempts:{},drafts:{},arrs:{},recs:{},revs:{},timing:{},checked:{},last:null,q:'',sel:{},players:['You'],me:'You',scores:{},feel:{}};
  try{return Object.assign(d,JSON.parse(localStorage.getItem(PK)||'{}'));}catch(e){return d;}})();
function savePS(){try{localStorage.setItem(PK,JSON.stringify(PS));}catch(e){toast('Phone storage is full');}}
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtT=s=>{s=Math.max(0,s||0);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');};
const fmtT2=s=>{s=Math.max(0,s||0);return Math.floor(s/60)+':'+(s%60).toFixed(2).padStart(5,'0');};
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const PIC={back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="6.5" width="13" height="11" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3z"/></svg>',
  stop:'<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  bm:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
  bmOn:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/></svg>',
  swords:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 4l9 9M20 4l-9 9M7 14l3 3M17 14l-3 3M5 19l2-2M19 19l-2-2"/></svg>'};

/* ---------- seed content ---------- */
/* Demo recordings: public-domain tunes the app plays itself, so their timing is exact. */
const DEMO_SONGS={
  saints:{bpm:108,meter:4,key:'C',bars:['C','Fmaj7','G7','C', 'C','C','C','C','C','C','G7','G7','C','C7','F','F','C','G7','C','C'],
    mel:['r:4','r:4','r:4','r:1 C4 E4 F4', 'G4:4','r:1 C4 E4 F4','G4:4','r:1 C4 E4 F4','G4:2 E4:2','C4:2 E4:2','D4:4','r:1 E4 E4 D4','C4:3 C4:1','E4:2 G4:2','G4:1 F4:3','r:2 E4 F4','G4:2 E4:2','C4:2 D4:2','C4:4','r:4'],
    sections:[['Intro',0,4],['Chorus',4,16]]},
  grace:{bpm:80,meter:3,key:'G',bars:['G','C','G','D', 'G','G','C','G','G','G','D','D','G','G7','C','G','G','D','G','G'],
    mel:['r:3','r:3','r:3','r:2 D4:1', 'G4:2 B4:.5 G4:.5','B4:2 A4:1','G4:2 E4:1','D4:2 D4:1','G4:2 B4:.5 G4:.5','B4:2 A4:1','D5:3','D5:2 B4:1','D5:1.5 B4:.5 G4:1','B4:2 A4:1','G4:2 E4:1','D4:2 D4:1','G4:2 B4:.5 G4:.5','B4:2 A4:1','G4:3','r:3'],
    sections:[['Intro',0,4],['Verse',4,16]]}};
const SEED_RECS=[
  {id:'demo:saints',song:'When the Saints Go Marching In',artist:'Traditional',kind:'Played by Fretopia',src:'demo',demo:'saints'},
  {id:'demo:grace',song:'Amazing Grace',artist:'John Newton (traditional tune)',kind:'Played by Fretopia',src:'demo',demo:'grace'},
  {id:'yt:CGj85pVzRJs',song:'Let It Be',artist:'The Beatles',kind:'Official video',src:'yt',vid:'CGj85pVzRJs',dur:243},
  {id:'yt:rm9coqlk8fY',song:"Knockin' On Heaven's Door",artist:'Bob Dylan',kind:'Official audio',src:'yt',vid:'rm9coqlk8fY',dur:152},
  {id:'yt:IJq0yyWug1k',song:'Tum Hi Ho',artist:'Arijit Singh · Aashiqui 2',kind:'Film song',src:'yt',vid:'IJq0yyWug1k',dur:310},
  {id:'yt:PJWemSzExXs',song:'Baarishein',artist:'Anuv Jain',kind:'Studio',src:'yt',vid:'PJWemSzExXs',dur:208},
  {id:'yt:NLKwRW2y-sg',song:'Baarishein',artist:'Anuv Jain',kind:'Acoustic',src:'yt',vid:'NLKwRW2y-sg',dur:215},
  {id:'yt:sFMRqxCexDk',song:'Choo Lo',artist:'The Local Train',kind:'Official audio',src:'yt',vid:'sFMRqxCexDk',dur:234},
  {id:'yt:uB5bf7LQPVU',song:'Choo Lo',artist:'The Local Train',kind:'Home demo',src:'yt',vid:'uB5bf7LQPVU',dur:253}];
Object.assign(CHORD_SHAPES,{Bm:[-1,2,4,4,3,2],Bm7:[-1,2,0,2,0,2],'F#m':[2,4,4,2,2,2],Cadd9:[-1,3,2,0,3,0],Gsus4:[3,3,0,0,1,3]});
const TUNINGS={std:{name:'Standard',m:[40,45,50,55,59,64]},dropd:{name:'Drop D',m:[38,45,50,55,59,64]},half:{name:'Half step down',m:[39,44,49,54,58,63]}};
const PATTERNS={one:null,beat:{4:[[0,'D'],[1,'D'],[2,'D'],[3,'D']],3:[[0,'D'],[1,'D'],[2,'D']]},
  ddu:{4:[[0,'D'],[1,'D'],[1.5,'U'],[2.5,'U'],[3,'D'],[3.5,'U']],3:[[0,'D'],[1,'D'],[1.5,'U'],[2,'D'],[2.5,'U']]}};
/* chart = [[chord,beats],...] -> strum events */
function strums(chart,meter,pat){const ev=[];let b=0;const segs=chart.map(([c,d])=>{const s={c,b,d};b+=d;return s;}),tot=b;
  if(!pat){segs.forEach(s=>ev.push({b:s.b,d:s.d,c:s.c,st:'D'}));return ev;}
  const P=PATTERNS[pat][meter];for(let bar=0;bar*meter<tot;bar++)for(const[o,st]of P){const at=bar*meter+o;if(at>=tot)continue;const s=segs.find(x=>at>=x.b&&at<x.b+x.d);if(s)ev.push({b:at,c:s.c,st});}
  ev.forEach((e,i)=>{if(e.d==null)e.d=(ev[i+1]?ev[i+1].b:tot)-e.b;});return ev;}
function melEvents(bars,meter,from,n,sub){const ev=[];for(let i=0;i<n;i++){let b=i*meter;for(const tok of bars[from+i].split(/\s+/)){const[nm,du]=tok.split(':'),d=du?+du:1;if(nm!=='r'){const m=nameMidi(nm),p=tabPos(m);ev.push({b,d,s:p.s,f:p.f});}b+=d;}}return ev;}
function fingerEvents(chart,meter){const ev=[];let b=0;for(const[c,d]of chart){const sh=CHORD_SHAPES[c];if(!sh){b+=d;continue;}const root=sh.findIndex(f=>f>=0);
  for(let k=0;k<d;k++){const at=b+k,s=k%meter===0?root:k%meter===1?3:4;const f=sh[s];if(f>=0)ev.push({b:at,d:1,s,f});}b+=d;}return ev;}
function demoChart(D,from,n,easy){return D.bars.slice(from,from+n).map(c=>[easy&&c==='F'?'Fmaj7':c,D.meter]);}
function seedArrs(){const out=[];
  const mk=(o)=>out.push(Object.assign({author:'Fretopia',tuning:'std',capo:0,rev:1,seed:true,checked:true},o));
  for(const[key,rid]of[['saints','demo:saints'],['grace','demo:grace']]){const D=DEMO_SONGS[key],spb=60/D.bpm;
    for(const[sec,from,n]of D.sections){const base={rec:rid,section:sec,bpm:D.bpm,meter:D.meter,bars:n,start:from*D.meter*spb,end:(from+n)*D.meter*spb,anchors:[{b:0,t:from*D.meter*spb}]},id=key+'-'+sec.toLowerCase();
      if(sec==='Intro'){mk({...base,id:id+'-b',part:'Rhythm',level:'Beginner',mode:'chords',goal:'One strum per bar',ev:strums(demoChart(D,from,n,true),D.meter,null)});continue;}
      mk({...base,id:id+'-b',part:'Rhythm',level:'Beginner',mode:'chords',goal:D.meter===3?'One strum at the start of every bar':'Steady downstrokes on every beat, easy Fmaj7 for F',next:id+'-i',ev:strums(demoChart(D,from,n,true),D.meter,D.meter===3?null:'beat')});
      mk({...base,id:id+'-i',part:'Rhythm',level:'Intermediate',mode:'chords',goal:D.meter===3?'Waltz strum: down, down-up, down-up':'Adds upstrokes, and the full F chord',next:id+'-l',ev:strums(demoChart(D,from,n,false),D.meter,'ddu')});
      mk({...base,id:id+'-l',part:'Lead',level:'Advanced',mode:'tab',goal:'The tune, note by note',ev:melEvents(D.mel,D.meter,from,n)});
      if(key==='grace')mk({...base,id:id+'-f',part:'Fingerstyle',level:'Intermediate',mode:'tab',goal:'Bass note, then two treble strings, every bar',ev:fingerEvents(demoChart(D,from,n,false),D.meter)});}}
  /* real recordings: chords only; timing is a first guess until someone checks it in Sync */
  const real=[['yt:CGj85pVzRJs','lb','First chorus',72,41,0,[['Am',2],['G',2],['F',2],['C',2],['C',2],['G',2],['F',2],['C',2]]],
    ['yt:rm9coqlk8fY','kd','First chorus',69,42,0,[['G',2],['D',2],['Am',4],['G',2],['D',2],['C',4],['G',2],['D',2],['Am',4],['G',2],['D',2],['C',4]]],
    ['yt:IJq0yyWug1k','th','First chorus',94,73,1,[['Em',4],['Am',4],['D',2],['Bm',2],['C',4],['Em',4],['Am',4],['D',2],['Bm',2],['C',4]]],
    ['yt:PJWemSzExXs','bs','First chorus',76,52,0,[['D',4],['Bm',4],['G',4],['A',4],['D',4],['Bm',4],['G',4],['A',4]]],
    ['yt:sFMRqxCexDk','cl','First chorus',73,65,2,[['Bm',4],['A',4],['G',4],['A',4],['Bm',4],['A',4],['G',4],['A',4]]]];
  for(const[rid,k,sec,bpm,start,capo,chart]of real){const beats=chart.reduce((a,c)=>a+c[1],0),base={rec:rid,section:sec,bpm,meter:4,bars:beats/4,start,end:start+beats*60/bpm,anchors:[{b:0,t:start}],capo,checked:false};
    const easy=chart.map(([c,d])=>[c==='F'?'Fmaj7':c==='Bm'?'Bm7':c,d]);
    mk({...base,id:k+'-b',part:'Rhythm',level:'Beginner',mode:'chords',goal:'One strum on each chord change'+(easy.some(([c],i)=>c!==chart[i][0])?', with easier shapes':''),next:k+'-i',ev:strums(easy,4,null)});
    mk({...base,id:k+'-i',part:'Rhythm',level:'Intermediate',mode:'chords',goal:'Strum pattern: down, down-up, up-down-up',ev:strums(chart,4,'ddu')});}
  return out;}
const SEED_ARRS=seedArrs();

/* ---------- catalogue ---------- */
function recOf(id){return PS.recs[id]||SEED_RECS.find(r=>r.id===id)||null;}
function allRecs(){return[...SEED_RECS,...Object.values(PS.recs).filter(r=>!SEED_RECS.some(s=>s.id===r.id))];}
function arrOf(id){return PS.arrs[id]||SEED_ARRS.find(a=>a.id===id)||null;}
function arrsFor(rid){return[...SEED_ARRS,...Object.values(PS.arrs)].filter(a=>a.rec===rid);}
function recDur(r){if(r.dur)return r.dur;if(r.demo){const D=DEMO_SONGS[r.demo];return D.bars.length*D.meter*60/D.bpm;}return 0;}
function isChecked(a){return a.checked||!!PS.checked[a.id];}
function arrLen(a){return Math.max(0,a.end-a.start);}
function thumb(r){return r.src==='yt'?`<img class="th" alt="" loading="lazy" src="https://i.ytimg.com/vi/${r.vid}/mqdefault.jpg">`:`<span class="th demo">${PIC.note}</span>`;}
function parseYT(s){s=(s||'').trim();let m=/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(s);if(m)return m[1];if(/^[A-Za-z0-9_-]{11}$/.test(s))return s;return null;}
const transposeChord=(n,k)=>{if(!k)return n;const m=/^([A-G])(#|b)?(.*)$/.exec(n);if(!m)return n;const L=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],B={C:0,D:2,E:4,F:5,G:7,A:9,B:11};const pc=(B[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0)+k+120)%12;return L[pc]+m[3];};

/* beats <-> recording seconds, from the timing anchors (or the BPM alone) */
function tmap(a){const A=(PS.timing[a.id]||a.anchors||[]).slice().sort((x,y)=>x.b-y.b),spb=60/a.bpm;
  const t=b=>{if(!A.length)return a.start+b*spb;if(b<=A[0].b)return A[0].t+(b-A[0].b)*spb;for(let i=0;i<A.length-1;i++){const p=A[i],q=A[i+1];if(b<=q.b)return p.t+(b-p.b)*(q.t-p.t)/(q.b-p.b);}const L=A[A.length-1];return L.t+(b-L.b)*spb;};
  const b=x=>{if(!A.length)return(x-a.start)/spb;if(x<=A[0].t)return A[0].b+(x-A[0].t)/spb;for(let i=0;i<A.length-1;i++){const p=A[i],q=A[i+1];if(x<=q.t)return p.b+(x-p.t)*(q.b-p.b)/(q.t-p.t);}const L=A[A.length-1];return L.b+(x-L.t)/spb;};
  return{t,b,A};}

/* ---------- media: a YouTube recording or a demo the app plays itself ---------- */
const YTM={p:null,load(){if(this.p)return this.p;this.p=new Promise((res,rej)=>{if(window.YT&&YT.Player)return res(YT);const prev=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{try{prev&&prev();}catch(e){}res(YT);};const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>{this.p=null;rej(new Error('offline'));};document.head.appendChild(s);
    setTimeout(()=>{if(!(window.YT&&YT.Player)){this.p=null;rej(new Error('timeout'));}},8000);});return this.p;}};
const YT_ERR={2:'This link doesn’t point to a playable video.',5:'This video can’t play here.',100:'This video was removed or made private.',101:'The owner doesn’t allow this video to play inside other apps.',150:'The owner doesn’t allow this video to play inside other apps.'};
function ytWhy(){const preview=window.top!==window&&!/fretopia\.vercel\.app$/.test(location.hostname);
  return preview?'Videos can’t play inside this preview. Open fretopia.vercel.app to play along.':navigator.onLine===false?'You’re offline. Connect to the internet to load the video.':'The video didn’t load. Your network or a content blocker may be stopping YouTube.';}
/* a plain YouTube embed driven over postMessage, the same messages YouTube's own player script sends */
function ytBridge(m,host,vid,on){return new Promise((res,rej)=>{const f=document.createElement('iframe'),O='https://www.youtube.com',org=/^https?:$/.test(location.protocol)?location.origin:'';
  f.src=`${O}/embed/${vid}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&fs=0&iv_load_policy=3&controls=1&widgetid=1${org?'&origin='+encodeURIComponent(org):''}`;
  f.allow='autoplay; encrypted-media; picture-in-picture';f.title='YouTube video';f.setAttribute('frameborder','0');host.innerHTML='';host.appendChild(f);
  const st={t:0,state:-1,rate:1,dur:0,data:{}};let ready=false,dead=false;
  const post=o=>{try{f.contentWindow.postMessage(JSON.stringify(Object.assign({id:1,channel:'widget'},o)),O);}catch(e){}};
  const cmd=(func,args=[])=>post({event:'command',func,args});
  const onMsg=e=>{if(e.source!==f.contentWindow||!/youtube/.test(e.origin))return;let d;try{d=typeof e.data==='string'?JSON.parse(e.data):e.data;}catch(_){return;}if(!d||!d.event)return;
    const i=d.info||{};
    if(d.event==='initialDelivery'||d.event==='infoDelivery'){if(i.currentTime!=null)st.t=i.currentTime;if(i.playbackRate)st.rate=i.playbackRate;if(i.duration)st.dur=i.duration;if(i.videoData)st.data=i.videoData;
      if(i.playerState!=null&&i.playerState!==st.state){st.state=i.playerState;m.state=st.state;m.raw=-1;if(ready)on.state&&on.state(st.state,m);}}
    if(d.event==='onStateChange'&&typeof d.info==='number'&&d.info!==st.state){st.state=d.info;m.state=d.info;m.raw=-1;on.state&&on.state(d.info,m);}
    if((d.event==='onReady'||d.event==='initialDelivery')&&!ready){ready=true;clearInterval(hello);clearTimeout(to);['onReady','onStateChange','onError','onPlaybackRateChange'].forEach(ev=>post({event:'addEventListener',args:[ev]}));m.ready=true;res(m);on.ready&&on.ready(m);}
    if(d.event==='onError'){m.err=YT_ERR[d.info]||'This video can’t play here.';on.error&&on.error(m.err,m);}};
  addEventListener('message',onMsg);
  const hello=setInterval(()=>post({event:'listening'}),250);f.addEventListener('load',()=>post({event:'listening'}));
  const to=setTimeout(()=>{if(!ready){clearInterval(hello);removeEventListener('message',onMsg);dead=true;rej(new Error('nobridge'));}},15000);
  m.p={getCurrentTime:()=>st.t,getPlayerState:()=>st.state,getPlaybackRate:()=>st.rate,getDuration:()=>st.dur,getVideoData:()=>st.data||{},
    playVideo:()=>cmd('playVideo'),pauseVideo:()=>cmd('pauseVideo'),seekTo:(t,a)=>{st.t=t;cmd('seekTo',[t,a!==false]);},setPlaybackRate:r=>{st.rate=r;cmd('setPlaybackRate',[r]);},
    mute:()=>cmd('mute'),unMute:()=>cmd('unMute'),destroy:()=>{clearInterval(hello);clearTimeout(to);removeEventListener('message',onMsg);f.remove();}};});}
function ytMedia(host,vid,on={}){const m={kind:'yt',vid,ready:false,err:null,p:null,base:0,wall:0,raw:-1,rate:1,
  /* YouTube's player script first; if it can't load, talk to a plain embed directly */
  load(){host.innerHTML='<div class="vload">Loading video…</div>';
    const viaApi=()=>YTM.load().then(YT=>new Promise((res,rej)=>{const d=document.createElement('div');host.innerHTML='';host.appendChild(d);
      const pv={playsinline:1,rel:0,modestbranding:1,controls:1,fs:0,iv_load_policy:3};if(/^https?:$/.test(location.protocol))pv.origin=location.origin;
      const to=setTimeout(()=>{if(!m.ready&&!m.err){try{m.p&&m.p.destroy();}catch(e){}m.p=null;rej(new Error('noplayer'));}},12000);
      m.p=new YT.Player(d,{videoId:vid,width:'100%',height:'100%',playerVars:pv,events:{onReady:()=>{clearTimeout(to);m.ready=true;res(m);on.ready&&on.ready(m);},
        onStateChange:e=>{m.state=e.data;m.raw=-1;on.state&&on.state(e.data,m);},onError:e=>{clearTimeout(to);m.err=YT_ERR[e.data]||'This video can’t play here.';res(m);on.error&&on.error(m.err,m);}}});}));
    return viaApi().catch(()=>ytBridge(m,host,vid,on)).catch(()=>{m.err=ytWhy();host.innerHTML=`<div class="vload">${esc(m.err)}</div>`;on.error&&on.error(m.err,m);return m;});},
  playing(){return m.p&&m.p.getPlayerState&&m.p.getPlayerState()===1;},
  /* a smooth clock from YouTube's coarse position reports */
  now(){if(!m.p||!m.p.getCurrentTime)return 0;const r=m.p.getCurrentTime(),w=performance.now()/1000;if(!m.playing()){m.base=r;m.wall=w;m.raw=r;return r;}
    m.rate=m.p.getPlaybackRate?m.p.getPlaybackRate():1;const pred=m.base+(w-m.wall)*m.rate;if(r!==m.raw){m.raw=r;const e=r-pred;if(Math.abs(e)>.3){m.base=r;m.wall=w;return r;}m.base=pred+e*.12;m.wall=w;return m.base;}return pred;},
  play(){try{m.p&&m.p.playVideo();}catch(e){}},pause(){try{m.p&&m.p.pauseVideo();}catch(e){}},seek(t){try{m.p&&m.p.seekTo(Math.max(0,t),true);m.base=t;m.wall=performance.now()/1000;m.raw=-1;}catch(e){}},
  rateTo(r){try{m.p&&m.p.setPlaybackRate(r);}catch(e){}},vol(on){try{on?m.p.unMute():m.p.mute();}catch(e){}},dur(){try{return m.p.getDuration()||0;}catch(e){return 0;}},
  title(){try{const d=m.p.getVideoData();return{title:d.title||'',author:d.author||''};}catch(e){return{title:'',author:''};}},
  destroy(){try{m.p&&m.p.destroy();}catch(e){}m.p=null;}};return m;}
/* the app's own rendition of a public-domain tune */
function demoEvents(key){const D=DEMO_SONGS[key];if(D._ev)return D._ev;const ev=[];
  D.bars.forEach((c,i)=>{const b0=i*D.meter,sh=CHORD_SHAPES[c];if(!sh)return;const ms=sh.map((f,k)=>f<0?null:OPEN[k]+f).filter(x=>x!=null);
    ev.push({b:b0,bass:ms[0]});for(let k=0;k<D.meter;k+=D.meter===3?1:2)ev.push({b:b0+k,ch:ms.slice(1),soft:k>0});});
  D.mel.forEach((bar,i)=>{let b=i*D.meter;for(const tok of bar.split(/\s+/)){const[nm,du]=tok.split(':'),d=du?+du:1;if(nm!=='r')ev.push({b,mel:nameMidi(nm),d});b+=d;}});
  ev.sort((x,y)=>x.b-y.b);return D._ev=ev;}
function playDemoEv(e,spb,vol=1){if(!ready()||vol<=0)return;if(e.bass!=null)guitarNote(e.bass-12>=40?e.bass-12:e.bass,.3*vol,0,spb*2);
  if(e.ch)e.ch.forEach((m,i)=>guitarNote(m,(e.soft?.1:.15)*vol,i*.018,spb*1.6));
  if(e.mel!=null){const f=midiHz(e.mel+12),v=flute(f,.075*vol);setTimeout(()=>v.stop(),Math.max(.12,e.d*spb*.92)*1000);}}
function demoMedia(key){const D=DEMO_SONGS[key],spb=60/D.bpm,ev=demoEvents(key);const m={kind:'demo',ready:true,t:0,run:false,last:0,rate:1,on:true,
  load(){return Promise.resolve(m);},playing(){return m.run;},
  now(){if(m.run){const n=ctx.currentTime,dt=Math.min(.25,n-m.last);m.last=n;const p=m.t;m.t+=dt*m.rate;if(m.on)for(const e of ev){const tt=e.b*spb;if(tt>=p&&tt<m.t)playDemoEv(e,spb);}if(m.t>=m.dur())m.run=false;}return m.t;},
  play(){ac();m.run=true;m.last=ctx.currentTime;},pause(){m.run=false;},seek(t){m.t=clamp(t,0,m.dur());},rateTo(r){m.rate=r;},vol(on){m.on=on;},
  dur(){return D.bars.length*D.meter*spb;},title(){return{title:'',author:''};},destroy(){m.run=false;}};return m;}
function mediaFor(r,host,on){if(r.src==='yt')return ytMedia(host,r.vid,on);return demoMedia(r.demo);}

/* ---------- screens above the instrument home ---------- */
const PUI={stack:[]};
function pushScreen(render){const el=document.createElement('section');el.className='scene ps';el.setAttribute('role','dialog');SCREEN.appendChild(el);el.render=()=>render(el);render(el);void el.offsetWidth;el.classList.add('enter');PUI.stack.push(el);return el;}
function popScreen(n=1){for(let i=0;i<n;i++){const el=PUI.stack.pop();if(!el)break;el.cleanup&&el.cleanup();if(i===n-1){el.classList.add('leave');setTimeout(()=>el.remove(),320);}else el.remove();}
  const top=PUI.stack[PUI.stack.length-1];if(top&&top.render)top.render();else renderHome();}
function popAll(){while(PUI.stack.length){const el=PUI.stack.pop();el.cleanup&&el.cleanup();el.remove();}renderHome();}
function topBar(right=''){return `<div class="top"><button class="ib" data-back aria-label="Back">${PIC.back}</button>${right||'<span></span>'}</div>`;}
function wireBack(el,fn){el.querySelector('[data-back]').onclick=fn||(()=>popScreen());}
/* tick screens that show a live clock */
function screenLoop(){const top=PUI.stack[PUI.stack.length-1];if(top&&top.tick&&!$('#player'))top.tick();requestAnimationFrame(screenLoop);}requestAnimationFrame(screenLoop);

/* ================= home tabs ================= */
const Parts={};
/* Songs tab (guitar): where you left off, saved parts, and real recordings */
Parts.songsTop=function(box){const ql=(HV.sq||'').trim().toLowerCase(),q=HV.sq||'';
  const recs=allRecs().filter(r=>!ql||(r.song+' '+r.artist+' '+r.kind).toLowerCase().includes(ql));
  const last=PS.last&&arrOf(PS.last.arr),lr=last&&recOf(last.rec),la=last&&lastAttempt(last.id);
  const nSaved=Object.keys(PS.saved).filter(id=>arrOf(id)).length;
  box.innerHTML=`${!ql&&last&&lr?`<button class="next" data-resume><span class="eyebrow">Pick up where you left off</span><b>${esc(lr.song)} · ${esc(last.section)}</b><span class="meta">${esc(last.part)} · ${esc(last.level)}${la?' · '+attemptLine(la):''}</span><span class="go">${IC.play}</span></button>`:''}
    ${!ql?`<div class="list qrows"><button class="row" data-go="practice"><span class="t"><b>My practice</b><small>${nSaved?nSaved+' saved part'+(nSaved>1?'s':''):'Parts you save after playing'}</small></span><span class="r">${PIC.chev}</span></button></div>`:''}
    <h3 class="sh">Real songs</h3><p class="shsub">Play one part along with the original recording</p>
    <div class="list">${recs.map(r=>{const n=arrsFor(r.id).length;return `<button class="row rrow" data-rec="${esc(r.id)}">${thumb(r)}<span class="t"><b>${esc(r.song)}</b><small>${esc(r.artist)} · ${esc(r.kind)}${recDur(r)?' · '+fmtT(recDur(r)):''}</small></span><span class="r">${n?n+' part'+(n>1?'s':''):'New'}</span></button>`;}).join('')||`<p class="empty">No recordings match “${esc(q)}”.</p>`}</div>`;
  box.onclick=e=>{const r=e.target.closest('[data-rec]');if(r)return openRecording(r.dataset.rec);if(e.target.closest('[data-go="practice"]'))return openPractice();if(e.target.closest('[data-resume]')&&last)playArr(last);};};
/* Create tab (guitar) */
Parts.renderCreate=function(box){const drafts=Object.values(PS.drafts).filter(d=>recOf(d.rec)).sort((x,y)=>y.at-x.at),mine=Object.values(PS.arrs).filter(a=>recOf(a.rec)).sort((x,y)=>(y.publishedAt||0)-(x.publishedAt||0));
  const row=(a,attr,sub)=>{const r=recOf(a.rec);return `<button class="row rrow" ${attr}>${thumb(r)}<span class="t"><b>${esc(r.song)} · ${esc(a.section)}</b><small>${sub}</small></span><span class="r">${PIC.chev}</span></button>`;};
  box.innerHTML=`<button class="next" data-go="create"><span class="eyebrow">New arrangement</span><b>Chart a song part</b><span class="meta">Paste a YouTube link, mark the passage, then write chords or tab</span><span class="go">${PIC.plus}</span></button>
    <h3 class="sh">Drafts</h3><div class="list">${drafts.map(d=>row(d,`data-draft="${d.id}"`,`${esc(d.part)} · ${esc(d.level)} · edited ${ago(d.at)}`)).join('')||'<p class="empty sm">Unfinished arrangements wait here.</p>'}</div>
    <h3 class="sh">Published by you</h3><div class="list">${mine.map(a=>row(a,`data-mine="${a.id}"`,`${esc(a.part)} · ${esc(a.level)} · version ${a.rev||1}`)).join('')||'<p class="empty sm">Arrangements you publish show up here and under their song.</p>'}</div>
    <h3 class="sh">Your own melody</h3><button class="import" id="imp">Import a MIDI file</button><input type="file" id="impf" accept=".mid,.midi,audio/midi,audio/x-midi" hidden>
    <p class="fine">Everything you make stays on this phone. Use files you have the rights to.</p>`;
  $('#imp',box).onclick=()=>$('#impf',box).click();$('#impf',box).onchange=e=>importMidi(e.target.files[0]);
  box.onclick=e=>{if(e.target.closest('[data-go="create"]'))return openCreate();const d=e.target.closest('[data-draft]');if(d)return openEditor(d.dataset.draft);const m=e.target.closest('[data-mine]');if(m){const a=arrOf(m.dataset.mine);return openRecording(a.rec,a.id);}};};

/* ================= recording: choose an arrangement ================= */
const LEVELS=['Beginner','Intermediate','Advanced'],PARTS=['Rhythm','Lead','Fingerstyle'];
function openRecording(rid,selId){const r=recOf(rid);if(!r)return;const F={level:'',section:'',part:''};let media=null,previewing=false,sel=selId||PS.sel[rid]||null;
  return pushScreen(el=>{
    if(!el.built){el.built=true;el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>${esc(r.song)}</h1><p>${esc(r.artist)} · ${esc(r.kind)}${recDur(r)?' · '+fmtT(recDur(r)):''}</p></header>
        ${r.src==='yt'?`<div class="vbox" id="rv"><img alt="" src="https://i.ytimg.com/vi/${r.vid}/hqdefault.jpg"><span class="vplay">${IC.play}</span></div>`:`<div class="demobar"><span class="th demo">${PIC.note}</span><span>Played by Fretopia on guitar and flute. Timing is exact.</span></div>`}
        <div id="rdyn"></div></div><div class="dock" id="rdock"></div>`;
      wireBack(el);el.cleanup=()=>{media&&media.destroy();media=null;};
      el.tick=()=>{if(media&&previewing){const t=media.now();if(t>=previewing.end-.02){media.pause();previewing=false;}}};
      el.onclick=e=>onClick(e);}
    const all=arrsFor(rid),secs=[...new Set(all.map(a=>a.section))];const list=all.filter(a=>(!F.level||a.level===F.level)&&(!F.section||a.section===F.section)&&(!F.part||a.part===F.part));
    if(!list.some(a=>a.id===sel))sel=list[0]?list[0].id:null;const cur=sel&&arrOf(sel),anyF=F.level||F.section||F.part;
    $('#rdyn',el).innerHTML=`${all.length?`<div class="chips fl"><button class="opt" data-f="level" aria-pressed="${!!F.level}">${F.level||'Difficulty'}</button><button class="opt" data-f="section" aria-pressed="${!!F.section}">${esc(F.section)||'Section'}</button><button class="opt" data-f="part" aria-pressed="${!!F.part}">${F.part||'Part'}</button>${anyF?'<button class="opt clr" data-clear>Clear filters</button>':''}</div>`:''}
      <div id="arrs">${!all.length?`<div class="emptybox"><b>No arrangements yet</b><p>Be the first to chart a part of this recording. Eight bars, a few notes or the whole song all count.</p></div>`:
        !list.length?`<p class="empty">No arrangements match these filters.</p>`:list.map(a=>`<div class="arow${a.id===sel?' on':''}" data-arr="${a.id}" role="radio" aria-checked="${a.id===sel}" tabindex="0">
          <span class="t"><b>${esc(a.section)} · ${esc(a.part)} · ${esc(a.level)}</b><small>by ${esc(a.author)} · ${TUNINGS[a.tuning||'std'].name}${a.capo?' · capo '+a.capo:''} · ${Math.round(arrLen(a))} s</small><span class="goal">${esc(a.goal||'')}</span>
          ${r.src==='yt'&&!isChecked(a)?'<span class="tag">Timing not checked</span>':''}${PS.saved[a.id]?'<span class="tag mute">Saved</span>':''}</span>
          <button class="ib pv" data-prev="${a.id}" aria-label="Hear this passage">${IC.ear}</button></div>`).join('')}</div>
      <div class="links">${cur&&r.src==='yt'?`<button class="lnk" data-sync>${isChecked(cur)?'Adjust timing':'Check timing'}</button>`:''}${cur&&PS.arrs[cur.id]?'<button class="lnk" data-editarr>Edit this arrangement</button>':''}${sameSong(r).length?`<button class="lnk" data-other>Other recordings</button>`:''}</div>`;
    $('#rdock',el).innerHTML=all.length?`<button class="cta" data-play ${cur?'':'disabled'}><span class="lbl">Play arrangement</span></button><button class="import" data-new>Create another arrangement</button>`:`<button class="cta" data-new><span class="lbl">Create the first arrangement</span></button>`;
    function startPreview(a){if(r.src==='yt'){const go=()=>{media.seek(tmap(a).t(0));media.play();previewing={a,end:a.end};};
        if(!media){media=ytMedia($('#rv',el),r.vid,{});media.load().then(()=>{if(!media.err)go();});}else if(media.ready&&!media.err)go();}
      else{media=media||demoMedia(r.demo);media.seek(a.start);media.play();previewing={a,end:a.end};}}
    function onClick(e){const pv=e.target.closest('[data-prev]');if(pv){e.stopPropagation();sel=pv.dataset.prev;PS.sel[rid]=sel;startPreview(arrOf(sel));el.render();return;}
      const row=e.target.closest('[data-arr]');if(row){sel=row.dataset.arr;PS.sel[rid]=sel;savePS();el.render();return;}
      const f=e.target.closest('[data-f]');if(f){const k=f.dataset.f,secs=[...new Set(arrsFor(rid).map(a=>a.section))],opts=k==='level'?LEVELS:k==='part'?PARTS:secs;
        sheet(`<span class="grab"></span><p class="eyebrow">Filter</p><h2>${k==='level'?'Difficulty':k==='part'?'Part':'Section'}</h2><div class="pick">${['',...opts].map(o=>`<button class="row" data-v="${esc(o)}"><span class="t"><b>${o?esc(o):'Any'}</b></span>${F[k]===o?'<span class="r">✓</span>':''}</button>`).join('')}</div>`);
        $('#sheet').onclick=ev=>{const b=ev.target.closest('[data-v]');if(b){F[k]=b.dataset.v;closeSheet();el.render();}else if(ev.target.id==='sheet')closeSheet();};return;}
      if(e.target.closest('[data-clear]')){F.level=F.section=F.part='';el.render();return;}
      const cur=sel&&arrOf(sel);
      if(e.target.closest('#rv')&&!media){startPreview(cur||{start:0,end:recDur(r),bpm:60,anchors:[{b:0,t:0}],id:'_'});return;}
      if(e.target.closest('[data-play]')&&cur){media&&media.pause();playArr(cur);return;}
      if(e.target.closest('[data-new]')){media&&media.pause();openMark({rec:r,from:cur});return;}
      if(e.target.closest('[data-sync]')&&cur){media&&media.pause();openSync(null,cur);return;}
      if(e.target.closest('[data-editarr]')&&cur){media&&media.pause();editPublished(cur);return;}
      if(e.target.closest('[data-other]'))return openSongRecs(r);}});}
function sameSong(r){return allRecs().filter(x=>x.id!==r.id&&x.song.toLowerCase()===r.song.toLowerCase());}
function openSongRecs(r){pushScreen(el=>{el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>${esc(r.song)}</h1><p>Every recording has its own timing, so charts never move between them.</p></header><div class="list">${[r,...sameSong(r)].map(x=>{const n=arrsFor(x.id).length;return `<button class="row rrow" data-rec="${esc(x.id)}">${thumb(x)}<span class="t"><b>${esc(x.kind)}</b><small>${esc(x.artist)}${recDur(x)?' · '+fmtT(recDur(x)):''}</small></span><span class="r">${n?n+' part'+(n>1?'s':''):'New'}</span></button>`;}).join('')}</div></div>`;
  wireBack(el);el.onclick=e=>{const b=e.target.closest('[data-rec]');if(b){popScreen();openRecording(b.dataset.rec);}};});}

/* ================= practice one part ================= */
function partSong(a,o={}){const r=recOf(a.rec);return{id:'part:'+a.id,title:a.section,kind:a.mode==='tab'?'tab':'chords',bpm:a.bpm,coll:'part',
  part:Object.assign({a,r,map:tmap(a),yt:r.src==='yt',loop:false,song:true,passes:0,seeked:false},o)};}
function playArr(a,o={}){PS.last={arr:a.id,at:Date.now()};savePS();const s=partSong(a,o);Player.open(s,[s],o.challenge?{challenge:o.challenge}:null);}
Parts.notes=function(P){const a=P.a,tun=TUNINGS[a.tuning||'std'].m,capo=a.capo||0,out=[];let prev=null;
  const ev=[...a.ev].sort((x,y)=>x.b-y.b||(x.s||0)-(y.s||0));
  if(a.mode==='tab'){for(const e of ev){const midi=tun[e.s]+capo+e.f;out.push({midi,s:e.s,f:e.f,start:e.b,beats:Math.max(.25,e.d||1)});}}
  else for(let i=0;i<ev.length;i++){const e=ev[i],nx=ev[i+1],sh=CHORD_SHAPES[e.c]||[],d=e.d!=null?e.d:(nx?nx.b:a.bars*a.meter)-e.b;
    out.push({chord:e.c,snd:transposeChord(e.c,capo),capo,shape:sh,midis:sh.map((f,k)=>f<0?null:tun[k]+capo+f).filter(x=>x!=null),start:e.b,beats:Math.max(.25,d),strum:e.st,same:prev===e.c});prev=e.c;}
  /* a guitarist plays chords and notes in order: if two notes share a start (a dyad), keep them both */
  return{notes:out,total:Math.max(a.bars*a.meter,...out.map(n=>n.start+n.beats))};};
/* set up the player for a part: video, loop, seek bar, time */
Parts.decorate=function(P,el){const p=P.part,a=p.a,r=p.r;
  el.querySelector('.pl-title small').textContent=p.preview?'Preview · not scored':`${a.part} · ${a.level} · ${fmtT(a.start)}–${fmtT(a.end)}`;
  el.querySelector('.pl-meta').innerHTML=`<span>Time <b id="plTime">0:00 / ${fmtT(arrLen(a)/P.speed)}</b></span><span>Accuracy <b id="plAcc">–</b></span>`;
  const prog=el.querySelector('.pl-prog');prog.classList.add('seek');prog.insertAdjacentHTML('beforeend','<span class="knob"></span>');
  if(p.yt){el.classList.add('has-vid');const v=document.createElement('div');v.className='pl-vid';v.id='plVid';prog.after(v);
    p.media=ytMedia(v,r.vid,{state:(s)=>Parts.ytState(P,s),error:er=>Parts.videoFail(P,er)});
    p.media.load().then(m=>{if(!m.err){m.seek(p.map.t(-4));m.pause();}});}
  /* drag to seek inside the passage; the attempt is then marked unscored */
  let drag=null;const at=e=>{const R=prog.getBoundingClientRect(),vert=R.height>R.width;return clamp(vert?(e.clientY-R.top)/R.height:(e.clientX-R.left)/R.width,0,1);};
  prog.addEventListener('pointerdown',e=>{if(P.challenge)return;drag={f:at(e)};prog.setPointerCapture(e.pointerId);$('#plProg').style.width=drag.f*100+'%';});
  prog.addEventListener('pointermove',e=>{if(!drag)return;drag.f=at(e);$('#plProg').style.width=drag.f*100+'%';});
  prog.addEventListener('pointerup',()=>{if(!drag)return;Parts.seekTo(P,drag.f*P.total);drag=null;});};
Parts.videoFail=function(P,er){const p=P.part,v=$('#plVid');p.err=er;if(!v)return;P.pause();
  v.innerHTML=`<div class="vfail"><p>${esc(er)}</p><div><button class="vbtn" data-vretry>Try again</button><button class="vbtn pri" data-vnone>Play without video</button></div></div>`;
  v.querySelector('[data-vretry]').onclick=()=>{p.err=null;p.media&&p.media.destroy();p.media=ytMedia(v,p.r.vid,{state:s=>Parts.ytState(P,s),error:e=>Parts.videoFail(P,e)});p.media.load().then(m=>{if(!m.err){m.seek(p.map.t(Math.max(-4,P.t)));m.pause();}});};
  v.querySelector('[data-vnone]').onclick=()=>{p.media&&p.media.destroy();p.media=null;p.yt=false;p.novideo=true;v.remove();$('#player').classList.remove('has-vid');P.msg('Timing follows the tempo, not the recording');};};
Parts.ytState=function(P,s){const p=P.part;if(!p||!$('#player'))return;const mine=performance.now()-(p.own||0)<700;
  if(s===2&&P.running&&!mine){P.running=false;P.btn();}
  if(s===1&&!P.running&&!mine&&!P.ended){P.running=true;P.lastAudio=ctx.currentTime;P.btn();}};
Parts.opts=function(P){const p=P.part,b=(c,l,on)=>`<button class="opt" data-c="${c}" aria-pressed="${on}">${l}</button>`;
  const o=[b('pmic','Mic '+(P.mode==='mic'?'on':'off'),P.mode==='mic'),b('loop','Loop',p.loop),b('speed',Math.round(P.speed*100)+'%',P.speed!==1),b('song','Song',p.song)];
  if(!p.yt)o.push(b('wait','Wait for me',P.wait));$('#plOpts').innerHTML=o.join('');};
Parts.optClick=function(P,c){const p=P.part;
  if(c==='pmic'){if(P.mode==='mic'){P.mode='off';Mic.stop();P.opts();P.pad();P.hud();}else{Mic.start().then(ok=>{if(ok){P.mode='mic';P.msg(p.yt?'Listening. Headphones keep the song out of the mic.':'Listening');}else{P.mode='off';P.msg(micWhy()+' You can still play along.');}P.opts();P.pad();});}return true;}
  if(c==='loop'){p.loop=!p.loop;P.opts();if(!p.loop&&P.running)toast('This pass will finish, then stop');return true;}
  if(c==='song'){p.song=!p.song;if(p.media)p.media.vol(p.song);P.opts();return true;}
  if(c==='speed'){P.speed=P.speed===1?.75:P.speed===.75?.5:1;if(p.media)p.media.rateTo(P.speed);P.opts();Parts.timeLabel(P);return true;}
  return false;};
Parts.timeLabel=function(P){const el=$('#plTime');if(!el)return;const a=P.part.a,len=arrLen(a),f=clamp(P.t/P.total,0,1);el.textContent=`${fmtT(f*len)} / ${fmtT(len)}`;};
Parts.onStart=function(P){const p=P.part;if(!p)return;p.own=performance.now();
  if(p.yt){const m=p.media;if(!m||!m.ready||m.err){P.running=false;P.btn();P.msg(p.err||'The video is still loading');return;}m.rateTo(P.speed);m.vol(p.song);if(P.t<=-3.99)m.seek(p.map.t(-4));m.play();}};
Parts.onPause=function(P){const p=P.part;if(p&&p.yt&&p.media){p.own=performance.now();p.media.pause();}};
Parts.onReset=function(P){const p=P.part;if(!p)return;p.seeked=false;p.heard=0;p.frames=0;if(p.yt&&p.media&&p.media.ready&&!p.media.err){p.own=performance.now();p.media.pause();p.media.seek(p.map.t(-4));}Parts.timeLabel(P);};
Parts.onClose=function(P){Clip.stop();const p=P.part;if(p&&p.media)p.media.destroy();setTimeout(()=>{const top=PUI.stack[PUI.stack.length-1];if(top&&top.render&&!$('#player'))top.render();},30);};
/* the part's clock: video position for YouTube recordings */
Parts.ytBeat=function(P){const p=P.part,m=p.media;if(!m||!m.ready||m.err)return P.t;const vt=m.now(),b=p.map.b(vt);
  if(p.lastVt!=null&&m.playing()&&Math.abs((vt-p.lastVt)-(ctx.currentTime-p.lastWall)*P.speed)>1.2){p.lastVt=vt;p.lastWall=ctx.currentTime;Parts.resync(P,b);return b;}
  p.lastVt=vt;p.lastWall=ctx.currentTime;return b;};
Parts.resync=function(P,t){P.part.seeked=true;P.notes.forEach(n=>{if(n.rest)return;if(n.start>=t)Object.assign(n,{frames:0,good:0,judged:false,state:null,unlocked:false,score:0,onsetOff:null,other:0,early:0,cw:0,cs:0});else if(!n.judged){n.judged=true;n.state='demo';n.score=0;}});
  P.nextIdx=P.notes.findIndex(n=>n.start>=t);if(P.nextIdx<0)P.nextIdx=P.notes.length;if(t>=0)P.nextTick=0;P.hud();};
Parts.seekTo=function(P,t){const p=P.part;t=clamp(t,0,P.total-.01);if(p.yt&&p.media){p.own=performance.now();p.media.seek(p.map.t(t));}P.t=t;Parts.resync(P,t);P.ended=false;Parts.timeLabel(P);toast('This run won’t be scored');};
/* each frame: the demo's own backing, the time label, how much the mic heard */
Parts.tick=function(P,prev){const p=P.part;if(!p)return;Parts.timeLabel(P);
  if(!p.yt&&p.r.src==='demo'&&p.song&&P.running&&!P.listen){const D=DEMO_SONGS[p.r.demo],spb=60/D.bpm,off=p.a.start/spb;for(const e of demoEvents(p.r.demo)){const bb=e.b-off;if(bb>=prev&&bb<P.t&&P.t>=-4)playDemoEv(e,spb/P.speed,.85);}}
  if(P.mode==='mic'&&P.t>=0){p.frames++;if(Mic.level>Mic.gate*1.2)p.heard++;}};
/* the end of the passage: loop or finish */
Parts.loop=function(P){const p=P.part;if(!p||!p.loop||p.preview||P.challenge)return false;p.passes++;Parts.recordPass(P,false);
  P.notes.forEach(n=>Object.assign(n,{frames:0,good:0,judged:false,state:null,unlocked:false,byMic:false,hits:{},score:0,onsetOff:null,other:0,early:0,cw:0,cs:0}));
  P.nextIdx=0;P.nextTick=0;P.streak=0;p.seeked=false;p.heard=0;p.frames=0;if(p.yt&&p.media){p.own=performance.now();p.media.seek(p.map.t(-1));P.t=-1;}else P.t=0;toast('Pass '+(p.passes+1));P.hud();return true;};
function scoreOf(P){const p=P.part,tot=P.notes.filter(n=>!n.rest);if(P.mode!=='mic'||(p&&p.seeked))return null;if(p&&p.frames>30&&p.heard/p.frames<.04)return null;
  return Math.round(tot.reduce((a,n)=>a+n.score,0)/Math.max(1,tot.length)*100);}
Parts.recordPass=function(P,last){const p=P.part,a=p.a,pct=scoreOf(P);const att={at:Date.now(),pct,speed:P.speed,mic:P.mode==='mic',done:true,unscored:P.mode==='mic'&&pct==null,rev:a.rev||1};
  (PS.attempts[a.id]=PS.attempts[a.id]||[]).push(att);if(PS.attempts[a.id].length>60)PS.attempts[a.id].shift();PS.last={arr:a.id,at:Date.now()};savePS();
  Game.record({completed:pct!=null,song:{id:'part-'+a.id,title:(p.r.song+' · '+a.section),coll:'part'},inst:'guitar',kind:P.kind,pct:pct||0,stars:pct==null?0:pct>=90?3:pct>=70?2:pct>=45?1:0,elapsed:P.elapsed,speed:P.speed,mode:P.mode});
  P.elapsed=0;P.recorded=true;return att;};
function lastAttempt(id){const L=PS.attempts[id];return L&&L[L.length-1];}
function attemptLine(t){return t.pct!=null?`last time ${t.pct}%`+(t.speed!==1?` at ${Math.round(t.speed*100)}%`:''):t.unscored?'last run unscored':'played '+ago(t.at);}
function ago(ts){const d=(Date.now()-ts)/864e5;return d<1?'today':d<2?'yesterday':Math.floor(d)+' days ago';}
/* what changed since last time, in plain words */
function progressLine(id,att){const L=(PS.attempts[id]||[]).slice(0,-1),prevS=[...L].reverse().find(x=>x.pct!=null);
  if(att.pct!=null&&prevS){const d=att.pct-prevS.pct,sp=att.speed-prevS.speed;if(sp>0&&d>=-5)return `Faster than last time: ${Math.round(prevS.speed*100)}% → ${Math.round(att.speed*100)}% speed`;
    return d>0?`Up ${d} points from last time (${prevS.pct}% → ${att.pct}%)`:d===0?`Same as last time: ${att.pct}%`:`${-d} points below last time. Try it at 75% speed.`;}
  if(att.pct!=null)return 'Your first scored run of this part';const n=L.length+1;return n===1?'First time through this part':`Run ${n} of this part`;}
Parts.finish=function(P){const p=P.part;if(p)Parts.onPause(P);
  if(P.challenge)return chFinish(P);
  if(p.preview){P.pause();p.onDone?p.onDone():null;return;}
  const a=p.a,att=Parts.recordPass(P,true),nx=a.next&&arrOf(a.next),saved=!!PS.saved[a.id];p.passes=0;
  const head=att.pct!=null?`<div class="sum"><div><small>Accuracy</small><b>${att.pct}%</b></div><div><small>Best run</small><b>${P.best}</b></div><div><small>Speed</small><b>${Math.round(P.speed*100)}%</b></div></div>`:
    `<p class="tipline" style="margin:16px 0 6px">${att.unscored?'We couldn’t hear you clearly enough to score this run. Move the phone closer or use headphones.':'Passage complete. Turn the mic on next time for a score.'}</p>
     <p class="eyebrow" style="margin-top:14px">How did it feel?</p><div class="chips feel" id="feel">${['Easy','Okay','Hard'].map(f=>`<button class="opt" data-feel="${f}" aria-pressed="false">${f}</button>`).join('')}</div>`;
  sheet(`<span class="grab"></span><p class="eyebrow">${att.pct==null?'Done':att.pct>=90?'Shabash':att.pct>=70?'Bahut badhiya':att.pct>=45?'Good start':'Keep practising'}</p><h2>${esc(a.section)} complete</h2>
    <p class="rs-sub">${Math.round(arrLen(a))} seconds · ${esc(a.part)} · ${esc(a.level)}</p>${head}
    <div class="rz-pr in"><b>${esc(progressLine(a.id,att))}</b></div>
    ${nx?`<button class="next nextv" id="shNextV"><span class="eyebrow">Next version of this part</span><b>${esc(nx.part)} · ${esc(nx.level)}</b><span class="meta">${esc(nx.goal||'')}</span><span class="go">${PIC.chev}</span></button>`:''}
    <div class="btns three"><button class="btn ic" id="shBack" aria-label="Back to arrangements">${IC.list}<span>Parts</span></button><button class="btn ic" id="shSave">${saved?PIC.bmOn:PIC.bm}<span>${saved?'Saved':'Save'}</span></button><button class="btn pri" id="shAgain">Play again</button></div>`);
  const fe=$('#feel');if(fe)fe.onclick=e=>{const b=e.target.closest('[data-feel]');if(!b)return;att.feel=b.dataset.feel;PS.feel[a.id]=att.feel;savePS();$$('#feel .opt').forEach(x=>x.setAttribute('aria-pressed',x===b));};
  $('#shAgain').onclick=()=>{closeSheet();P.reset();P.start(false);};
  $('#shBack').onclick=()=>{P.close();};
  $('#shSave').onclick=e=>{const b=e.currentTarget;if(PS.saved[a.id]){delete PS.saved[a.id];b.innerHTML=PIC.bm+'<span>Save</span>';}else{PS.saved[a.id]={rev:a.rev||1,at:Date.now()};b.innerHTML=PIC.bmOn+'<span>Saved</span>';toast('Saved to My practice');}savePS();};
  if(nx)$('#shNextV').onclick=()=>{closeSheet();P.close(true,true);playArr(nx);};};

/* ================= My practice ================= */
function openPractice(){pushScreen(el=>{const ids=Object.keys(PS.saved).filter(id=>arrOf(id)).sort((x,y)=>PS.saved[y].at-PS.saved[x].at);
  el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>My practice</h1><p>Pick up the guitar where you left off.</p></header>
    <div class="list">${ids.map(id=>{const a=arrOf(id),r=recOf(a.rec),t=lastAttempt(id),changed=(a.rev||1)!==PS.saved[id].rev;return `<button class="row rrow" data-arr="${id}">${thumb(r)}<span class="t"><b>${esc(r.song)} · ${esc(a.section)}</b><small>${esc(a.part)} · ${esc(a.level)}${t?' · '+attemptLine(t):''}${changed?' · updated':''}</small></span><span class="r">${IC.play}</span></button>`;}).join('')||'<p class="empty">Save a passage after playing it.</p>'}</div></div>
    <div class="dock"><button class="import" data-find>Find a song</button></div>`;
  wireBack(el);el.onclick=e=>{if(e.target.closest('[data-find]'))return popScreen();const b=e.target.closest('[data-arr]');if(!b)return;const id=b.dataset.arr,a=arrOf(id),sv=PS.saved[id];
    if((a.rev||1)!==sv.rev&&PS.revs[id+'@'+sv.rev]){sheet(`<span class="grab"></span><p class="eyebrow">This arrangement changed</p><h2>${esc(a.section)}</h2><p class="tipline" style="margin-top:8px">The author published version ${a.rev}. You saved version ${sv.rev}.</p><div class="btns"><button class="btn" id="vOld">My saved version</button><button class="btn pri" id="vNew">Updated version</button></div>`);
      $('#vOld').onclick=()=>{closeSheet();playArr(PS.revs[id+'@'+sv.rev]);};$('#vNew').onclick=()=>{closeSheet();PS.saved[id].rev=a.rev;savePS();playArr(a);};return;}
    playArr(a);};});}

/* ================= creator: choose a recording ================= */
function openCreate(){let vid=null,media=null,info=null,err=null,searching=false,sq='';
  pushScreen(el=>{
    if(!el.built){el.built=true;el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>Choose recording</h1><p>You can start with a song nobody has charted yet.</p></header>
        <div id="cpaste"><label class="field"><span>YouTube link</span><input class="inp" id="yl" inputmode="url" autocomplete="off" placeholder="https://youtu.be/…"></label><div id="cerr"></div><div class="vbox" id="cv" hidden></div><div id="cinfo"></div></div>
        <div id="csearch" hidden><label class="search">${ICS}<input id="csq" type="search" placeholder="Search songs and artists"></label><div class="list" id="cres"></div></div>
        <div class="links" id="clinks"></div></div><div class="dock" id="cdock"></div>`;
      wireBack(el);el.cleanup=()=>{media&&media.destroy();};
      $('#yl',el).addEventListener('input',e=>{const v=parseYT(e.target.value);if(v&&v!==vid){vid=v;info=null;err=null;load();}else if(!v&&e.target.value.trim().length>8){err='That doesn’t look like a YouTube link. It should contain youtu.be/ or watch?v=.';el.render();}else if(!e.target.value.trim()){err=null;el.render();}});
      $('#csq',el).addEventListener('input',e=>{sq=e.target.value;el.render();});
      el.onclick=e=>{const t=e.target;if(t.closest('[data-search]')){searching=true;el.render();setTimeout(()=>$('#csq',el).focus(),50);return;}if(t.closest('[data-paste]')){searching=false;el.render();return;}
        if(t.closest('[data-drafts]'))return openDrafts();
        const rr=t.closest('[data-rec]');if(rr){const r=recOf(rr.dataset.rec);searching=false;if(r.src==='yt'){$('#yl',el).value='https://youtu.be/'+r.vid;vid=r.vid;info={title:r.song,author:r.artist,dur:r.dur,song:r.song,artist:r.artist,known:true};err=null;load(true);}else{popScreen();openMark({rec:r});}return;}
        if(t.closest('[data-use]')&&info&&!err){const song=($('#csong',el)||{}).value||info.song,artist=($('#cart',el)||{}).value||info.artist,id='yt:'+vid;
          let r=recOf(id);if(!r){r={id,song:song.trim()||'Untitled',artist:artist.trim()||'Unknown artist',kind:'YouTube',src:'yt',vid,dur:Math.round(info.dur||0)};PS.recs[id]=r;savePS();}
          media&&media.destroy();media=null;popScreen();openMark({rec:r});}};}
    function load(known){media&&media.destroy();const box=$('#cv',el);box.hidden=false;media=ytMedia(box,vid,{ready:m=>{const t=m.title(),d=m.dur(),parts=t.title.split(/\s[-–|]\s/);
        if(!known)info={title:t.title,author:t.author,dur:d,song:(parts.length>1?parts[1]:t.title).replace(/\(.*?\)|\[.*?\]/g,'').trim(),artist:parts.length>1?parts[0].trim():t.author.replace(/VEVO$/,'').trim()};else info.dur=info.dur||d;err=null;el.render();},
      error:e=>{err=e;info=null;el.render();}});media.load();el.render();}
    $('#cpaste',el).hidden=searching;$('#csearch',el).hidden=!searching;
    $('#cerr',el).innerHTML=err?`<p class="err">${esc(err)}</p>`:'';
    $('#cinfo',el).innerHTML=info&&!err?`<label class="field"><span>Song</span><input class="inp" id="csong" value="${esc(info.song)}"></label><label class="field"><span>Artist</span><input class="inp" id="cart" value="${esc(info.artist)}"></label><p class="fine" style="text-align:left">${esc(info.title)}${info.dur?' · '+fmtT(info.dur):''}</p>`:vid&&!err?'<p class="fine">Loading the video…</p>':'';
    if(searching){const recs=allRecs().filter(r=>!sq||(r.song+' '+r.artist).toLowerCase().includes(sq.toLowerCase()));$('#cres',el).innerHTML=recs.map(r=>`<button class="row rrow" data-rec="${esc(r.id)}">${thumb(r)}<span class="t"><b>${esc(r.song)}</b><small>${esc(r.artist)} · ${esc(r.kind)}</small></span></button>`).join('')||'<p class="empty">No recordings match.</p>';}
    $('#clinks',el).innerHTML=searching?'<button class="lnk" data-paste>Paste a YouTube link instead</button>':'<button class="lnk" data-search>Search recordings instead</button><button class="lnk" data-drafts>My drafts</button>';
    $('#cdock',el).innerHTML=searching?'':`<button class="cta" data-use ${info&&!err?'':'disabled'}><span class="lbl">Use this recording</span></button>`;});}

/* ================= creator: mark the passage ================= */
const SECTIONS=['Intro','Verse','First chorus','Chorus','Bridge','Solo','Outro'];
function openMark({rec,from}){const d={id:uid('d'),rec:rec.id,section:from?from.section:'First chorus',part:from?from.part:'Rhythm',level:from?from.level:'Beginner',start:from?from.start:0,end:from?from.end:Math.min(16,recDur(rec)||16),
    bpm:from?from.bpm:90,meter:from?from.meter:4,bars:1,mode:from&&from.mode==='tab'?'tab':'chords',ev:[],anchors:[],tuning:'std',capo:from?from.capo||0:0,cur:{bar:0,cell:0,s:0},at:Date.now()};
  let media=null,active='start';
  pushScreen(el=>{
    if(!el.built){el.built=true;el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>Mark the passage</h1><p>${esc(rec.song)} · ${esc(rec.kind)}</p></header>
        ${rec.src==='yt'?'<div class="vbox" id="mv"></div>':''}
        <div class="transport"><button class="round big" data-pp aria-label="Play or pause">${IC.play}</button><div class="scrub" id="ms"><i id="msf"></i><span id="msa"></span><span id="msb"></span></div><span class="tnum" id="mnow">0:00.00</span></div>
        <div id="mdyn"></div></div><div class="dock" id="mdock"></div>`;
      wireBack(el);el.cleanup=()=>{media&&media.destroy();};
      media=rec.src==='yt'?ytMedia($('#mv',el),rec.vid,{}):demoMedia(rec.demo);media.load().then(()=>{if(!media.err)media.seek(d.start);});
      const sc=$('#ms',el),dur=()=>media.dur()||recDur(rec)||1,pos=e=>{const R=sc.getBoundingClientRect();return clamp((e.clientX-R.left)/R.width,0,1);};
      sc.onpointerdown=e=>{sc.setPointerCapture(e.pointerId);media.seek(pos(e)*dur());sc.onpointermove=ev=>media.seek(pos(ev)*dur());};sc.onpointerup=()=>{sc.onpointermove=null;};
      el.tick=()=>{const t=media.now(),D=dur();$('#msf',el).style.width=clamp(t/D*100,0,100)+'%';$('#msa',el).style.left=clamp(d.start/D*100,0,100)+'%';$('#msb',el).style.left=clamp(d.end/D*100,0,100)+'%';$('#mnow',el).textContent=fmtT2(t);
        const pp=el.querySelector('[data-pp]'),ic=media.playing()?IC.pause:IC.play;if(pp.innerHTML!==ic)pp.innerHTML=ic;};
      el.addEventListener('input',e=>{if(e.target.id==='msec'&&e.target.value.trim()){d.section=e.target.value.trim();$$('[data-sec]',el).forEach(x=>x.setAttribute('aria-pressed','false'));}});
      el.onclick=e=>{const t=e.target,D=media.dur()||recDur(rec)||1e9;
        if(t.closest('[data-pp]')){media.playing()?media.pause():media.play();return;}
        const st=t.closest('[data-set]');if(st){const k=st.dataset.set,now_=+media.now().toFixed(2);if(k==='start')d.start=now_;else d.end=now_;active=k;if(d.end<=d.start)toast('End must be after start');el.render();return;}
        const b=t.closest('[data-b]');if(b){active=b.dataset.b;el.render();return;}
        const n=t.closest('[data-n]');if(n){d[active]=clamp(+(d[active]+(+n.dataset.n)*.1).toFixed(2),0,D);if(active==='start'&&d.start>=d.end)d.start=+(d.end-.1).toFixed(2);if(active==='end'&&d.end<=d.start)d.end=+(d.start+.1).toFixed(2);media.seek(d[active]);el.render();return;}
        if(t.closest('[data-whole]')){d.start=0;d.end=+(media.dur()||recDur(rec)).toFixed(2);el.render();return;}
        const sec=t.closest('[data-sec]');if(sec){d.section=sec.dataset.sec;const i=$('#msec',el);if(i)i.value='';el.render();return;}
        const pt=t.closest('[data-part]');if(pt){d.part=pt.dataset.part;d.mode=d.part==='Rhythm'?'chords':'tab';el.render();return;}
        const lv=t.closest('[data-lvl]');if(lv){d.level=lv.dataset.lvl;el.render();return;}
        if(t.closest('[data-write]')&&d.end>d.start){media.pause();d.anchors=[{b:0,t:d.start}];
          if(rec.src==='demo'){const DS=DEMO_SONGS[rec.demo];d.bpm=DS.bpm;d.meter=DS.meter;}
          PS.drafts[d.id]=d;savePS();popScreen();openEditor(d.id);}};}
    const keep=$('#msec',el)&&$('#msec',el).value;
    $('#mdyn',el).innerHTML=`<div class="bounds"><button class="bnd${active==='start'?' on':''}" data-b="start"><small>Start</small><b class="tnum">${fmtT2(d.start)}</b><span class="set" data-set="start">Set start</span></button>
        <button class="bnd${active==='end'?' on':''}" data-b="end"><small>End</small><b class="tnum">${fmtT2(d.end)}</b><span class="set" data-set="end">Set end</span></button></div>
      <div class="frow"><span>Nudge ${active}</span><span class="step"><button class="mini" data-n="-1" aria-label="Earlier">−</button><button class="mini" data-n="1" aria-label="Later">+</button></span></div>
      <div class="frow"><span>Length <b class="tnum">${(d.end-d.start).toFixed(1)} s</b></span><button class="lnk" data-whole>Whole song</button></div>
      <h3 class="sh">Section</h3><div class="chips wrap">${SECTIONS.map(s=>`<button class="opt" data-sec="${s}" aria-pressed="${d.section===s}">${s}</button>`).join('')}</div>
      <label class="field"><span>Or name it</span><input class="inp" id="msec" value="${esc(keep||(SECTIONS.includes(d.section)?'':d.section))}" placeholder="Second chorus, solo, riff…"></label>
      <h3 class="sh">Part</h3><div class="chips wrap">${PARTS.map(s=>`<button class="opt" data-part="${s}" aria-pressed="${d.part===s}">${s}</button>`).join('')}</div>
      <h3 class="sh">Difficulty</h3><div class="chips wrap">${LEVELS.map(s=>`<button class="opt" data-lvl="${s}" aria-pressed="${d.level===s}">${s}</button>`).join('')}</div>`;
    $('#mdock',el).innerHTML=`<button class="cta" data-write ${d.end>d.start?'':'disabled'}><span class="lbl">${d.part==='Rhythm'?'Write chords':'Write tab'}</span></button>`;});}

/* ================= creator: the editor ================= */
const PALETTE=['G','C','D','Em','Am','F','E','A','Dm','Fmaj7','G7','C7','D7','E7','A7','B7','Am7','Em7','Bm','Bm7','Dsus4','Asus2','Cadd9','F#m'];
function draftOf(id){return PS.drafts[id];}
function saveDraft(d){d.at=Date.now();PS.drafts[d.id]=d;savePS();}
function openEditor(id){const d=draftOf(id);if(!d)return;const rec=recOf(d.rec);const hist=[];let pending='',taps=[],keyDur=2;
  const snap=()=>{hist.push(JSON.stringify({ev:d.ev,bars:d.bars}));if(hist.length>60)hist.shift();};
  const cellsPer=()=>d.meter*2,beatOf=(bar,cell)=>bar*d.meter+cell/2;
  const evAt=(bar,cell,s)=>d.ev.find(e=>Math.abs(e.b-beatOf(bar,cell))<1e-6&&(d.mode==='chords'?e.c!=null:e.s===s));
  pushScreen(el=>{el.isEd=true;const cp=cellsPer(),c=d.cur;c.bar=Math.min(c.bar,d.bars-1);const hint=Math.max(1,Math.round((d.end-d.start)*d.bpm/60/d.meter));
    const chordEvs=d.ev.filter(e=>e.c!=null),tabEvs=d.ev.filter(e=>e.s!=null);
    const cellHTML=(bar,k,s)=>{const b=beatOf(bar,k),on=c.bar===bar&&c.cell===k&&(d.mode==='chords'||c.s===s);
      if(d.mode==='chords'){const e=chordEvs.find(x=>Math.abs(x.b-b)<1e-6),inside=!e&&chordEvs.some(x=>x.b<b&&b<x.b+(x.d||0));return `<button class="cell${on?' sel':''}${k%2?'':' beat'}" data-cell="${bar},${k}">${e?`<span class="ev">${esc(e.c)}<i>${e.st==='U'?'↑':'↓'}</i></span>`:inside?'<span class="hold"></span>':''}</button>`;}
      const e=tabEvs.find(x=>x.s===s&&Math.abs(x.b-b)<1e-6),inside=!e&&tabEvs.some(x=>x.s===s&&x.b<b&&b<x.b+x.d);return `<button class="cell${on?' sel':''}${k%2?'':' beat'}" data-cell="${bar},${k},${s}">${e?`<span class="ev">${e.f}</span>`:inside?'<span class="hold"></span>':''}</button>`;};
    const bars=[];for(let bar=0;bar<d.bars;bar++){if(d.mode==='chords')bars.push(`<div class="gbar${c.bar===bar?' cur':''}"><small>${bar+1}</small><div class="grow">${Array.from({length:cp},(_,k)=>cellHTML(bar,k)).join('')}</div></div>`);
      else bars.push(`<div class="gbar${c.bar===bar?' cur':''}"><small>${bar+1}</small>${[5,4,3,2,1,0].map(s=>`<div class="grow">${Array.from({length:cp},(_,k)=>cellHTML(bar,k,s)).join('')}</div>`).join('')}</div>`);}
    const selEv=evAt(c.bar,c.cell,c.s)||(d.mode==='chords'?d.ev.filter(x=>x.c!=null&&x.b<beatOf(c.bar,c.cell)).sort((x,y)=>y.b-x.b)[0]:null);
    el.innerHTML=topBar(`<button class="ib" data-preview aria-label="Preview">${IC.play}</button>`)+`<div class="hscroll ed">
      <header class="h-head"><h1>Edit arrangement</h1><p>${esc(d.section)} · ${fmtT(d.start)}–${fmtT(d.end)} · ${esc(rec.song)}</p></header>
      <div class="chips"><button class="opt" data-mode="chords" aria-pressed="${d.mode==='chords'}">Chords</button><button class="opt" data-mode="tab" aria-pressed="${d.mode==='tab'}">Tab</button><span class="fine inl">${d.bars} bar${d.bars>1?'s':''} · passage ≈ ${hint} at ${d.bpm} BPM</span></div>
      <div class="grid${d.mode==='tab'?' tab':''}" id="grid">${d.mode==='tab'?`<div class="slab">${['e','B','G','D','A','E'].map(x=>`<span>${x}</span>`).join('')}</div>`:''}${bars.join('')}</div>
      ${d.mode==='chords'?`<div class="pal">${PALETTE.map(x=>`<button class="opt" data-ch="${esc(x)}" aria-pressed="${selEv&&selEv.c===x}">${esc(x)}</button>`).join('')}</div>
        <div class="frow"><span>Strum</span><span class="step"><button class="opt" data-st="D" aria-pressed="${!selEv||selEv.st!=='U'}">↓ Down</button><button class="opt" data-st="U" aria-pressed="${!!(selEv&&selEv.st==='U')}">↑ Up</button></span></div>`:
        `<div class="kp">${[1,2,3,4,5,6,7,8,9,0].map(n=>`<button data-k="${n}">${n}</button>`).join('')}<button data-k="del" aria-label="Remove note">⌫</button><button data-k="rest">Rest</button></div>
        <div class="frow"><span>Note length</span><span class="step">${[[1,'⅛'],[2,'¼'],[4,'½'],[8,'1']].map(([v,l])=>`<button class="opt" data-dur="${v}" aria-pressed="${keyDur===v}">${l}</button>`).join('')}</span></div>`}
      <div class="tools"><button class="mini wide" data-tool="add">+ Bar</button><button class="mini wide" data-tool="copy">Copy bar</button><button class="mini wide" data-tool="del">Delete</button><button class="mini wide" data-tool="undo" ${hist.length?'':'disabled'}>Undo</button></div>
      <div class="frow"><span>Tempo</span><span class="step"><button class="mini" data-bpm="-1">−</button><b class="tnum">${d.bpm}</b><button class="mini" data-bpm="1">+</button><button class="opt" data-tap>Tap</button></span></div>
      <div class="frow"><span>Time signature</span><span class="step">${[4,3,2].map(m=>`<button class="opt" data-meter="${m}" aria-pressed="${d.meter===m}">${m}/4</button>`).join('')}</span></div>
      <div class="frow"><span>Click in preview</span><button class="opt" data-click aria-pressed="${!!d.click}">${d.click?'On':'Off'}</button></div>
      <div class="frow"><span>Tuning and capo</span><button class="lnk" data-more>${TUNINGS[d.tuning].name}${d.capo?' · capo '+d.capo:''}</button></div>
      ${d.anchors.length>1||(rec.src==='yt'&&d.anchors.length)?`<p class="fine" style="text-align:left">Changing the tempo moves notes between your timing anchors. Check them in Sync.</p>`:''}</div>
      <div class="dock two">${rec.src==='yt'?'<button class="btn" data-sync>Sync</button>':'<button class="btn" data-preview>Preview</button>'}<button class="btn pri" data-review>Review</button></div>`;
    wireBack(el,()=>{saveDraft(d);popScreen();});
    const g=$('#grid',el),cur=g.querySelector('.sel');if(cur)cur.scrollIntoView({block:'nearest',inline:'nearest'});
    const change=fn=>{snap();fn();saveDraft(d);el.render();};
    el.onclick=e=>{const t=e.target;
      const cl=t.closest('[data-cell]');if(cl){const[bar,k,s]=cl.dataset.cell.split(',').map(Number);d.cur={bar,cell:k,s:s||0};pending='';saveDraft(d);el.render();return;}
      const md=t.closest('[data-mode]');if(md){d.mode=md.dataset.mode;saveDraft(d);el.render();return;}
      const ch=t.closest('[data-ch]');if(ch){change(()=>{const b=beatOf(c.bar,c.cell);let e=evAt(c.bar,c.cell);if(!e){e={b,c:ch.dataset.ch,st:c.cell%2?'U':'D'};d.ev.push(e);}else e.c=ch.dataset.ch;fixDur(d);
          const nk=c.cell+(d.meter===3?2:2);if(nk<cp)d.cur.cell=nk;});return;}
      const st=t.closest('[data-st]');if(st){const b=beatOf(c.bar,c.cell),e=evAt(c.bar,c.cell)||d.ev.filter(x=>x.c!=null&&x.b<b).sort((x,y)=>y.b-x.b)[0];if(e)change(()=>{e.st=st.dataset.st;});else toast('Add a chord first');return;}
      const dr=t.closest('[data-dur]');if(dr){keyDur=+dr.dataset.dur;const e=evAt(c.bar,c.cell,c.s);if(e)change(()=>{e.d=keyDur/2;});else el.render();return;}
      const kp=t.closest('[data-k]');if(kp){const k=kp.dataset.k,b=beatOf(c.bar,c.cell);
        if(k==='del'||k==='rest'){const e=evAt(c.bar,c.cell,c.s);pending='';if(e)change(()=>{d.ev.splice(d.ev.indexOf(e),1);});if(k==='rest')advance();return;}
        pending=(pending+k).slice(-2);let f=+pending;if(f>24){pending=k;f=+k;}
        change(()=>{let e=evAt(c.bar,c.cell,c.s);if(!e){e={b,d:keyDur/2,s:c.s,f};d.ev.push(e);}else e.f=f;});
        clearTimeout(openEditor.pt);openEditor.pt=setTimeout(()=>{pending='';advance();},900);return;}
      const tl=t.closest('[data-tool]');if(tl){const k=tl.dataset.tool;
        if(k==='add')change(()=>{d.bars++;d.cur={bar:d.bars-1,cell:0,s:c.s};});
        if(k==='copy')change(()=>{const src=c.bar,evs=d.ev.filter(e=>e.b>=src*d.meter&&e.b<(src+1)*d.meter).map(e=>({...e,b:e.b+d.meter}));d.ev.forEach(e=>{if(e.b>=(src+1)*d.meter)e.b+=d.meter;});d.ev.push(...evs);d.bars++;d.cur={bar:src+1,cell:0,s:c.s};fixDur(d);});
        if(k==='del'){const e=evAt(c.bar,c.cell,c.s);if(e)change(()=>{d.ev.splice(d.ev.indexOf(e),1);fixDur(d);});else if(d.bars>1&&!d.ev.some(x=>x.b>=c.bar*d.meter&&x.b<(c.bar+1)*d.meter))change(()=>{d.ev.forEach(x=>{if(x.b>=(c.bar+1)*d.meter)x.b-=d.meter;});d.bars--;d.cur.bar=Math.max(0,c.bar-1);});else toast('Select a chord or note to delete');}
        if(k==='undo'&&hist.length){const s=JSON.parse(hist.pop());d.ev=s.ev;d.bars=s.bars;saveDraft(d);el.render();}return;}
      const bp=t.closest('[data-bpm]');if(bp){d.bpm=clamp(d.bpm+(+bp.dataset.bpm),30,240);saveDraft(d);el.render();return;}
      if(t.closest('[data-tap]')){const n=performance.now();taps=taps.filter(x=>n-x<3000);taps.push(n);if(taps.length>=3){const iv=[];for(let i=1;i<taps.length;i++)iv.push(taps[i]-taps[i-1]);d.bpm=clamp(Math.round(60000/(iv.reduce((a,b)=>a+b,0)/iv.length)),30,240);saveDraft(d);el.render();}else toast('Keep tapping');return;}
      const mt=t.closest('[data-meter]');if(mt){d.meter=+mt.dataset.meter;d.cur.cell=0;saveDraft(d);el.render();return;}
      if(t.closest('[data-click]')){d.click=!d.click;saveDraft(d);el.render();return;}
      if(t.closest('[data-more]')){sheet(`<span class="grab"></span><p class="eyebrow">Tuning and capo</p><h2>${TUNINGS[d.tuning].name}${d.capo?' · capo '+d.capo:''}</h2>
          <h3 class="sh">Tuning</h3><div class="chips wrap">${Object.entries(TUNINGS).map(([k,v])=>`<button class="opt" data-tun="${k}" aria-pressed="${d.tuning===k}">${v.name}</button>`).join('')}</div>
          <h3 class="sh">Capo</h3><div class="chips wrap">${[0,1,2,3,4,5,6,7].map(k=>`<button class="opt" data-capo="${k}" aria-pressed="${d.capo===k}">${k?k:'None'}</button>`).join('')}</div>
          <p class="tipline" style="margin-top:14px">Frets are written relative to the capo, so the notes you see stay the same shapes you play.</p>`);
        $('#sheet').onclick=ev=>{const a=ev.target.closest('[data-tun]'),b=ev.target.closest('[data-capo]');if(a)d.tuning=a.dataset.tun;if(b)d.capo=+b.dataset.capo;if(a||b){saveDraft(d);closeSheet();el.render();}else if(ev.target.id==='sheet')closeSheet();};return;}
      if(t.closest('[data-sync]')){saveDraft(d);openSync(d.id);return;}
      if(t.closest('[data-preview]')){saveDraft(d);previewDraft(d);return;}
      if(t.closest('[data-review]')){saveDraft(d);openReview(d.id);return;}};
    function advance(){const cp=cellsPer();let{bar,cell}=d.cur;cell+=keyDur;while(cell>=cp){cell-=cp;bar++;}if(bar>=d.bars){bar=d.bars-1;cell=cp-1;}d.cur.bar=bar;d.cur.cell=cell;saveDraft(d);el.render();}});}
function fixDur(d){const ch=d.ev.filter(e=>e.c!=null).sort((x,y)=>x.b-y.b);ch.forEach((e,i)=>{e.d=(ch[i+1]?ch[i+1].b:d.bars*d.meter)-e.b;});}
function draftArr(d){const a={...d,id:d.pubId||d.id,author:PS.me||'You'};fixDur(a);return a;}
function previewDraft(d,done){const a=draftArr(d);if(!a.ev.length){toast('Add a chord or note first');return;}const s=partSong(a,{preview:true,onDone:()=>{Player.close(true);done&&done();}});
  if(d.click)s.part.click=true;Player.open(s,[s]);}
Parts.clickTick=function(P,prev){if(!P.part||!P.part.click||!P.running)return;for(let b=Math.ceil(prev);b<P.t;b++)if(b>=0)click(ctx.currentTime,b%P.part.a.meter===0);};

/* ================= creator: align the chart to the recording ================= */
function openSync(draftId,pub){const d=draftId?draftOf(draftId):null,a=d||pub,rec=recOf(a.rec);let anchors=(d?d.anchors:(PS.timing[pub.id]||pub.anchors)).map(x=>({...x}));
  let selB={bar:1,beat:1},selA=anchors.length?anchors.length-1:-1,media=null;
  function save(){anchors.sort((x,y)=>x.b-y.b);if(d){d.anchors=anchors;if(anchors.length)d.start=+tmap({...d,anchors}).t(0).toFixed(2);saveDraft(d);}else{PS.timing[pub.id]=anchors;PS.checked[pub.id]=true;savePS();}}
  pushScreen(el=>{const bars=a.bars||1;
    if(!el.built){el.built=true;el.isSync=true;el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>Sync to recording</h1><p id="shead"></p></header>
        ${rec.src==='yt'?'<div class="vbox" id="sv"></div>':''}
        <div class="transport"><button class="round big" data-pp aria-label="Play or pause">${IC.play}</button><div class="scrub" id="ss"><i id="ssf"></i><span id="smarks"></span></div><span class="tnum" id="snow">0:00.00</span></div>
        <p class="tipline" style="margin:4px 4px 12px">Play the recording, pause on a clear attack, choose that beat, then set the anchor. The tempo gives the spacing; anchors say where the grid sits in this recording.</p>
        <div id="sdyn"></div></div><div class="dock two" id="sdock"></div>`;
      wireBack(el,()=>{save();popScreen();});el.cleanup=()=>{media&&media.destroy();};
      media=mediaFor(rec,$('#sv',el),{});media.load().then(()=>{if(!media.err)media.seek(anchors.length?anchors[Math.max(0,selA)].t:a.start);});
      const sc=$('#ss',el),dur=()=>media.dur()||recDur(rec)||1,pos=e=>{const R=sc.getBoundingClientRect();return clamp((e.clientX-R.left)/R.width,0,1);};
      sc.onpointerdown=e=>{sc.setPointerCapture(e.pointerId);media.seek(pos(e)*dur());sc.onpointermove=ev=>media.seek(pos(ev)*dur());};sc.onpointerup=()=>{sc.onpointermove=null;};
      el.tick=()=>{const t=media.now(),D=dur();$('#ssf',el).style.width=clamp(t/D*100,0,100)+'%';$('#snow',el).textContent=fmtT2(t);$('#smarks',el).innerHTML=anchors.map(x=>`<span class="am" style="left:${clamp(x.t/D*100,0,100)}%"></span>`).join('');
        const pp=el.querySelector('[data-pp]'),ic=media.playing()?IC.pause:IC.play;if(pp.innerHTML!==ic)pp.innerHTML=ic;};
      el.onclick=e=>{const t=e.target,beat=(selB.bar-1)*a.meter+(selB.beat-1);
        if(t.closest('[data-pp]')){media.playing()?media.pause():media.play();return;}
        const sb=t.closest('[data-sb]');if(sb){selB.bar=clamp(selB.bar+(+sb.dataset.sb),1,bars+1);el.render();return;}
        const sbt=t.closest('[data-sbt]');if(sbt){selB.beat=clamp(selB.beat+(+sbt.dataset.sbt),1,a.meter);el.render();return;}
        if(t.closest('[data-set]')){const now_=+media.now().toFixed(2),ex=anchors.findIndex(x=>Math.abs(x.b-beat)<1e-6),trial=anchors.filter((_,i)=>i!==ex).concat([{b:beat,t:now_}]).sort((x,y)=>x.b-y.b);
          for(let i=1;i<trial.length;i++)if(trial[i].t<=trial[i-1].t){toast('That would run time backwards. Check the bar or the video time.');return;}
          anchors=trial;selA=anchors.findIndex(x=>x.b===beat);save();toast(`Bar ${selB.bar}, beat ${selB.beat} → ${fmtT2(now_)}`);el.render();return;}
        const an=t.closest('[data-a]');if(an){selA=+an.dataset.a;const x=anchors[selA];selB={bar:Math.floor(x.b/a.meter)+1,beat:Math.round(x.b%a.meter)+1};media.seek(x.t);el.render();return;}
        const nd=t.closest('[data-nd]');if(nd&&selA>=0){const x=anchors[selA],nt=+(x.t+(+nd.dataset.nd)*.02).toFixed(2),p=anchors[selA-1],q=anchors[selA+1];if((p&&nt<=p.t)||(q&&nt>=q.t)){toast('That would run time backwards');return;}x.t=nt;media.seek(nt);save();el.render();return;}
        if(t.closest('[data-rm]')&&selA>=0){anchors.splice(selA,1);selA=anchors.length-1;save();el.render();return;}
        if(t.closest('[data-addnext]')){selB={bar:bars,beat:1};el.render();toast(`Find bar ${bars} in the recording, then set the anchor`);return;}
        if(t.closest('[data-reset]')){delete PS.timing[pub.id];delete PS.checked[pub.id];savePS();anchors=pub.anchors.map(x=>({...x}));selA=anchors.length-1;el.render();return;}
        if(t.closest('[data-prev]')){save();media.pause();if(d)previewDraft(d);else{const s=partSong(pub,{preview:true,onDone:()=>Player.close(true)});Player.open(s,[s]);}return;}
        if(t.closest('[data-backtab]')){save();popScreen();return;}
        if(t.closest('[data-done]')){save();if(d){popScreen();const top=PUI.stack[PUI.stack.length-1];if(!top||!top.isRev)openReview(d.id);}else{toast('Timing saved on this phone');popScreen();}}};}
    $('#shead',el).textContent=`Bar ${selB.bar}, beat ${selB.beat}`+(selA>=0?` · anchor at ${fmtT2(anchors[selA].t)}`:'');
    $('#sdyn',el).innerHTML=`<div class="frow"><span>Bar</span><span class="step"><button class="mini" data-sb="-1" aria-label="Previous bar">−</button><b class="tnum">${selB.bar}</b><button class="mini" data-sb="1" aria-label="Next bar">+</button></span></div>
      <div class="frow"><span>Beat</span><span class="step"><button class="mini" data-sbt="-1" aria-label="Previous beat">−</button><b class="tnum">${selB.beat}</b><button class="mini" data-sbt="1" aria-label="Next beat">+</button></span></div>
      <button class="cta" data-set style="width:100%;margin:12px 0"><span class="lbl">Set anchor at this moment</span></button>
      <h3 class="sh">Anchors</h3><div class="list">${anchors.map((x,i)=>`<button class="row${i===selA?' sel':''}" data-a="${i}"><span class="t"><b>Bar ${Math.floor(x.b/a.meter)+1}, beat ${Math.round(x.b%a.meter)+1}</b><small class="tnum">recording ${fmtT2(x.t)}</small></span>${i===selA?'<span class="r">Selected</span>':''}</button>`).join('')||'<p class="empty">No anchors yet.</p>'}</div>
      ${selA>=0?`<div class="frow"><span>Nudge selected</span><span class="step"><button class="mini" data-nd="-1" aria-label="Earlier">−</button><button class="mini" data-nd="1" aria-label="Later">+</button><button class="lnk" data-rm>Remove</button></span></div>`:''}
      <div class="links"><button class="lnk" data-addnext>Add another anchor</button><button class="lnk" data-prev>Preview</button>${!d?'<button class="lnk" data-reset>Use the original timing</button>':''}</div>`;
    $('#sdock',el).innerHTML=`${d?'<button class="btn" data-backtab>Back to tab</button>':''}<button class="btn pri" data-done>${d?'Review':'Save timing'}</button>`;});}

/* ================= creator: check and publish ================= */
function missingStep(d){const rec=recOf(d.rec);if(!rec)return'Choose a recording';if(!(d.end>d.start))return'Mark where the passage starts and ends';if(!d.section||!d.part||!d.level)return'Name the section, part and difficulty';
  if(!d.ev.length)return'Add at least one chord or note';if(rec.src==='yt'&&!d.anchors.length)return'Set at least one timing anchor in Sync';if(rec.src==='yt'&&d.playable===false)return'This recording can’t be played here. Choose another one.';return null;}
function openReview(id){pushScreen(el=>{el.isRev=true;const d=draftOf(id);if(!d){popScreen();return;}const rec=recOf(d.rec),miss=missingStep(d),pubA=d.pubId&&arrOf(d.pubId);
  el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>Review this passage</h1><p>${esc(d.section)} · ${esc(d.part)} · ${esc(d.level)}</p></header>
    <div class="list"><div class="row"><span class="t"><b>${esc(rec.song)}</b><small>${esc(rec.kind)} · ${fmtT2(d.start)}–${fmtT2(d.end)}</small></span></div>
      <div class="row"><span class="t"><b>${d.ev.length} ${d.mode==='tab'?'notes':'chords'} in ${d.bars} bar${d.bars>1?'s':''}</b><small>${d.bpm} BPM · ${d.meter}/4 · ${TUNINGS[d.tuning].name}${d.capo?' · capo '+d.capo:''}</small></span></div>
      <div class="row"><span class="t"><b>${d.anchors.length} timing anchor${d.anchors.length===1?'':'s'}</b><small>${rec.src==='yt'?'Lined up with the video':'Exact: the app plays this recording'}</small></span></div></div>
    <label class="field"><span>Musical goal (shown to players)</span><input class="inp" id="rgoal" value="${esc(d.goal||'')}" placeholder="e.g. Steady downstrokes"></label>
    <div class="links"><button class="lnk" data-pv>Play preview</button><button class="lnk" data-ed>Edit notes</button>${rec.src==='yt'?'<button class="lnk" data-tm>Adjust timing</button>':''}</div>
    ${miss?`<p class="err">Before publishing: ${esc(miss)}</p>`:`<p class="fine" style="text-align:left">Published arrangements are kept on this phone and show up under the recording. ${pubA?`This will be version ${(pubA.rev||1)+1}.`:''}</p>`}</div>
    <div class="dock"><button class="cta" data-pub ${miss?'disabled':''}><span class="lbl">${pubA?'Publish update':'Publish arrangement'}</span></button><button class="import" data-leave>Save draft &amp; leave</button></div>`;
  wireBack(el);$('#rgoal',el).addEventListener('input',e=>{d.goal=e.target.value;saveDraft(d);});
  el.onclick=e=>{const t=e.target;if(t.closest('[data-pv]'))return previewDraft(d);if(t.closest('[data-ed]')){popScreen();const top=PUI.stack[PUI.stack.length-1];if(!top||!top.isEd)openEditor(d.id);return;}if(t.closest('[data-tm]')){const top=PUI.stack[PUI.stack.length-2];if(top&&top.isSync){popScreen();return;}return openSync(d.id);}
    if(t.closest('[data-leave]')){saveDraft(d);toast('Draft saved on this phone');popAll();HV.tab='create';renderHome();return;}
    if(t.closest('[data-pub]')&&!missingStep(d)){const b=t.closest('[data-pub]');if(b.disabled)return;b.disabled=true;const arr=publishDraft(d);toast('Published');popAll();HV.tab='create';renderHome();openRecording(arr.rec,arr.id);}};});}
function publishDraft(d){const id=d.pubId||(d.pubId='a'+d.id.slice(1)),prev=PS.arrs[id],a={...draftArr(d),id,rev:(prev&&prev.rev||0)+1,author:PS.me==='You'?'You':PS.me,seed:false,checked:true,publishedAt:Date.now()};
  delete a.cur;delete a.at;delete a.pubId;delete a.click;PS.arrs[id]=a;PS.revs[id+'@'+a.rev]=JSON.parse(JSON.stringify(a));delete PS.drafts[d.id];savePS();return a;}
function editPublished(a){const d={...JSON.parse(JSON.stringify(a)),id:uid('d'),pubId:a.id,cur:{bar:0,cell:0,s:0},at:Date.now()};PS.drafts[d.id]=d;savePS();openEditor(d.id);}

/* ================= My drafts ================= */
function openDrafts(){pushScreen(el=>{const L=Object.values(PS.drafts).sort((x,y)=>y.at-x.at);
  el.innerHTML=topBar()+`<div class="hscroll"><header class="h-head"><h1>Arrangement drafts</h1><p>Continue from the last saved bar. Drafts stay private on this phone.</p></header>
    <div class="list">${L.map(d=>{const r=recOf(d.rec);return r?`<div class="row rrow">${thumb(r)}<button class="t" data-open="${d.id}" style="text-align:left"><b>${esc(r.song)} · ${esc(d.section)}</b><small>${esc(d.part)} · ${esc(d.level)} · bar ${(d.cur&&d.cur.bar||0)+1} · ${ago(d.at)}</small></button><button class="ib" data-del="${d.id}" aria-label="Delete draft">${IC.x}</button></div>`:'';}).join('')||'<p class="empty">No drafts yet.</p>'}</div></div>
    <div class="dock"><button class="cta" data-new><span class="lbl">New arrangement</span></button><button class="import" data-home>Home</button></div>`;
  wireBack(el);el.onclick=e=>{const o=e.target.closest('[data-open]');if(o)return openEditor(o.dataset.open);const x=e.target.closest('[data-del]');if(x){const id=x.dataset.del;sheet(`<span class="grab"></span><h2>Delete this draft?</h2><p class="tipline" style="margin-top:8px">It can’t be recovered.</p><div class="btns"><button class="btn" id="dNo">Keep</button><button class="btn pri" id="dYes">Delete</button></div>`);$('#dNo').onclick=closeSheet;$('#dYes').onclick=()=>{delete PS.drafts[id];savePS();closeSheet();el.render();};return;}
    if(e.target.closest('[data-new]'))return openCreate();if(e.target.closest('[data-home]'))return popAll();};});}

/* ================= challenges, duels and the leaderboard on this phone ================= */
function challengesFor(fam){const cat=HOME.cat||[],pick=f=>cat.find(f);const L=[];
  const drill=pick(s=>s.coll==='drill'),song=pick(s=>s.id==='ode')||pick(s=>s.coll==='kids')||pick(s=>s.coll==='taal')||cat[1];
  if(drill)L.push({id:fam+'-30',title:'30-second sprint',desc:`Score as many points as you can on “${drill.title}” in 30 seconds.`,secs:30,song:drill.id});
  if(song)L.push({id:fam+'-60',title:'60-second run',desc:`One minute of “${song.title}”. Accuracy and timing both count.`,secs:60,song:song.id});
  if(fam==='guitar'){L.push({id:'saints-ch-rhythm',title:'Saints chorus: rhythm',desc:'The whole chorus with upstrokes and the full F chord.',arr:'saints-chorus-i'},{id:'saints-ch-lead',title:'Saints chorus: lead',desc:'The tune, note by note, in one take.',arr:'saints-chorus-l'},{id:'grace-verse-lead',title:'Amazing Grace: lead',desc:'Sixteen bars in 3/4. Hold the long notes.',arr:'grace-verse-l'});}
  else{const raag=pick(s=>s.coll==='raag');if(raag)L.push({id:fam+'-raag',title:'Raag challenge',desc:`Play “${raag.title}” in one take.`,song:raag.id});}
  return L;}
function board(id){return(PS.scores[id]||[]).slice().sort((x,y)=>y.pts-x.pts);}
function bestOf(id,name){return board(id).find(x=>x.name===name);}
function renderChallenges(box,fam){const L=challengesFor(fam);
  box.innerHTML=`<div class="who"><span>Playing as</span><button class="opt" data-who aria-pressed="true">${esc(PS.me)}</button><button class="lnk" data-addp>Add player</button></div>
    ${L.map(c=>{const B=board(c.id),top=B[0],me=bestOf(c.id,PS.me);return `<button class="ccard" data-ch="${c.id}"><span class="ct">${PIC.trophy}<b>${esc(c.title)}</b>${c.secs?`<span class="tag mute">${c.secs} s</span>`:''}</span><span class="cd">${esc(c.desc)}</span>
      <span class="cs"><span>Your best <b>${me?me.pts.toLocaleString():'–'}</b></span><span>${top?`Top: <b>${esc(top.name)} ${top.pts.toLocaleString()}</b>`:'No scores yet'}</span></span></button>`;}).join('')}
    <p class="fine">Scores are kept on this phone. Pass it to a friend for a duel.</p>`;
  box.onclick=e=>{const c=e.target.closest('[data-ch]');if(c)return openChallenge(L.find(x=>x.id===c.dataset.ch),fam);if(e.target.closest('[data-who]'))return pickPlayer(n=>{PS.me=n;savePS();renderChallenges(box,fam);});if(e.target.closest('[data-addp]'))return addPlayer(n=>{PS.me=n;savePS();renderChallenges(box,fam);});};}
function addPlayer(cb){sheet(`<span class="grab"></span><p class="eyebrow">New player</p><h2>Who’s playing?</h2><label class="field"><span>Name</span><input class="inp" id="pn" maxlength="20" placeholder="Name"></label><div class="btns"><button class="btn" id="pc">Cancel</button><button class="btn pri" id="pok">Add</button></div>`);
  const i=$('#pn');setTimeout(()=>i.focus(),250);$('#pc').onclick=closeSheet;const ok=()=>{const n=i.value.trim().slice(0,20);if(!n)return;if(!PS.players.includes(n))PS.players.push(n);savePS();closeSheet();cb(n);};$('#pok').onclick=ok;i.addEventListener('keydown',e=>{if(e.key==='Enter')ok();});}
function pickPlayer(cb,except){sheet(`<span class="grab"></span><p class="eyebrow">Players on this phone</p><h2>Choose a player</h2><div class="pick">${PS.players.filter(p=>p!==except).map(p=>`<button class="row" data-p="${esc(p)}"><span class="t"><b>${esc(p)}</b></span></button>`).join('')}<button class="row" data-new><span class="t"><b>+ Add player</b></span></button></div>`);
  $('#sheet').onclick=e=>{const b=e.target.closest('[data-p]');if(b){closeSheet();cb(b.dataset.p);}else if(e.target.closest('[data-new]')){addPlayer(cb);}else if(e.target.id==='sheet')closeSheet();};}
function openChallenge(c,fam){const B=board(c.id);
  sheet(`<span class="grab"></span><p class="eyebrow">Challenge</p><h2>${esc(c.title)}</h2><p class="rs-sub">${esc(c.desc)}</p>
    <div class="lb">${B.slice(0,8).map((x,i)=>`<div class="lb-row${x.name===PS.me?' me':''}"><span class="rk">${i+1}</span><span class="nm">${esc(x.name)}<small>${x.acc}% · ${x.mode==='mic'?'mic':'tap'} · ${ago(x.at)}</small></span><b>${x.pts.toLocaleString()}</b></div>`).join('')||'<p class="empty">No scores yet. Set the first one.</p>'}</div>
    <p class="fine" style="margin-top:6px">Leaderboard of players on this phone.</p>
    <div class="btns"><button class="btn ic" id="chDuel">${PIC.swords}<span>Duel</span></button><button class="btn pri" id="chGo">Play as ${esc(PS.me)}</button></div>`);
  $('#chGo').onclick=()=>{closeSheet();startChallenge(c,{player:PS.me});};
  $('#chDuel').onclick=()=>pickPlayer(p2=>{closeSheet();toast(PS.me==='You'?'You go first':`${PS.me} goes first`);startChallenge(c,{player:PS.me,duel:{p1:PS.me,p2,turn:1}});},PS.me);}
function startChallenge(c,o){const ch={...c,...o,points:0};if(c.arr){const a=arrOf(c.arr);playArr(a,{challenge:ch});return;}
  const s=(HOME.cat||[]).find(x=>x.id===c.song);if(!s){toast('That song isn’t available');return;}Player.open(s,[s],{challenge:ch});}
/* timed challenges keep going until the clock runs out */
Parts.chTick=function(P){const c=P.challenge;if(!c||!c.secs)return false;if(P.elapsed>=c.secs&&!P.ended){P.finish();return true;}return false;};
Parts.chLoop=function(P){const c=P.challenge;if(!c||!c.secs||P.elapsed>=c.secs)return false;c.points+=passPoints(P);c.notesDone=(c.notesDone||0)+P.notes.filter(n=>!n.rest&&n.judged).length;c.scoreSum=(c.scoreSum||0)+P.notes.reduce((a,n)=>a+(n.judged?n.score:0),0);
  P.notes.forEach(n=>Object.assign(n,{frames:0,good:0,judged:false,state:null,unlocked:false,byMic:false,hits:{},score:0,onsetOff:null,other:0,early:0,cw:0,cs:0}));P.nextIdx=0;P.nextTick=0;P.t=0;return true;};
function passPoints(P){return P.notes.reduce((a,n)=>a+(n.judged&&!n.rest?Math.round(n.score*100):0),0);}
function chFinish(P){const c=P.challenge;P.running=false;P.ended=true;P.btn();Clip.stop();
  const pts=c.points+passPoints(P),done=(c.notesDone||0)+P.notes.filter(n=>!n.rest&&n.judged).length,sum=(c.scoreSum||0)+P.notes.reduce((a,n)=>a+(n.judged?n.score:0),0),acc=done?Math.round(sum/done*100):0;
  const before=bestOf(c.id,c.player);(PS.scores[c.id]=PS.scores[c.id]||[]).push({name:c.player,pts,acc,mode:P.mode,at:Date.now()});if(PS.scores[c.id].length>200)PS.scores[c.id]=board(c.id).slice(0,200);savePS();
  Game.record({completed:true,song:P.song.part?{id:'part-'+P.song.part.a.id,title:c.title,coll:'part'}:P.song,inst:P.key,kind:P.kind,pct:acc,stars:acc>=90?3:acc>=70?2:acc>=45?1:0,elapsed:P.elapsed,speed:P.speed,mode:P.mode});P.recorded=true;P.elapsed=0;
  const B=board(c.id),rank=B.findIndex(x=>x.name===c.player&&x.pts===pts)+1,pb=!before||pts>before.pts;
  const again=()=>{closeSheet();P.close(true,true);startChallenge(c,{player:c.player,duel:null});};
  if(c.duel&&c.duel.turn===1){c.duel.s1={pts,acc};sheet(`<span class="grab"></span><p class="eyebrow">${esc(c.duel.p1)} scored</p><h2 class="bigpts">${pts.toLocaleString()}</h2><p class="rs-sub">${acc}% accuracy</p><div class="pass"><b>Pass the phone to ${esc(c.duel.p2)}</b><span>Same challenge, same settings.</span></div><div class="btns"><button class="btn" id="dqQ">Quit duel</button><button class="btn pri" id="dqGo">${esc(c.duel.p2)}, start</button></div>`);
    $('#dqQ').onclick=()=>P.close();$('#dqGo').onclick=()=>{closeSheet();P.close(true,true);startChallenge(c,{player:c.duel.p2,duel:{...c.duel,turn:2}});};return;}
  if(c.duel&&c.duel.turn===2){const s1=c.duel.s1,w=pts===s1.pts?null:pts>s1.pts?c.duel.p2:c.duel.p1;
    sheet(`<span class="grab"></span><p class="eyebrow">Duel · ${esc(c.title)}</p><h2>${w?esc(w)+' wins':'It’s a tie'}</h2><div class="duel"><div class="${w===c.duel.p1?'win':''}"><small>${esc(c.duel.p1)}</small><b>${s1.pts.toLocaleString()}</b><span>${s1.acc}%</span></div><div class="${w===c.duel.p2?'win':''}"><small>${esc(c.duel.p2)}</small><b>${pts.toLocaleString()}</b><span>${acc}%</span></div></div>
      <div class="btns"><button class="btn" id="duDone">Done</button><button class="btn pri" id="duRe">Rematch</button></div>`);if(w)confetti($('#sheet .sheet'));
    $('#duDone').onclick=()=>P.close();$('#duRe').onclick=()=>{closeSheet();P.close(true,true);startChallenge(c,{player:c.duel.p1,duel:{p1:c.duel.p1,p2:c.duel.p2,turn:1}});};return;}
  sheet(`<span class="grab"></span><p class="eyebrow">${esc(c.title)}${pb&&before?' · New best':''}</p><h2 class="bigpts">${pts.toLocaleString()} <small>points</small></h2><p class="rs-sub">${acc}% accuracy · #${rank} of ${B.length} on this phone${before&&!pb?` · your best is ${before.pts.toLocaleString()}`:''}</p>
    <div class="btns three"><button class="btn ic" id="chB">${IC.list}<span>Board</span></button><button class="btn" id="chD">Done</button><button class="btn pri" id="chA">Play again</button></div>`);if(pb&&before)confetti($('#sheet .sheet'));
  $('#chA').onclick=again;$('#chD').onclick=()=>P.close();$('#chB').onclick=()=>{P.close();setTimeout(()=>openChallenge(c),350);};}

/* ================= record a clip of your take ================= */
const Clip={on:false,
  async start(){if(this.on)return;if(!window.MediaRecorder||!navigator.mediaDevices){toast('Recording isn’t supported in this browser');return;}
    let cam;try{cam=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960}},audio:Mic.active?false:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}
    catch(e){toast(e&&e.name==='NotAllowedError'?'Camera blocked. Allow it in settings.':'Camera didn’t start');return;}
    ac();const dest=ctx.createMediaStreamDestination();try{master.connect(dest);}catch(e){}
    const aTrack=Mic.active&&Mic.stream?Mic.stream.getAudioTracks()[0].clone():cam.getAudioTracks()[0];let src=null;if(aTrack){src=ctx.createMediaStreamSource(new MediaStream([aTrack]));src.connect(dest);}
    const out=new MediaStream([...cam.getVideoTracks(),...dest.stream.getAudioTracks()]);
    const types=['video/mp4;codecs=avc1,mp4a','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'],mime=types.find(t=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
    let rec;try{rec=new MediaRecorder(out,mime?{mimeType:mime,videoBitsPerSecond:2500000}:{});}catch(e){toast('Recording didn’t start');cam.getTracks().forEach(t=>t.stop());return;}
    this.ctx={cam,dest,src,aTrack,rec,chunks:[],mime:rec.mimeType||mime||'video/webm',t0:Date.now()};rec.ondataavailable=e=>{if(e.data&&e.data.size)this.ctx.chunks.push(e.data);};rec.onstop=()=>this.done();rec.start(500);this.on=true;
    const st=$('.pl-stage');if(st){const v=document.createElement('div');v.className='pl-cam';v.innerHTML='<video autoplay muted playsinline></video><span class="rdot"><i></i><b>0:00</b></span>';st.appendChild(v);v.querySelector('video').srcObject=cam;}
    this.timer=setInterval(()=>{const b=$('.pl-cam b');if(b)b.textContent=fmtT((Date.now()-this.ctx.t0)/1000);if(Date.now()-this.ctx.t0>180000)this.stop();},500);this.btn();},
  stop(){if(!this.on)return;this.on=false;clearInterval(this.timer);try{this.ctx.rec.state!=='inactive'&&this.ctx.rec.stop();}catch(e){this.done();}this.btn();},
  done(){const c=this.ctx;if(!c)return;this.ctx=null;c.cam.getTracks().forEach(t=>t.stop());try{c.aTrack&&c.aTrack!==c.cam.getAudioTracks()[0]&&c.aTrack.stop();}catch(e){}try{master.disconnect(c.dest);}catch(e){}try{c.src&&c.src.disconnect();}catch(e){}$('.pl-cam')?.remove();
    if(!c.chunks.length){toast('Nothing was recorded');return;}const ext=/mp4/.test(c.mime)?'mp4':'webm',blob=new Blob(c.chunks,{type:c.mime.split(';')[0]}),url=URL.createObjectURL(blob),name=`fretopia-${(Player.song&&Player.song.title||'take').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.${ext}`,file=new File([blob],name,{type:blob.type});
    const canShare=navigator.canShare&&navigator.canShare({files:[file]});Player.pause&&Player.pause();
    sheet(`<span class="grab"></span><p class="eyebrow">Your clip · ${fmtT((Date.now()-c.t0)/1000)}</p><h2>${esc(Player.song?Player.song.title:'Your take')}</h2><video class="clipv" src="${url}" controls playsinline></video>
      <p class="fine">Clips aren’t kept by the app. Share or save it before you close this.</p><div class="btns three"><button class="btn" id="clDel">Delete</button><button class="btn" id="clSave">Save</button><button class="btn pri" id="clShare" ${canShare?'':'hidden'}>Share</button></div>`);
    if(!canShare){$('#clSave').classList.add('pri');$('.btns.three',$('#sheet')).classList.remove('three');}
    const free=()=>setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('#clDel').onclick=()=>{closeSheet();URL.revokeObjectURL(url);};
    $('#clSave').onclick=()=>{const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();toast('Saved to your downloads');free();};
    $('#clShare').onclick=()=>{navigator.share({files:[file],title:'My Fretopia take',text:'Played on Fretopia'}).then(()=>{closeSheet();free();}).catch(()=>{});};},
  btn(){const b=$('#plRec');if(b){b.innerHTML=this.on?PIC.stop:PIC.cam;b.classList.toggle('rec',this.on);b.setAttribute('aria-label',this.on?'Stop recording':'Record a clip');}}};
Parts.recBtn=()=>`<button class="round" id="plRec" aria-label="Record a clip">${PIC.cam}</button>`;

/* the challenge's own line in the player: who's playing, time left, points so far */
Parts.chDecorate=function(P,el){const c=P.challenge;el.querySelector('.pl-title b').textContent=c.title;el.querySelector('.pl-title small').textContent=c.player+(c.duel?` · duel, turn ${c.duel.turn} of 2`:'');
  const m=el.querySelector('.pl-meta');m.insertAdjacentHTML('afterbegin',`<span>${c.secs?'Time left':'Points'} <b id="plCh">${c.secs?fmtT(c.secs):'0'}</b></span>`);};
Parts.chHud=function(P){const c=P.challenge,el=$('#plCh');if(!el)return;const txt=c.secs?fmtT(Math.ceil(Math.max(0,c.secs-P.elapsed))):(c.points+passPoints(P)).toLocaleString();if(el.textContent!==txt)el.textContent=txt;};
