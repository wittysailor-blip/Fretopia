/* ================= Riyaz: progress, streaks, records, trophies =================
   Design notes (from Duolingo, Strava, Yousician, Melodics and Apple Activity research):
   - Process over outcome: every minute of practice earns XP and fills the daily ring, finished or not.
   - Kind streaks: a day counts after one finished song or exercise. Streak freezes are earned (one per 7 days, hold up to 2)
     and used automatically, so one missed day doesn't erase weeks of riyaz. Coming back is celebrated, not shamed.
   - Strava-style personal records per song and a trophy case with an easy first trophy; a 12-week activity calendar.
   - No leaderboards, no guilt notifications, no fake social proof. Everything is stored on the device. */
const G_KEY='fretopia.riyaz1';
const RANKS=[[1,'Naya shishya'],[3,'Shishya'],[6,'Sadhak'],[10,'Kalakar'],[15,'Ustad'],[20,'Guru']];
const TROPHIES=[
  ['first','First steps','Finish your first song or exercise','note'],
  ['strum','First strum','Finish a chord lesson','chord'],
  ['stars3','Three stars','Earn three stars on anything','star'],
  ['flawless','Flawless','Play a song at 100%','spark'],
  ['pr5','Personal best ×5','Beat your own record five times','up'],
  ['streak3','On a roll','Three days of riyaz in a row','flame'],
  ['streak7','A week of riyaz','Seven days in a row','flame'],
  ['streak30','A month of riyaz','Thirty days in a row','flame'],
  ['hour1','First hour','Practise for 60 minutes in total','clock'],
  ['hour10','Ten hours','Practise for 10 hours in total','clock'],
  ['songs10','Ten pieces','Finish ten different songs or exercises','list'],
  ['songs50','Fifty pieces','Finish fifty different songs or exercises','list'],
  ['multi','Multi-instrumentalist','Practise on three instruments','multi'],
  ['raag5','Raag explorer','Practise five different raags','sun'],
  ['ears','Listening ears','Finish a song with the microphone on','mic'],
  ['patience','Patience','Finish a song at 50% speed','slow'],
  ['morning','Morning riyaz','Practise before 8 in the morning','sunrise'],
  ['comeback','Welcome back','Return after a week or more away','home']];
