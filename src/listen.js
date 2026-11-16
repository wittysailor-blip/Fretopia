/* ================= listening engine =================
   Written for Fretopia from standard, published methods:
   - continuous capture through an AudioWorklet (ScriptProcessor fallback), so every hop is analysed with sample-accurate times
   - onsets: log-magnitude spectral flux with a max-filtered reference frame and adaptive peak picking
   - pitch: YIN difference function computed with FFT cross-correlation, parabolic refinement, cents
   - chords: semitone spectrum -> local whitening -> non-negative note activations against harmonic templates
     (multiplicative updates) -> chroma -> cosine match against chord templates
   - tabla: low-band vs mid-band energy right after each onset separates bayan, dayan and both
   - latency: measured automatically from the count-in clicks heard by the microphone                         */
function makeFFT(n){const lev=Math.round(Math.log2(n)),cs=new Float32Array(n/2),sn=new Float32Array(n/2),rev=new Uint32Array(n);
  for(let i=0;i<n/2;i++){cs[i]=Math.cos(2*Math.PI*i/n);sn[i]=Math.sin(2*Math.PI*i/n);}
  for(let i=0;i<n;i++){let r=0,x=i;for(let b=0;b<lev;b++){r=(r<<1)|(x&1);x>>=1;}rev[i]=r;}
  return function(re,im,inv){for(let i=0;i<n;i++){const j=rev[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
    for(let size=2;size<=n;size<<=1){const half=size>>1,step=n/size;for(let i=0;i<n;i+=size){for(let j=i,k=0;j<i+half;j++,k+=step){const c=cs[k],s=inv?sn[k]:-sn[k],l=j+half,tr=re[l]*c-im[l]*s,ti=re[l]*s+im[l]*c;re[l]=re[j]-tr;im[l]=im[j]-ti;re[j]+=tr;im[j]+=ti;}}}
    if(inv){for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}}};}
const hann=n=>{const w=new Float32Array(n);for(let i=0;i<n;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));return w;};

