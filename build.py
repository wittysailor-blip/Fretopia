"""Build index.html from src/. Run: python3 build.py (no dependencies)."""
import re,os
ROOT=os.path.dirname(os.path.abspath(__file__))
S=lambda f:open(os.path.join(ROOT,'src',f),encoding='utf-8').read()
P=os.path.join(ROOT,'src','base.html')
t=open(P,encoding='utf-8').read()
js=t[t.index("<script>")+len("<script>"):t.index("</script>")]
def sec(a,b):
    i=js.index(a); j=js.index(b,i); return js[i:j]
A=sec("const $=(s,r=document)","/* ================= vibrating string")
VS=sec("/* ================= vibrating string","/* ghost strums")
GH=sec("/* ghost strums","/* ================= sky")
INS=sec("/* ================= instruments","/* ================= carousel")
CAR=sec("/* ================= carousel","/* ================= scenes")
def rep(s,a,b,cnt=1):
    assert s.count(a)==cnt,(a[:70],s.count(a)); return s.replace(a,b)
# --- audio: softer ---
A=rep(A,"master=ctx.createGain();master.gain.value=.9;","master=ctx.createGain();master.gain.value=.95;")
A=rep(A,"const wet=ctx.createGain();wet.gain.value=.3;","const wet=ctx.createGain();wet.gain.value=.24;")
A=rep(A,"landing:{dur:3.6,bright:.5,decay:.9986,pick:.22,gain:.6}","landing:{dur:3.6,bright:.45,decay:.9986,pick:.22,gain:.6}")
A=rep(A,"guitar:{dur:2.8,bright:.8,decay:.9972,pick:.16,gain:.62}","guitar:{dur:2.8,bright:.65,decay:.9972,pick:.16,gain:.62}")
A=rep(A,"gain:.46,buzz:2.4,jawari:true}","gain:.46,buzz:2.4,jawari:true}")
A=rep(A,"pick:.12,gain:.55,jawari:true}","pick:.12,gain:.52,jawari:true}")
A=rep(A,"lp.frequency.value=1600+vel*9000;lp.Q.value=.4;","lp.frequency.value=1200+vel*7000;lp.Q.value=.4;")
A=rep(A,"function reed(freq,vel=.2){","function reed(freq,vel=.17){")
A=rep(A,"function flute(freq,vel=.24){","function flute(freq,vel=.2){")
A=rep(A,"function tablaHit(bol,vel=1,pitch=290){if(!ready())return;","function tablaHit(bol,vel=1,pitch=290){if(!ready())return;vel*=.85;")
A=rep(A,"g.gain.linearRampToValueAtTime(.95*vel,t+.006);g.gain.setTargetAtTime(0,t+.01,.42);","g.gain.linearRampToValueAtTime(.8*vel,t+.006);g.gain.setTargetAtTime(0,t+.01,.42);")
A=rep(A,"g.gain.setValueAtTime(.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+.03);","g.gain.setValueAtTime(.03,t);g.gain.exponentialRampToValueAtTime(.0001,t+.03);")
A=rep(A,"lp.frequency.value=600+vel*vel*7500+edge*3000;lp.Q.value=.5;","lp.frequency.value=700+vel*vel*6000+edge*2000;lp.Q.value=.5;")
A=rep(A,"peak=.12+.88*Math.pow(vel,1.35)","peak=.16+.74*Math.pow(vel,1.3)")
A=rep(A,"const SAMPLES={};const GTR=['G2','B2','D3','G3','B3','G4'];","const SAMPLES={};const GTR=['G2','B2','D3','G3','B3','G4'];const SAMPLE_NOTES=['E2','G2','A2','B2','D3','E3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5'];")
A=rep(A,"function loadSamples(){ac();GTR.forEach(n=>{fetch('sounds/'+n+'.mp3')","function loadSamples(){ac();SAMPLE_NOTES.forEach(n=>{fetch('sounds/guitar/'+n+'.mp3')")
A=rep(A,"const ready=()=>ctx&&ctx.state==='running';","const ready=()=>{if(!ctx)return false;if(ctx.state!=='running'){try{ctx.resume();}catch(e){}}return ctx.state!=='closed';};")
A=rep(A,"comp.threshold.value=-16;comp.ratio.value=3.5;","comp.threshold.value=-20;comp.ratio.value=4;comp.knee.value=12;")
# --- ink look: plain thin strokes, no stars, accent for highlights ---
A=re.sub(r"const col=\(e,a=1\)=>\{.*?\};","const col=(e,a=1)=>e>=.45?`rgba(232,87,42,${a})`:`rgba(17,17,19,${a})`;",A,count=1,flags=re.S)
A=rep(A,"const LINE=a=>`rgba(200,222,255,${a})`;","const LINE=a=>`rgba(17,17,19,${a})`;")
A=re.sub(r"function glowStroke\(g,glow,w=1\.6,a=\.85\)\{.*?\}\n","function glowStroke(g,glow,w=1.6,a=.85){g.lineWidth=w*.6;g.lineCap='round';g.lineJoin='round';g.strokeStyle=`rgba(17,17,19,${Math.min(1,a*1.05)})`;g.stroke();}\n",A,count=1,flags=re.S)
A=re.sub(r"function star\(g,x,y,r,a=1,warm=0\)\{.*?\}\n","function star(){}\n",A,count=1,flags=re.S)
assert 'function star(){}' in A and 'w*.6' in A
INS=rep(INS,"pan:(i-2.5)*.08,owner:this,idx:i});s.setLine(a.x,a.y,b.x,b.y);return s;});\n    this.base=bakeCanvas(W,H,g=>{g.save();g.transform(","pan:(i-2.5)*.08,owner:this,idx:i,wound:i<4});s.setLine(a.x,a.y,b.x,b.y);return s;});\n    this.base=bakeCanvas(W,H,g=>{g.save();g.transform(")
INS=INS.replace("'lighter'","'source-over'")
INS=rep(INS,"g.fillStyle='rgba(205,224,255,.9)';","g.fillStyle='#1C1C1F';")
INS=INS.replace("rgba(234,242,255,.55)","#A1A1A6").replace("rgba(234,242,255,.5)","#A1A1A6")
INS=rep(INS,"g.fillStyle='rgba(4,5,11,.92)'","g.fillStyle='#1C1C1F'")
# --- carousel: flat and calm ---
CAR=rep(CAR," rotateY(${clamp(-r*9,-14,14)}deg) scale(${1-.085*Math.min(1,ar)})"," scale(${1-.05*Math.min(1,ar)})")
CAR=rep(CAR,"c.el.style.opacity=1-.55*Math.min(1,ar);","c.el.style.opacity=1-.6*Math.min(1,ar);")
CAR=rep(CAR,"translateX(${clamp(-r*26,-40,40)}px)","translateX(${clamp(-r*14,-20,20)}px)")
CAR=rep(CAR,"<p class=\"how\">${HOWICON}${inst.how}</p>","<p class=\"how\">${inst.how}</p>")
CAR=rep(CAR,"this.step=this.cw+14;","this.step=this.cw+12;")
CAR=rep(CAR,"l.textContent='Start with '+name;","l.textContent='Continue with '+name;")
d=re.search(r' d="([^"]+)"',S('guitar.svg')).group(1)
new=S('new.js')
SHARED=new[new.index("/* ================= guitar sampler"):new.index("/* ================= instrument home")]
SHARED=SHARED.replace("const starStr=","const starStr_=")
for a,c in [(".06+.4*Math.pow(vel,1.4)",".12+.7*Math.pow(vel,1.3)"),("lp.frequency.value=900+vel*vel*4000;","lp.frequency.value=1400+vel*vel*6000;"),("reed(f,.05+.08*vel)","reed(f,.09+.12*vel)"),("flute(f,.06+.09*vel)","flute(f,.1+.13*vel)"),("voiceSyn(f,.05+.07*vel)","voiceSyn(f,.08+.1*vel)")]:
    assert SHARED.count(a)==1,a; SHARED=SHARED.replace(a,c)
head=S('head.html')
mn=S('min.js')
lib=S('lib.js')+S('listen.js')+S('game.js')
out=head+"<script>\n'use strict';\nconst GUITAR_D=\""+d+"\";\n"+A+VS+GH+INS+CAR+SHARED+lib+mn+S('parts.js')+"\n</script>\n</body>\n</html>\n"
open(os.path.join(ROOT,'index.html'),'w',encoding='utf-8').write(out)
print('built index.html',len(out),'bytes')