const TICON={note:'<path d="M10 17V6l8-2v11"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="15.5" cy="15" r="2.5"/>',chord:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9.7 4v16M14.3 4v16M5 9.3h14M5 14.6h14"/>',
  star:'<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',spark:'<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
  up:'<path d="M4 17l6-6 4 4 6-7"/><path d="M15 8h5v5"/>',flame:'<path d="M12 21c-3.9 0-6-2.6-6-5.7 0-3.6 3-5.6 3.6-9.3 1.9 1.3 3 3.2 3.1 5 .9-.6 1.5-1.6 1.6-2.7 1.9 1.6 3.7 4 3.7 7 0 3.1-2.1 5.7-6 5.7z"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',list:'<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r=".8"/><circle cx="5" cy="12" r=".8"/><circle cx="5" cy="17" r=".8"/>',
  multi:'<circle cx="8" cy="9" r="3.5"/><circle cx="16" cy="9" r="3.5"/><circle cx="12" cy="15.5" r="3.5"/>',sun:'<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  mic:'<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21"/>',slow:'<path d="M3 15c2-4 5-6 9-6s7 2 9 6"/><path d="M12 15l3-4"/>',
  sunrise:'<path d="M5 17a7 7 0 0 1 14 0M3 20h18M12 4v4M5.5 9.5l2 1.5M18.5 9.5l-2 1.5"/>',home:'<path d="M4 11l8-6 8 6v8H4z"/><path d="M10 19v-5h4v5"/>',
  ice:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5"/>'};
const ticon=(k,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${TICON[k]}</svg>`;
const Game={s:null,
  load(){try{this.s=JSON.parse(localStorage.getItem(G_KEY));}catch(e){this.s=null;}
    this.s=Object.assign({xp:0,days:{},frozen:{},freezes:0,freezeAt:0,best:0,goal:10,weekGoal:3,pr:{},ach:{},played:{},raags:{},insts:{},tot:{sec:0,prs:0}},this.s||{});},
  save(){try{localStorage.setItem(G_KEY,JSON.stringify(this.s));}catch(e){}},
  key(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');},
  shift(k,n){const[y,m,d]=k.split('-').map(Number);return this.key(new Date(y,m-1,d+n));},
  done(k){const d=this.s.days[k];return!!(d&&d.songs>0);},
  alive(k){return this.done(k)||!!this.s.frozen[k];},
  /* consecutive days of riyaz, counting today only once it's done; frozen days keep the chain */
  streak(){let k=this.key();if(!this.alive(k))k=this.shift(k,-1);let n=0;while(this.alive(k)){if(this.done(k))n++;k=this.shift(k,-1);}return n;},
  /* would the streak survive until today's session? (gap fits the freezes held) */
  atRisk(){const today=this.key();if(this.done(today))return false;const y=this.shift(today,-1);if(this.alive(y))return false;
    for(let i=2;i<=40;i++){const k=this.shift(today,-i);if(this.alive(k))return i-1<=this.s.freezes?'freeze':'lost';}return false;},
  level(xp=this.s.xp){let L=1,need=100,acc=0;while(xp>=acc+need){acc+=need;L++;need=100+(L-1)*60;}return{L,into:xp-acc,need,rank:RANKS.filter(r=>r[0]<=L).pop()[1]};},
  todaySec(){const d=this.s.days[this.key()];return d?d.sec:0;},
  week(){const now=new Date(),dow=(now.getDay()+6)%7,mon=this.shift(this.key(),-dow);return[...Array(7)].map((_,i)=>this.shift(mon,i));},
  weekDays(){return this.week().filter(k=>this.done(k)).length;},
  /* record a session (finished or not) and return everything the results screen animates */
  record(r){const s=this.s,k=this.key(),hour=new Date().getHours(),out={xp:0,parts:[],ach:[],usedFreeze:0,gotFreeze:false,pr:null,comeback:false};
    out.before={xp:s.xp,lvl:this.level(),streak:this.streak(),today:this.todaySec(),todayDone:this.done(k)};
    if(r.completed&&!this.done(k)){let last=0;for(let i=1;i<=400;i++){if(this.done(this.shift(k,-i))||s.frozen[this.shift(k,-i)]){last=i;break;}}
      if(last>1){const miss=last-1;if(miss<=s.freezes){for(let i=1;i<=miss;i++)s.frozen[this.shift(k,-i)]=1;s.freezes-=miss;out.usedFreeze=miss;}}
      if(last>=8||(!last&&Object.keys(s.days).length&&s.tot.sec>0)){if(last>=8)out.comeback=true;}}
    const day=s.days[k]=s.days[k]||{sec:0,xp:0,songs:0};const sec=Math.max(0,Math.round(r.elapsed||0));day.sec+=sec;s.tot.sec+=sec;
    const tXP=Math.round(sec/60*10);if(tXP)out.parts.push(['Practice',tXP]);
    if(r.completed){day.songs++;const pk=r.inst+':'+r.song.id;s.insts[r.inst]=1;if(r.song.coll==='raag'||/^r-/.test(r.song.id))s.raags[(r.song.id.match(/^r-([a-z]+)/)||[])[1]||r.song.id]=1;
      if(!s.played[pk]){s.played[pk]=1;out.parts.push(['First time',20]);}
      if(r.stars)out.parts.push(['Stars',r.stars*10]);if(r.pct>=100)out.parts.push(['Flawless',25]);
      const prev=s.pr[pk];if(!prev||r.pct>prev.acc){s.pr[pk]={acc:r.pct,at:Date.now(),title:r.song.title,inst:r.inst};if(prev&&r.pct>0){out.pr={now:r.pct,was:prev.acc};s.tot.prs++;out.parts.push(['Personal best',15]);}else if(!prev)out.pr={now:r.pct,first:true};}}
    const before=this.level();out.xp=out.parts.reduce((a,p)=>a+p[1],0);s.xp+=out.xp;day.xp+=out.xp;
    const st=this.streak();s.best=Math.max(s.best,st);if(st>0&&st%7===0&&s.freezeAt!==st&&s.freezes<2){s.freezes++;s.freezeAt=st;out.gotFreeze=true;}
    out.after={xp:s.xp,lvl:this.level(),streak:st,today:this.todaySec(),todayDone:this.done(k)};out.levelUp=out.after.lvl.L>before.L;
    out.goalHit=out.before.today<s.goal*60&&out.after.today>=s.goal*60;
    const finished=Object.keys(s.played).length,has=id=>!!s.ach[id],give=id=>{if(!has(id)){s.ach[id]=Date.now();out.ach.push(id);}};
    if(r.completed){give('first');if(r.kind==='chords')give('strum');if(r.stars>=3)give('stars3');if(r.pct>=100)give('flawless');if(r.mode==='mic')give('ears');if(r.speed<=.5)give('patience');}
    if(s.tot.prs>=5)give('pr5');if(st>=3)give('streak3');if(st>=7)give('streak7');if(st>=30)give('streak30');if(s.tot.sec>=3600)give('hour1');if(s.tot.sec>=36000)give('hour10');
    if(finished>=10)give('songs10');if(finished>=50)give('songs50');if(Object.keys(s.insts).length>=3)give('multi');if(Object.keys(s.raags).length>=5)give('raag5');
    if(sec>=60&&hour>=4&&hour<8)give('morning');if(out.comeback&&r.completed)give('comeback');
    this.save();return out;}};
Game.load();

/* ---------- small pieces of UI ---------- */
function ringSVG(p,size=28,stroke=3,cls='ring'){const r=(size-stroke)/2,c=2*Math.PI*r;return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/><circle class="arc" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-clamp(p,0,1))}" transform="rotate(-90 ${size/2} ${size/2})" data-c="${c}"/></svg>`;}
function setRing(svg,p){const a=svg&&svg.querySelector('.arc');if(!a)return;a.style.strokeDashoffset=(+a.dataset.c)*(1-clamp(p,0,1));}
function riyazChip(){const G=Game,p=G.todaySec()/(G.s.goal*60),st=G.streak(),done=G.done(G.key());
  return `<button class="riyaz${done?' lit':''}" id="hRiyaz" aria-label="Riyaz: ${st} day streak, ${Math.round(clamp(p,0,1)*100)}% of today's goal">${ringSVG(p,24,2.6)}${ticon('flame','fl')}<b>${st}</b></button>`;}
function countUp(el,from,to,ms=700,fmt=v=>Math.round(v)){if(!el)return;const t0=performance.now(),E=t=>1-Math.pow(1-t,3);const step=now=>{const u=clamp((now-t0)/ms,0,1);el.textContent=fmt(from+(to-from)*E(u));if(u<1)requestAnimationFrame(step);};requestAnimationFrame(step);}
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
/* soft celebration sounds, only right after the player finishes something */
function blip(f,t,d=.18,a=.07,type='sine'){try{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(a,t+.008);g.gain.exponentialRampToValueAtTime(.0004,t+d);o.connect(g).connect(master);o.start(t);o.stop(t+d+.05);}catch(e){}}
function starSound(i){if(!ctx)return;blip([1318.5,1568,1975.5][i]||1975.5,ctx.currentTime+.01,.22,.06);}
function levelSound(){if(!ctx)return;const t=ctx.currentTime+.02;[523.25,659.25,783.99,1046.5].forEach((f,i)=>blip(f,t+i*.07,.35,.055,'triangle'));}
function confetti(host,burst=1){if(reduceMotion()||!host)return;const c=document.createElement('canvas');c.className='confetti';host.appendChild(c);const W=c.width=host.clientWidth*2,H=c.height=host.clientHeight*2,g=c.getContext('2d');
  const cols=['#111113','#E8572A','#1F9D55','#F5A524','#D9D9D5'],P=[...Array(Math.round(70*burst))].map(()=>({x:W*(.3+Math.random()*.4),y:H*.42,vx:(Math.random()-.5)*W*.018,vy:-(H*.012+Math.random()*H*.018),r:Math.random()*6.28,vr:(Math.random()-.5)*.4,s:6+Math.random()*8,c:cols[Math.random()*cols.length|0],sh:Math.random()<.4}));
  const t0=performance.now();const step=now=>{const t=(now-t0)/1000;g.clearRect(0,0,W,H);for(const p of P){p.vy+=H*.0009;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;g.save();g.globalAlpha=clamp(1.6-t,0,1);g.translate(p.x,p.y);g.rotate(p.r);g.fillStyle=p.c;
      if(p.sh){g.beginPath();g.arc(0,0,p.s*.35,0,6.283);g.fill();}else g.fillRect(-p.s/2,-p.s/5,p.s,p.s/2.5);g.restore();}if(t<1.7)requestAnimationFrame(step);else c.remove();};requestAnimationFrame(step);}

/* ---------- results: the riyaz panel and its choreography ---------- */
function riyazPanel(o,song){const G=Game,goal=G.s.goal*60,b=o.before,a=o.after,trophies=o.ach.map(id=>TROPHIES.find(t=>t[0]===id)).filter(Boolean);
  const lvlB=b.lvl,lvlA=a.lvl,p0=lvlB.L===lvlA.L?lvlB.into/lvlB.need:0,p1=lvlA.into/lvlA.need;
  return `<div class="rz">
    <div class="rz-xp"><div class="rz-xp-top"><span class="rz-lvl"><b id="rzL">Level ${lvlB.L}</b> <small>${lvlA.rank}</small></span><span class="rz-gain" id="rzGain">+0 XP</span></div>
      <div class="rz-bar"><i id="rzBar" style="width:${p0*100}%" data-to="${p1*100}" data-up="${o.levelUp?1:0}" data-l="${lvlA.L}"></i></div>
      <small class="rz-parts">${o.parts.map(p=>`${p[0]} +${p[1]}`).join(' · ')||'Practice counts, even a few seconds'}</small></div>
    <div class="rz-row">
      <div class="rz-tile" id="rzGoal">${ringSVG(b.today/goal,46,4.5,'ring big')}<div><b id="rzMin">${Math.floor(b.today/60)}</b><small> / ${G.s.goal} min today</small><span class="rz-note" id="rzGoalNote">${a.today>=goal?'Daily goal reached':Math.max(1,Math.ceil((goal-a.today)/60))+' min to your goal'}</span></div></div>
      <div class="rz-tile" id="rzStreak">${ticon('flame','fl big'+(a.todayDone?' lit':''))}<div><b class="flip"><span id="rzS">${b.streak}</span></b><small> day streak</small><span class="rz-note">${o.usedFreeze?`A freeze saved your streak`:o.gotFreeze?`You earned a streak freeze`:o.comeback?'Welcome back':a.todayDone?'Today counts':'Finish a piece to count today'}</span></div></div>
    </div>
    ${o.pr&&!o.pr.first?`<div class="rz-pr" id="rzPR">${ticon('up')}<b>New personal best</b><span>${o.pr.now}% · was ${o.pr.was}%</span></div>`:''}
    ${trophies.length?`<div class="rz-ach" id="rzAch">${trophies.map(t=>`<div class="rz-t">${ticon(t[3])}<span><b>${t[1]}</b><small>${t[2]}</small></span></div>`).join('')}</div>`:''}
  </div>`;}
function playResults(o,pct,stars){const sh=$('#sheet');if(!sh)return;const fast=reduceMotion(),T=(ms,f)=>setTimeout(()=>{if(sh.isConnected)f();},fast?0:ms);
  /* stars pop one by one */
  $$('#sheet .bigstars span').forEach((s,i)=>{s.style.opacity=0;T(220+i*230,()=>{s.style.opacity='';if(i<stars){s.animate([{transform:'scale(.2) rotate(-30deg)',opacity:0},{transform:'scale(1.35) rotate(8deg)',opacity:1,offset:.6},{transform:'scale(1)'}],{duration:480,easing:'cubic-bezier(.2,.9,.3,1.2)'});starSound(i);buzz(8);}else s.animate([{opacity:0},{opacity:1}],{duration:260});});});
  countUp($('#shPct'),0,pct,900,v=>Math.round(v)+'%');
  T(700,()=>{countUp($('#rzGain'),0,o.xp,800,v=>'+'+Math.round(v)+' XP');const bar=$('#rzBar');if(!bar)return;
    if(+bar.dataset.up){bar.style.transition='width .55s cubic-bezier(.3,.8,.3,1)';bar.style.width='100%';T(650,()=>{const L=$('#rzL');L.textContent='Level '+bar.dataset.l;L.parentElement.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:520,easing:'cubic-bezier(.2,.9,.3,1.3)'});
        levelSound();buzz([10,40,10]);confetti(sh,1.2);bar.style.transition='none';bar.style.width='0%';requestAnimationFrame(()=>{bar.style.transition='width .6s cubic-bezier(.3,.8,.3,1)';bar.style.width=bar.dataset.to+'%';});});}
    else{bar.style.transition='width .9s cubic-bezier(.3,.8,.3,1)';requestAnimationFrame(()=>bar.style.width=bar.dataset.to+'%');}});
  T(900,()=>{const goal=Game.s.goal*60,ring=$('#rzGoal svg');if(ring){ring.querySelector('.arc').style.transition='stroke-dashoffset 1s cubic-bezier(.3,.8,.3,1)';setRing(ring,o.after.today/goal);}
    countUp($('#rzMin'),Math.floor(o.before.today/60),Math.floor(o.after.today/60),900);
    if(o.goalHit)T(1000,()=>{$('#rzGoal').animate([{transform:'scale(1)'},{transform:'scale(1.05)'},{transform:'scale(1)'}],{duration:420,easing:'ease-out'});blip(1760,ctx.currentTime+.01,.25,.05);});});
  if(o.after.streak!==o.before.streak)T(1500,()=>{const el=$('#rzS');if(!el)return;el.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-70%)',opacity:0}],{duration:180,easing:'ease-in'}).onfinish=()=>{el.textContent=o.after.streak;
      el.animate([{transform:'translateY(70%)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:260,easing:'cubic-bezier(.2,.9,.3,1.2)'});};
    const f=$('#rzStreak .fl');if(f){f.classList.add('lit');f.animate([{transform:'scale(.6)'},{transform:'scale(1.3)'},{transform:'scale(1)'}],{duration:520,easing:'cubic-bezier(.2,.9,.3,1.2)'});}blip(1046.5,ctx.currentTime+.01,.3,.05,'triangle');});
  T(1900,()=>{const pr=$('#rzPR');if(pr){pr.classList.add('in');buzz(6);}});
  $$('#rzAch .rz-t').forEach((t,i)=>T(2200+i*320,()=>{t.classList.add('in');blip(1568+i*120,ctx.currentTime+.01,.2,.045);}));
  if(stars>=3&&!o.levelUp)T(950,()=>confetti(sh,.8));}

/* ---------- the riyaz sheet: everything about your practice ---------- */
function openRiyaz(){const G=Game,s=G.s,L=G.level(),goal=s.goal*60,today=G.todaySec(),st=G.streak(),risk=G.atRisk(),days=['M','T','W','T','F','S','S'],wk=G.week(),tk=G.key();
  /* 12-week calendar, Monday rows like Strava */
  const start=G.shift(wk[0],-77),cells=[];for(let w=0;w<12;w++)for(let d=0;d<7;d++){const k=G.shift(start,w*7+d),m=(s.days[k]||{}).sec||0,lvl=m<=0?0:m<goal*.5?1:m<goal?2:3;cells.push(`<i class="c${s.frozen[k]?' ice':''} l${lvl}${k===tk?' today':''}${k>tk?' fut':''}" style="grid-column:${w+1};grid-row:${d+1}"></i>`);}
  const prs=Object.values(s.pr).filter(p=>p.title).sort((a,b)=>b.at-a.at).slice(0,4),earned=TROPHIES.filter(t=>s.ach[t[0]]).length;
  sheet(`<span class="grab"></span><div class="rs">
    <div class="rs-head"><div><p class="eyebrow">Riyaz</p><h2>Level ${L.L} <small>${L.rank}</small></h2></div><span class="rs-xp">${s.xp} XP</span></div>
    <div class="rz-bar big"><i style="width:${L.into/L.need*100}%"></i></div><small class="rs-sub">${L.need-L.into} XP to level ${L.L+1}</small>
    <div class="rs-grid">
      <div class="rs-card">${ringSVG(today/goal,64,6,'ring big')}<div><b>${Math.floor(today/60)}<small> / ${s.goal} min</small></b><span>Today’s riyaz</span>
        <div class="rs-goal">${[5,10,20,30].map(m=>`<button class="opt" data-goal="${m}" aria-pressed="${m===s.goal}">${m}</button>`).join('')}<small>min goal</small></div></div></div>
      <div class="rs-card">${ticon('flame','fl big'+(G.done(tk)?' lit':''))}<div><b>${st}<small> day${st===1?'':'s'}</small></b><span>${risk==='freeze'?'A freeze will keep your streak':risk==='lost'?'Start a new streak today':G.done(tk)?'Streak · best '+s.best:'Finish a piece today to keep it'}</span>
        <div class="rs-fr">${[0,1].map(i=>`<span class="${i<s.freezes?'on':''}" title="Streak freeze">${ticon('ice')}</span>`).join('')}<small>${s.freezes} of 2 freezes · earn one every 7 days</small></div></div></div>
    </div>
    <div class="rs-week"><div class="rs-wk-top"><b>This week</b><span>${G.weekDays()} of ${s.weekGoal} days</span></div>
      <div class="rs-days">${wk.map((k,i)=>`<div class="${G.done(k)?'on':s.frozen[k]?'ice':''}${k===tk?' today':''}"><i></i><small>${days[i]}</small></div>`).join('')}</div></div>
    <div class="rs-cal"><div class="rs-wk-top"><b>Last 12 weeks</b><span>${Object.keys(s.days).filter(k=>G.done(k)).length} days of riyaz</span></div><div class="cal">${cells.join('')}</div></div>
    <div class="rs-tro"><div class="rs-wk-top"><b>Trophy case</b><span>${earned} of ${TROPHIES.length}</span></div>
      <div class="tro">${TROPHIES.map(t=>`<button class="t${s.ach[t[0]]?' on':''}" data-t="${t[0]}">${ticon(t[3])}<small>${t[1]}</small></button>`).join('')}</div><p class="tro-desc" id="troDesc">Tap a trophy to see how to earn it.</p></div>
    ${prs.length?`<div class="rs-prs"><div class="rs-wk-top"><b>Personal bests</b></div>${prs.map(p=>`<div class="pr-row"><span>${p.title}<small>${I[p.inst]?I[p.inst].name:''}</small></span><b>${p.acc}%</b></div>`).join('')}</div>`:''}
  </div>`);
  const sh=$('#sheet');sh.classList.add('rs-wrap');sh.addEventListener('click',e=>{if(e.target===sh)closeSheet();});
  $$('#sheet [data-goal]').forEach(b=>b.onclick=()=>{s.goal=+b.dataset.goal;Game.save();$$('#sheet [data-goal]').forEach(x=>x.setAttribute('aria-pressed',x===b));setRing($('#sheet .rs-card svg'),G.todaySec()/(s.goal*60));$('#sheet .rs-card b').innerHTML=`${Math.floor(G.todaySec()/60)}<small> / ${s.goal} min</small>`;refreshChip();});
  $$('#sheet .tro .t').forEach(b=>b.onclick=()=>{const t=TROPHIES.find(x=>x[0]===b.dataset.t);$('#troDesc').textContent=(s.ach[t[0]]?'Earned · ':'')+t[1]+': '+t[2];b.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:300,easing:'ease-out'});});
  /* rings and cells draw in */
  if(!reduceMotion()){const ring=$('#sheet .rs-card svg .arc');if(ring){const to=ring.style.strokeDashoffset||ring.getAttribute('stroke-dashoffset');ring.style.strokeDashoffset=ring.dataset.c;requestAnimationFrame(()=>{ring.style.transition='stroke-dashoffset 1s cubic-bezier(.3,.8,.3,1)';ring.style.strokeDashoffset=to;});}
    $$('#sheet .cal i').forEach((c,i)=>c.animate([{transform:'scale(0)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:260,delay:120+(i/7|0)*28,easing:'cubic-bezier(.2,.9,.3,1.2)',fill:'backwards'}));
    $$('#sheet .tro .t.on').forEach((c,i)=>c.animate([{transform:'scale(.6)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:320,delay:300+i*40,easing:'cubic-bezier(.2,.9,.3,1.3)',fill:'backwards'}));}}
function refreshChip(animate){const el=$('#hRiyaz');if(!el)return;const wrap=document.createElement('div');wrap.innerHTML=riyazChip();const nu=wrap.firstChild;el.replaceWith(nu);nu.onclick=openRiyaz;
  if(animate&&!reduceMotion())nu.animate([{transform:'scale(1)'},{transform:'scale(1.15)'},{transform:'scale(1)'}],{duration:480,easing:'cubic-bezier(.2,.9,.3,1.3)'});}
