
/* ================= first steps: what you want to do, then your instrument =================
   Landing → Goal → Instruments → Instrument home. Back walks the same path.
   The goal only decides which tab you start on; every tab stays one tap away. */
const GOALS=[
  {id:'learn',tab:'learn',t:'Learn to play',d:'Short lessons from your very first note, and a little riyaz every day.',
    ic:'<path d="M4 6.5 12 3l8 3.5-8 3.5z"/><path d="M7 8v5.2c0 1.6 2.2 2.8 5 2.8s5-1.2 5-2.8V8"/><path d="M20 6.5V12"/>'},
  {id:'songs',tab:'songs',t:'Play songs I love',d:'Pick a song and a part, choose your level and play along.',
    ic:'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'},
  {id:'create',tab:'create',t:'Make my own arrangements',d:'Write chords or tab for a song on YouTube, then practise it.',
    ic:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'},
  {id:'chal',tab:'chal',t:'Challenge my friends',d:'Timed runs and duels. Pass the phone and see who tops the board.',
    ic:'<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>'}];
const IMETA={
  guitar:{cat:'Strings',line:'Chords, tabs and real songs',alias:'gitar acoustic electric chords'},
  sitar:{cat:'Strings',line:'Melodies, sargam and raags',alias:'sitaar strings'},
  harmonium:{cat:'Keys',line:'Melodies, sargam and raags',alias:'keyboard piano baaja peti'},
  tabla:{cat:'Percussion',line:'Bols, thekas and taals',alias:'drums percussion rhythm'},
  bansuri:{cat:'Wind',line:'Melodies, sargam and raags',alias:'flute basuri wind'},
  vocals:{cat:'Voice',line:'Sing sargam, raags and melodies',alias:'singing voice vocal gaana'}};
const ICATS=['All','Strings','Keys','Percussion','Wind','Voice'];
const goalOf=()=>GOALS.find(g=>g.id===S.goal);
function goalTab(){const g=goalOf();return g?g.tab:'learn';}
const FIC={back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>'};

const Flow={
  /* the landing button: first time → goal; afterwards straight back to your instrument */
  begin(){$('#begin').classList.add('lit');if(S.goal&&S.inst)return this.go('home');this.go('goal');},
  go(to){const from=['landing','goal','picker','home'].find(id=>!$('#'+id).hidden);if(from)$('#'+from).classList.add('leave');
    setTimeout(()=>{if(to==='goal')this.renderGoal();if(to==='picker')this.renderPicker();showScene(to);if(to==='home'){renderHome();$('#hscroll').scrollTop=0;}
      if(to==='picker')requestAnimationFrame(()=>this.drawThumbs());if(to==='landing')requestAnimationFrame(()=>Landing.layout());},from==='landing'?320:120);},
  onboarding(){return!S.onboarded;},

  /* ---------- goal ---------- */
  renderGoal(){let pick=S.goal||null;const el=$('#goal');
    el.innerHTML=`<div class="top"><button class="ib" data-back aria-label="Back">${FIC.back}</button>${this.onboarding()?'<span class="stepn">Step 1 of 2</span>':''}<span class="sp"></span></div>
      <div class="hscroll"><header class="h-head"><h1>What would you like to do first?</h1><p class="lede">You can do all of it later. This just decides where you start.</p></header>
      <div class="goals" role="radiogroup" aria-label="Goal">${GOALS.map(g=>`<button class="gcard" role="radio" aria-checked="${pick===g.id}" data-g="${g.id}">
        <span class="gic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${g.ic}</svg></span>
        <span class="gt"><b>${g.t}</b><small>${g.d}</small></span><span class="gdot"></span></button>`).join('')}</div></div>
      <div class="dock"><button class="cta" id="gnext" ${pick?'':'disabled'}><span class="lbl">Continue</span></button></div>`;
    el.querySelector('[data-back]').onclick=()=>this.go('landing');
    el.querySelector('.goals').onclick=e=>{const b=e.target.closest('[data-g]');if(!b)return;pick=b.dataset.g;buzz(4);
      el.querySelectorAll('.gcard').forEach(x=>x.setAttribute('aria-checked',x===b));$('#gnext').disabled=false;};
    $('#gnext').onclick=()=>{if(!pick)return;S.goal=pick;saveS();HV.tab=goalTab();this.go('picker');};},

  /* ---------- instruments: everything on one page, like a menu ---------- */
  F:{q:'',cat:'All'},
  renderPicker(){const el=$('#picker'),g=goalOf(),F=this.F;
    const sub={learn:'Every instrument starts from the first note.',songs:'Guitar plays along with real recordings. The others have melodies and raags to play.',
      create:'Chord and tab charts are on guitar. On the others, bring songs in as MIDI files.',chal:'Challenges work on every instrument.'}[g?g.id:'learn'];
    el.innerHTML=`<div class="top"><button class="ib" data-back aria-label="Back">${FIC.back}</button>${this.onboarding()?'<span class="stepn">Step 2 of 2</span>':''}<span class="sp"></span></div>
      <div class="hscroll"><header class="h-head"><h1>Choose your instrument</h1><p class="lede">${sub}</p></header>
      <label class="search">${ICS}<input id="iq" type="search" inputmode="search" autocomplete="off" placeholder="Search instruments" value="${esc(F.q)}"></label>
      <div class="chips" id="icats">${ICATS.map(c=>`<button class="opt" data-cat="${c}" aria-pressed="${F.cat===c}">${c}</button>`).join('')}</div>
      <div class="ilist" id="ilist"></div>${NATIVE?'<button class="import" id="micCheck">Check your microphone</button><p class="fine">Plays nothing. Shows whether your guitar reaches the app, with a meter and a self-test.</p>':''}</div>`;
    el.querySelector('[data-back]').onclick=()=>this.go('goal');
    const mc=el.querySelector('#micCheck');if(mc)mc.onclick=openMicCheck;
    $('#iq').addEventListener('input',e=>{F.q=e.target.value;this.fillPicker();this.drawThumbs();});
    $('#icats').onclick=e=>{const b=e.target.closest('[data-cat]');if(!b)return;F.cat=b.dataset.cat;$$('#icats .opt').forEach(x=>x.setAttribute('aria-pressed',x===b));this.fillPicker();this.drawThumbs();};
    $('#ilist').onclick=e=>{const b=e.target.closest('[data-inst]');if(!b)return;this.choose(b.dataset.inst);};
    this.fillPicker();},
  tags(key){const g=goalOf(),fam=famOf(key),out=[];
    if(g&&g.id==='songs'){if(key==='guitar')out.push(['Real songs','ok']);else if(fam==='tabla')out.push(['Taals, no songs yet','mute']);}
    if(g&&g.id==='create'){if(key==='guitar')out.push(['Chart chords and tab','ok']);else if(fam!=='tabla')out.push(['Import MIDI songs','mute']);}
    if(S.onboarded&&S.inst===key)out.push(['Last played','mute']);return out;},
  counts(key){const fam=famOf(key),cat=catalog(fam),L=LEARN_C[fam]||[],nl=cat.filter(s=>L.includes(s.coll)).length,ns=fam==='tabla'?0:cat.filter(s=>SONG_C.includes(s.coll)).length+(fam==='guitar'?allRecs().length:0);
    return[nl&&`${nl} lessons`,ns&&`${ns} songs`].filter(Boolean).join(' · ');},
  fillPicker(){const F=this.F,q=F.q.trim().toLowerCase(),keys=ORDER.filter(k=>{const m=IMETA[k],inst=I[k];
      return(F.cat==='All'||m.cat===F.cat)&&(!q||(inst.name+' '+inst.hi+' '+m.cat+' '+m.line+' '+m.alias).toLowerCase().includes(q));});
    $('#ilist').innerHTML=keys.map(k=>{const inst=I[k],m=IMETA[k];return `<button class="irow" data-inst="${k}" aria-label="${inst.name}, ${m.line}">
        <span class="ith${inst.rot?' rot':''}"><canvas data-k="${k}" aria-hidden="true"></canvas></span>
        <span class="it"><span class="nm"><b>${inst.name}</b><span class="hi">${inst.hi}</span></span><small class="cat">${m.cat}</small>
          <span class="line">${m.line}</span><span class="meta">${this.counts(k)}</span>
          ${this.tags(k).map(([t,c])=>`<span class="tag ${c}">${t}</span>`).join('')}</span><span class="r">${FIC.chev}</span></button>`;}).join('')||
      `<p class="empty">No instrument matches “${esc(F.q)}”.<br>Fretopia teaches guitar, sitar, harmonium, tabla, bansuri and singing for now.</p>`;},
  /* the same line drawings as before, drawn once as pictures */
  drawThumbs(){$$('#ilist canvas').forEach(cv=>{const inst=I[cv.dataset.k],f=fitCanvas(cv);if(!f)return;const c={inst,canvas:cv,W:f.W,H:f.H};initInst(c);f.g.clearRect(0,0,f.W,f.H);
      try{if(inst.rot){f.g.save();f.g.translate(0,f.H);f.g.rotate(-Math.PI/2);inst.draw(f.g,now(),1);f.g.restore();}else inst.draw(f.g,now(),1);}catch(e){}});},
  choose(key){ac();S.inst=key;S.onboarded=true;saveS();HV.tab=goalTab();HV.q=HV.sq='';HV.lc=HV.sc='all';buzz(6);this.go('home');}};

/* open one part straight from a link: …/#part=<arrangement id> */
function openFromHash(){const m=/^#part=([\w-]+)/.exec(location.hash||'');if(!m)return;const a=arrOf(m[1]);if(!a)return;
  S.inst='guitar';if(!S.goal)S.goal='songs';S.onboarded=true;saveS();HV.tab='songs';showScene('home');renderHome();playArr(a);}
setTimeout(openFromHash,300);