/* chord vocabulary */
const CH_TYPES={'':[0,4,7],m:[0,3,7],'7':[0,4,7,10],maj7:[0,4,7,11],m7:[0,3,7,10],sus2:[0,2,7],sus4:[0,5,7],dim:[0,3,6]};
const PC_NAME=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'],PC_OF={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
function chordParse(name){const m=/^([A-G](?:#|b)?)(.*)$/.exec(name);if(!m)return null;let ty=m[2];if(!(ty in CH_TYPES))ty=ty.startsWith('m')&&!ty.startsWith('maj')?'m':'';return{root:PC_OF[m[1]],type:ty,pcs:CH_TYPES[ty].map(i=>(PC_OF[m[1]]+i)%12)};}
function chordTemplate(c){const v=new Float32Array(12);c.pcs.forEach((p,i)=>v[p]=i===0?1:i===c.pcs.length-1&&c.pcs.length>3?.75:.9);return v;}
const CHORD_VOCAB=(()=>{const out=[];for(let r=0;r<12;r++)for(const t in CH_TYPES){const c={root:r,type:t,pcs:CH_TYPES[t].map(i=>(r+i)%12)};c.name=PC_NAME[r]+t;c.tpl=chordTemplate(c);out.push(c);}return out;})();
function cosSim(a,b){let d=0,na=0,nb=0;for(let i=0;i<12;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return na&&nb?d/Math.sqrt(na*nb):0;}
/* how well a chroma frame fits an expected chord, relative to every other chord */
function chordFit(chroma,name){const c=chordParse(name);if(!c||!chroma)return{ok:false,sim:0,best:null};const tpl=chordTemplate(c),sim=cosSim(chroma,tpl);let best=null,bs=-1;
  for(const v of CHORD_VOCAB){const s=cosSim(chroma,v.tpl)-(v.pcs.length>3?.02:0);if(s>bs){bs=s;best=v;}}
  return{ok:sim>.62&&sim>=bs-.06,sim,best:best&&best.name};}

const Ear={active:false,sr:48000,N:16384,ring:new Float32Array(16384),w:0,next:4096,hop:512,endT:0,endW:0,
  lat:(()=>{try{const v=parseFloat(localStorage.getItem('fretopia.lat'));return isFinite(v)?v:.03;}catch(e){return .03;}})(),
  want:{chroma:false},onsets:[],pitch:null,chroma:null,level:0,flux:[],fluxT:[],bands:[],hopN:0,lastOnset:-1,
  setup(){if(this.f2)return;this.f2=makeFFT(2048);this.f4=makeFFT(4096);this.f8=makeFFT(8192);this.h2=hann(2048);this.h8=hann(8192);
    this.re2=new Float32Array(2048);this.im2=new Float32Array(2048);this.re4=new Float32Array(4096);this.im4=new Float32Array(4096);this.ra=new Float32Array(4096);this.ia=new Float32Array(4096);
    this.re8=new Float32Array(8192);this.im8=new Float32Array(8192);this.prevL=new Float32Array(1025);this.L=new Float32Array(1025);this.buf=new Float32Array(8192);this.tpl=null;},
  async attach(stream){this.setup();this.sr=ctx.sampleRate;this.w=0;this.next=4096;this.endW=0;this.flux=[];this.fluxT=[];this.bands=[];this.onsets=[];this.pitch=null;this.chroma=null;this.prevL.fill(0);this.hopN=0;
    this.src=ctx.createMediaStreamSource(stream);const sink=ctx.createGain();sink.gain.value=0;sink.connect(ctx.destination);this.sink=sink;
    try{if(!ctx.audioWorklet)throw 0;if(!Ear.mod){const code=`class F extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(1024);this.n=0;}process(i){const x=i[0]&&i[0][0];if(x){for(let k=0;k<x.length;k++){this.b[this.n++]=x[k];if(this.n===1024){this.port.postMessage({d:this.b,t:currentTime+(k+1)/sampleRate});this.b=new Float32Array(1024);this.n=0;}}}return true;}}registerProcessor('fretopia-ear',F);`;
        await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));Ear.mod=true;}
      this.node=new AudioWorkletNode(ctx,'fretopia-ear',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});this.node.port.onmessage=e=>this.push(e.data.d,e.data.t);}
    catch(e){this.node=ctx.createScriptProcessor(1024,1,1);this.node.onaudioprocess=e=>{this.push(new Float32Array(e.inputBuffer.getChannelData(0)),ctx.currentTime);};}
    this.src.connect(this.node);this.node.connect(sink);this.active=true;},
  detach(){try{this.src&&this.src.disconnect();this.node&&this.node.disconnect();this.sink&&this.sink.disconnect();}catch(e){}if(this.node&&this.node.port)this.node.port.onmessage=null;this.node=this.src=null;this.active=false;},
  timeOf(i){return this.endT-(this.endW-i)/this.sr;},
  push(d,t){if(!this.active)return;const N=this.N;for(let k=0;k<d.length;k++)this.ring[(this.w+k)%N]=d[k];this.w+=d.length;this.endT=t;this.endW=this.w;
    let guard=0;while(this.next<=this.w&&guard++<16){this.analyse(this.next);this.next+=this.hop;}if(this.next<=this.w)this.next=this.w;},
  copy(end,n,out){const N=this.N;for(let k=0;k<n;k++)out[k]=this.ring[(end-n+k+N*4)%N];return out;},
  analyse(end){const sr=this.sr,b=this.copy(end,2048,this.buf);let rms=0;for(let k=1024;k<2048;k++)rms+=b[k]*b[k];rms=Math.sqrt(rms/1024);this.level=this.level*.7+rms*.3;this.rms=rms;
    /* spectral flux on a 2048 Hann frame */
    const re=this.re2,im=this.im2;for(let k=0;k<2048;k++){re[k]=b[k]*this.h2[k];im[k]=0;}this.f2(re,im,false);
    const L=this.L,P=this.prevL,kmax=Math.min(1024,Math.round(8000/sr*2048)),f0=Math.round(100/sr*2048),f1=Math.round(5000/sr*2048);let fl=0,lo=0,hi=0,gl=0,ga=0;
    for(let k=1;k<=kmax;k++){const mag=Math.hypot(re[k],im[k]),f=k*sr/2048;L[k]=Math.log1p(60*mag);const ref=Math.max(P[k-1]||0,P[k],P[k+1]||0),dv=L[k]-ref;if(dv>0)fl+=dv;const p=mag*mag;if(f>=45&&f<190)lo+=p;else if(f>=240&&f<2600)hi+=p;if(k>=f0&&k<=f1){gl+=Math.log(p+1e-12);ga+=p;}}const nb=f1-f0+1,flat=ga>0?Math.exp(gl/nb)/(ga/nb):1;
    this.prevL.set(L);const tc=this.timeOf(end-1024);this.flux.push(fl);this.fluxT.push(tc);this.bands.push([lo,hi,rms,flat]);if(this.flux.length>64){this.flux.shift();this.fluxT.shift();this.bands.shift();}
    this.pick();
    this.hopN++;if(this.hopN%2===0)this.pitchAt(end);
    if(this.want.chroma&&this.hopN%4===0)this.chromaAt(end);},
  /* adaptive peak picking two hops back: local maximum, above a running median plus margin, above the level gate */
  pick(){const F=this.flux,n=F.length;if(n<8)return;const i=n-3,v=F[i];if(!(v>=F[i-1]&&v>=F[i-2]&&v>F[i+1]&&v>=F[i+2]))return;
    const win=F.slice(Math.max(0,i-14),i).sort((a,b)=>a-b),med=win[win.length>>1]||0,gate=(typeof Mic!=='undefined'&&Mic.gate)||.01;
    const B=this.bands,rmsMax=Math.max(B[i][2],B[i+1][2],B[i+2][2]),before=Math.min(B[i-1][2],B[i-2][2],B[i-3][2]);if(rmsMax<gate*1.2)return;
    /* a real attack makes the sound louder; a glide or a decaying ring does not */
    if(rmsMax<before*1.35&&rmsMax<before+gate*2)return;if(v<med*1.6+4)return;
    const t=this.fluxT[i];if(t-this.lastOnset<.07)return;this.lastOnset=t;
    let lo=0,hi=0;for(let j=i;j<n;j++){lo=Math.max(lo,B[j][0]);hi=Math.max(hi,B[j][1]);}const flat=(B[i+1][3]+B[i+2][3])/2;
    this.onsets.push({raw:t,t:t-this.lat,str:v-med,lo,hi,flat});if(this.onsets.length>32)this.onsets.shift();},
  /* YIN with FFT cross-correlation: W=1024, tau up to ~1/60 s */
  pitchAt(end){const sr=this.sr,x=this.copy(end,2048,this.buf),W=1024,maxT=Math.min(1000,Math.floor(sr/62)),minT=Math.floor(sr/1500);
    if(this.rms<((typeof Mic!=='undefined'&&Mic.gate)||.008)*.6){this.pitch={f:null,t:this.timeOf(end-1024)};return;}
    const A=this.re4,Ai=this.im4,Bm=this.ra,Bi=this.ia;for(let k=0;k<4096;k++){A[k]=k<2048?x[k]:0;Ai[k]=0;Bm[k]=k<W?x[k]:0;Bi[k]=0;}
    this.f4(A,Ai,false);this.f4(Bm,Bi,false);for(let k=0;k<4096;k++){const r=A[k]*Bm[k]+Ai[k]*Bi[k],i=Ai[k]*Bm[k]-A[k]*Bi[k];A[k]=r;Ai[k]=i;}this.f4(A,Ai,true);
    let e0=0;for(let k=0;k<W;k++)e0+=x[k]*x[k];const d=new Float32Array(maxT+2);let et=e0;d[0]=0;
    for(let t=1;t<=maxT+1;t++){et+=x[t+W-1]*x[t+W-1]-x[t-1]*x[t-1];d[t]=Math.max(0,e0+et-2*A[t]);}
    let run=0,tau=-1;const c=new Float32Array(maxT+2);c[0]=1;for(let t=1;t<=maxT+1;t++){run+=d[t];c[t]=run?d[t]*t/run:1;}
    for(let t=minT;t<=maxT;t++){if(c[t]<.15){while(t+1<=maxT&&c[t+1]<c[t])t++;tau=t;break;}}
    if(tau<2){let bm=.3,bt=-1;for(let t=minT;t<=maxT;t++)if(c[t]<bm){bm=c[t];bt=t;}if(bt>0){tau=bt;while(tau+1<=maxT&&c[tau+1]<c[tau])tau++;}}
    if(tau<2){this.pitch={f:null,t:this.timeOf(end-1024)};return;}const a=c[tau-1],m=c[tau],z=c[tau+1],den=a+z-2*m,off=den?(a-z)/(2*den):0;
    this.pitch={f:sr/(tau+off),clar:1-m,t:this.timeOf(end-1024)-this.lat};},
  /* note activations and chroma from an 8192 frame */
  chromaAt(end){const sr=this.sr,x=this.copy(end,8192,this.buf),re=this.re8,im=this.im8;for(let k=0;k<8192;k++){re[k]=x[k]*this.h8[k];im[k]=0;}this.f8(re,im,false);
    const M0=36,M1=96,S=new Float32Array(M1-M0+1);for(let k=2;k<4096;k++){const f=k*sr/8192;if(f<60||f>2100)continue;const m=69+12*Math.log2(f/440),j=Math.round(m),w=1-Math.abs(m-j)*1.4;if(j<M0||j>M1||w<=0)continue;S[j-M0]+=w*Math.hypot(re[k],im[k]);}
    let tot=0;for(let i=0;i<S.length;i++){S[i]=Math.sqrt(S[i]);tot+=S[i];}if(tot<1e-3){this.chroma=null;return;}
    const Wn=new Float32Array(S.length);for(let i=0;i<S.length;i++){let s=0,n=0;for(let j=Math.max(0,i-6);j<=Math.min(S.length-1,i+6);j++){s+=S[j];n++;}Wn[i]=Math.max(0,S[i]-.7*s/n);}
    if(!this.tpl){const T=[];for(let m=40;m<=79;m++){const v=new Float32Array(S.length);for(let h=1;h<=6;h++){const j=Math.round(m+12*Math.log2(h))-M0;if(j>=0&&j<v.length)v[j]+=Math.pow(.72,h-1);}T.push({m,v});}this.tpl=T;}
    const T=this.tpl,act=new Float32Array(T.length).fill(.1);
    for(let it=0;it<30;it++){const R=new Float32Array(S.length);for(let a=0;a<T.length;a++){const v=T[a].v;for(let i=0;i<v.length;i++)if(v[i])R[i]+=act[a]*v[i];}
      for(let a=0;a<T.length;a++){const v=T[a].v;let num=0,den=0;for(let i=0;i<v.length;i++)if(v[i]){num+=v[i]*Wn[i];den+=v[i]*R[i];}act[a]*=num/(den+1e-9);}}
    let mx=0;for(const a of act)mx=Math.max(mx,a);const ch=new Float32Array(12);let bass=null;
    for(let a=0;a<T.length;a++){const v=act[a]/(mx||1);if(v<.08)continue;ch[T[a].m%12]+=Math.sqrt(v);if(bass==null&&v>.3)bass=T[a].m;}
    const na=new Float32Array(T.length);for(let a=0;a<T.length;a++)na[a]=act[a]/(mx||1);
    this.chroma={c:ch,bass,act:na,m0:T[0].m,t:this.timeOf(end-4096)-this.lat};},
  takeOnsets(){const o=this.onsets;this.onsets=[];return o;}};
