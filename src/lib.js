/* ================= song library =================
   One melody per song, written once in movable sargam relative to its tonic, so every song plays on
   every melodic instrument and is turned into guitar tab automatically.
   Notation: S r R g G m M P d D n N (komal lower case, M = tivra Ma), '.' before = lower octave,
   "'" after = upper octave, ":2" = beats (default 1), "_" = rest.
   Line format: id|title|by|collection|level|bpm|notes                                         */
const LIB_RAW=`
twinkle|Twinkle Twinkle Little Star|Traditional|kids|1|88|S S P P D D P:2 m m G G R R S:2 P P m m G G R:2 P P m m G G R:2 S S P P D D P:2 m m G G R R S:2
mary|Mary Had a Little Lamb|Traditional|kids|1|96|G R S R G G G:2 R R R:2 G P P:2 G R S R G G G G R R G R S:4
hotcross|Hot Cross Buns|Traditional|kids|1|90|G R S:2 G R S:2 S:.5 S:.5 S:.5 S:.5 R:.5 R:.5 R:.5 R:.5 G R S:2
london|London Bridge|Traditional|kids|1|100|P:1.5 D:.5 P m G m P:2 R G m:2 G m P:2 P:1.5 D:.5 P m G m P:2 R:2 P:2 G S:2
rowboat|Row, Row, Row Your Boat|Traditional|kids|1|92|S:1.5 S:1.5 S R:.5 G:1.5 G R:.5 G m:.5 P:3 S':.5 S':.5 S':.5 P:.5 P:.5 P:.5 G:.5 G:.5 G:.5 S:.5 S:.5 S:.5 P m:.5 G R:.5 S:3
frere|Frère Jacques|Traditional|kids|1|100|S R G S S R G S G m P:2 G m P:2 P:.5 D:.5 P:.5 m:.5 G S P:.5 D:.5 P:.5 m:.5 G S S .P S:2 S .P S:2
macdonald|Old MacDonald Had a Farm|Traditional|kids|1|108|S S S .P .D .D .P:2 G G R R S:3 .P S S S .P .D .D .P:2 G G R R S:3
bday|Happy Birthday|Traditional|kids|1|96|.P:.75 .P:.25 .D .P S .N:2 .P:.75 .P:.25 .D .P R S:2 .P:.75 .P:.25 P G S .N .D:2 m:.75 m:.25 G S R S:2
bonnie|My Bonnie Lies Over the Ocean|Traditional|folk|2|120|.P G:1.5 R:.5 S R S .D .P .G:3 .P G:1.5 R:.5 S S .N S R:3 .P G:1.5 R:.5 S R S .D .P .G:3 .P .D:1.5 R:.5 S .N .D .N S:3
susanna|Oh! Susanna|Stephen Foster|folk|2|104|S:.5 R:.5 G P P:1.5 D:.5 P G S:1.5 R:.5 G G R S R:3 S:.5 R:.5 G P P:1.5 D:.5 P G S:1.5 R:.5 G G R R S:3
yankee|Yankee Doodle|Traditional|folk|1|116|S S R G S G R .P S S R G S:2 .N:2 S S R G m G R S .N .P .D .N S:2 S:2
saints|When the Saints Go Marching In|Traditional|folk|1|120|S G m P:4 S G m P:4 S G m P:2 G:2 S:2 G:2 R:4 G G R S:3 S G P:2 P m:3 G m P:2 G:2 S:2 R:2 S:4
grace|Amazing Grace|John Newton|folk|2|80|.P S:2 G:.5 S:.5 G:2 R S:2 .D .P:2 .P S:2 G:.5 S:.5 G:2 R P:4 G:.5 P:.5 P:2 G:.5 S:.5 G:2 R S:2 .D .P:2 .P S:2 G:.5 S:.5 G:2 R S:3
greensleeves|Greensleeves|Traditional|folk|2|96|S g:2 m P:1.5 d:.5 P m:2 R .n:1.5 S:.5 R g:2 S S:1.5 .N:.5 S R:2 .N .P:2 S g:2 m P:1.5 d:.5 P m:2 R .n:1.5 S:.5 R g:1.5 R:.5 S .N:1.5 .D:.5 .N S:3
auldlang|Auld Lang Syne|Traditional|folk|1|84|.P S:1.5 S:.5 S G R:1.5 S:.5 R G S:1.5 S:.5 G P D:3 D P:1.5 G:.5 G S R:1.5 S:.5 R G S:1.5 .D:.5 .D .P S:3
cucaracha|La Cucaracha|Traditional|folk|2|132|.P:.5 .P:.5 .P:.5 S:1.5 G:1.5 .P:.5 .P:.5 .P:.5 S:1.5 G:2.5 S S .N .N .D .D .P:3
wenceslas|Good King Wenceslas|Traditional|festive|1|100|S S S R S S .P:2 .D .P .D .N S:2 S:2 S S S R S S .P:2 .D .P .D .N S:2 S:2
jingle|Jingle Bells|J. Pierpont|festive|1|112|G G G:2 G G G:2 G P S:1.5 R:.5 G:4 m m m:1.5 m:.5 m G G G:.5 G:.5 G R R G R:2 P:2
merryxmas|We Wish You a Merry Christmas|Traditional|festive|2|120|.P S S:.5 R:.5 S:.5 .N:.5 .D .D .D R R:.5 G:.5 R:.5 S:.5 .N .P .P G G:.5 m:.5 G:.5 R:.5 S .D .P:.5 .P:.5 .D R .N S:3
silentnight|Silent Night|Franz Gruber|festive|2|84|P:1.5 D:.5 P G:3 P:1.5 D:.5 P G:3 R':2 R' N:3 S':2 S' P:3 D:2 D S':1.5 N:.5 D P:1.5 D:.5 P G:3 D:2 D S':1.5 N:.5 D P:1.5 D:.5 P G:3 R':2 R' m':1.5 R':.5 N S':3 G':3 S' P G P:1.5 m:.5 R S:3
joy|Joy to the World|G. F. Handel (arr.)|festive|2|96|S' N:.75 D:.25 P:1.5 m:.5 G R S:3 P D:1.5 D:.5 N:1.5 N:.5 S':3
deckhalls|Deck the Halls|Traditional|festive|1|112|P:1.5 m:.5 G R S R G S R:.5 G:.5 m:.5 R:.5 G:1.5 R:.5 S .N S:2 P:1.5 m:.5 G R S R G S R:.5 G:.5 m:.5 R:.5 G:1.5 R:.5 S .N S:2
ode|Ode to Joy|Beethoven|classical|1|96|G G m P P m G R S S R G G:1.5 R:.5 R:2 G G m P P m G R S S R G R:1.5 S:.5 S:2
furelise|Für Elise|Beethoven|classical|3|72|P:.5 M:.5 P:.5 M:.5 P:.5 R:.5 m:.5 g:.5 S:1.5 .g:.5 .P:.5 S:.5 R:1.5 .P:.5 .N:.5 R:.5 g:1.5 .P:.5 P:.5 M:.5 P:.5 M:.5 P:.5 R:.5 m:.5 g:.5 S:1.5 .g:.5 .P:.5 S:.5 R:1.5 .P:.5 g:.5 R:.5 S:2
fifth|Symphony No. 5|Beethoven|classical|1|100|_:.5 P:.5 P:.5 P:.5 g:3.5 _:.5 m:.5 m:.5 m:.5 R:3.5
canon|Canon in D|Pachelbel|classical|1|60|G:2 R:2 S:2 .N:2 .D:2 .P:2 .D:2 .N:2 S:2 .N:2 .D:2 .P:2 .m:2 .G:2 .m:2 .R:2
minuet|Minuet in G|Petzold (attr. Bach)|classical|2|100|P S:.5 R:.5 G:.5 m:.5 P S S D m:.5 P:.5 D:.5 N:.5 S' S S m P:.5 m:.5 G:.5 R:.5 G m:.5 G:.5 R:.5 S:.5 .N S:.5 R:.5 G:.5 S:.5 R:3
nachtmusik|Eine kleine Nachtmusik|Mozart|classical|2|100|S:1.5 .P:.5 S:1.5 .P:.5 S:.5 .P:.5 S:.5 G:.5 P:2 m:1.5 R:.5 m:1.5 R:.5 m:.5 R:.5 .N:.5 R:.5 .P:2
turkish|Rondo alla Turca|Mozart|classical|3|66|R:.25 S:.25 .N:.25 S:.25 g:1 m:.25 g:.25 R:.25 g:.25 P:1 d:.25 P:.25 M:.25 P:.25 R':.25 S':.25 N:.25 S':.25 R':.25 S':.25 N:.25 S':.25 g':2
sym40|Symphony No. 40|Mozart|classical|2|100|d:.5 P:.5 P d:.5 P:.5 P d:.5 P:.5 P g':2
morning|Morning Mood|Grieg|classical|2|60|P:.75 G:.25 R:.5 S:.5 R:.5 G:.5 P:.75 G:.25 R:.5 S:.5 R:.25 G:.25 R:.25 G:.25 P:.75 G:.25 P:.5 D:.5 G:.5 D:.5 P:.75 G:.25 R:.5 S:1.5
mountainking|In the Hall of the Mountain King|Grieg|classical|2|100|S:.5 R:.5 g:.5 m:.5 P:.5 g:.5 P M:.5 R:.5 M m:.5 r:.5 m S:.5 R:.5 g:.5 m:.5 P:.5 g:.5 P:.5 S':.5 n:.5 P:.5 g:.5 P:.5 n:2
swanlake|Swan Lake|Tchaikovsky|classical|2|76|P:4 S:.5 R:.5 g:.5 m:.5 P:1.5 g:.5 P:1.5 g:.5 P:1.5 S:.5 g:.5 S:.5 .d:.5 g:.5 S:3
cancan|Can-Can|Offenbach|classical|2|132|S R:.5 m:.5 G:.5 R:.5 P P P:.5 D:.5 G:.5 m:.5 R R R:.5 m:.5 G:.5 R:.5 S:.5 S':.5 N:.5 D:.5 P:.5 m:.5 G:.5 R:.5 S:2
danube|The Blue Danube|Johann Strauss II|classical|2|150|S S G P:2 _ P' _ P' _ G' _ G' _ S S G P:2 _ P' _ P' _ m' _ m' _ .N .N R D:2 _ D' _ D' _ m' _ m' _ .N .N R D:2 _ D' _ D' _ G' _ G':2
habanera|Habanera (Carmen)|Bizet|classical|3|72|S':1.5 N:.5 n:.5 n:.5 D d:1.5 P:.5 M:.5 M:.5 m g:2
bridal|Bridal Chorus|Wagner|classical|1|72|.P S:1.5 S:.5 S:2 .P R .N S:2
lullaby|Lullaby (Wiegenlied)|Brahms|classical|2|84|G:.5 G:.5 P:3 G:.5 G:.5 P:3 G:.5 P:.5 S':2 N:1.5 D:.5 D:2 P R:.5 G:.5 m:2 R R:.5 G:.5 m:3 R:.5 m:.5 N:.5 D:.5 P:2 N S':3
spring|Spring (The Four Seasons)|Vivaldi|classical|2|100|S G G G R:.5 S:.5 P:2.5 P:.5 m:.5 G G G R:.5 S:.5 P:2.5 P:.5 m:.5 G m:.5 P:.5 m G R:2
newworld|Largo (New World Symphony)|Dvořák|classical|1|56|G P:1.5 P:.5 P:2 G R:1.5 S:.5 S:2 R G P G R:4 G P:1.5 P:.5 P:2 G R:1.5 S:.5 S:2 R G R S:4
toccata|Toccata in D minor (opening)|J. S. Bach|classical|2|60|P:.25 m:.25 P:3 m:.25 g:.25 R:.25 S:.25 .N S:3
jgm|Jana Gana Mana (opening)|Rabindranath Tagore|indian|2|76|S R G G G G G G G G R G m:2 G G G R R R .N R S:2 S P P P P P P P P m P m:2 m m m G G G R m G:2
`;
const LIB_COLL={kids:'Rhymes',folk:'Folk & traditional',festive:'Festive',classical:'Western classical',indian:'Indian',raag:'Raag practice',drill:'Technique',mine:'My songs'};

/* raag practice is generated: aaroh-avaroh plus three alankars for every raag */
const RAAGS=[['Yaman','Evening · tivra Ma','.N R G M D N S\'','S\' N D P M G R S'],['Bhupali','Evening · pentatonic','S R G P D S\'','S\' D P G R S'],
  ['Bilawal','Morning · the major scale','S R G m P D N S\'','S\' N D P m G R S'],['Bhairav','Dawn · komal Re and Dha','S r G m P d N S\'','S\' N d P m G r S'],
  ['Kafi','Any time · komal Ga and Ni','S R g m P D n S\'','S\' n D P m g R S'],['Khamaj','Night · both Nis','S G m P D N S\'','S\' n D P m G R S'],
  ['Bhimpalasi','Afternoon','.n S g m P n S\'','S\' n D P m g R S'],['Durga','Night · pentatonic','S R m P D S\'','S\' D P m R S'],
  ['Malkauns','Late night · pentatonic','S g m d n S\'','S\' n d m g S'],['Des','Monsoon night','S R m P N S\'','S\' n D P m G R S'],
  ['Bageshri','Midnight','.n S g m D n S\'','S\' n D m g R S'],['Todi','Morning','S r g M d N S\'','S\' N d M g r S'],
  ['Marwa','Sunset · no Pa','S r G M D N S\'','S\' N D M G r S'],['Asavari','Morning','S R m P d S\'','S\' n d P m g R S'],
  ['Bihag','Night','S G m P N S\'','S\' N D P M G m G R S']];
function raagSongs(){const out=[];const tk=s=>s.trim().split(/\s+/);
  RAAGS.forEach(([name,sub,aa,av],ri)=>{const id='r-'+name.toLowerCase(),up=tk(aa),scale=up.slice(0,-1),n=scale.length,oct=t=>t.startsWith('.')?t.slice(1):t+"'",at=i=>i<n?scale[i]:oct(scale[i-n]);
    out.push({id:id+'-aa',title:'Raag '+name+': aaroh and avaroh',by:sub,coll:'raag',lvl:1,bpm:72,notes:aa+':2 '+tk(av).slice(1).join(' ')+':2'});
    const g3=[],g4=[],pairs=[];for(let i=0;i<n-1;i++){g3.push(at(i),at(i+1),at(i+2));}for(let i=0;i<n-2;i++){g4.push(at(i),at(i+1),at(i+2),at(i+3));}for(let i=0;i<=n;i++){pairs.push(at(i)+':.5',at(i)+':.5');}
    out.push({id:id+'-a3',title:'Raag '+name+': alankar in threes',by:sub,coll:'raag',lvl:2,bpm:80,notes:g3.join(' ')+' '+at(n)+':2'});
    out.push({id:id+'-a4',title:'Raag '+name+': alankar in fours',by:sub,coll:'raag',lvl:2,bpm:84,notes:g4.join(' ')+' '+at(n)+':2'});
    out.push({id:id+'-a2',title:'Raag '+name+': double notes',by:sub,coll:'raag',lvl:1,bpm:72,notes:pairs.join(' ')+' '+tk(av).slice(1).join(' ')});});return out;}
/* open chord shapes, low E string first; -1 = don't play */
const CHORD_SHAPES={E:[0,2,2,1,0,0],Em:[0,2,2,0,0,0],A:[-1,0,2,2,2,0],Am:[-1,0,2,2,1,0],D:[-1,-1,0,2,3,2],Dm:[-1,-1,0,2,3,1],G:[3,2,0,0,0,3],C:[-1,3,2,0,1,0],
  Fmaj7:[-1,-1,3,2,1,0],F:[1,3,3,2,1,1],E7:[0,2,0,1,0,0],A7:[-1,0,2,0,2,0],D7:[-1,-1,0,2,1,2],G7:[3,2,0,0,0,1],C7:[-1,3,2,3,1,0],B7:[-1,2,1,2,0,2],
  Am7:[-1,0,2,0,1,0],Em7:[0,2,0,0,0,0],Dsus4:[-1,-1,0,2,3,3],Asus2:[-1,0,2,2,0,0]};
const CHORD_SONGS=[
  {id:'c-emg',title:'Your first chords: Em and G',by:'Two shapes, four strums each',lvl:1,bpm:70,chords:'Em:4 G:4 Em:4 G:4 Em:4 G:4 Em:4 G:4'},
  {id:'c-strum',title:'Steady strums',by:'One strum on every beat',lvl:1,bpm:76,chords:'G G G G C C C C D D D D G:4'},
  {id:'c-gcd',title:'G, C and D',by:'The three-chord trick',lvl:1,bpm:76,chords:'G:4 C:4 D:4 G:4 G:4 C:4 D:4 G:4'},
  {id:'c-ade',title:'A, D and E',by:'Another three-chord family',lvl:1,bpm:76,chords:'A:4 D:4 E:4 A:4 A:4 D:4 E:4 A:4'},
  {id:'c-amcg',title:'Am, C and G',by:'A minor sound',lvl:2,bpm:80,chords:'Am:4 C:4 G:4 Am:4 Am:4 C:4 G:4 Am:4'},
  {id:'c-blues',title:'12-bar blues in A',by:'A7, D7 and E7',lvl:2,bpm:84,chords:'A7:4 A7:4 A7:4 A7:4 D7:4 D7:4 A7:4 A7:4 E7:4 D7:4 A7:4 E7:4'},
  {id:'c-bday',title:'Happy Birthday (chords)',by:'Traditional · G and D',lvl:1,bpm:96,chords:'G:3 D:3 D:3 G:3 G:3 C:3 G:2 D:1 G:3'},
  {id:'c-twinkle',title:'Twinkle Twinkle (chords)',by:'Traditional · G, C and D',lvl:1,bpm:88,chords:'G:4 C:2 G:2 C:2 G:2 D:2 G:2 G:2 C:2 G:2 D:2 G:2 C:2 G:2 D:2 G:4 C:2 G:2 C:2 G:2 D:2 G:2'},
  {id:'c-grace',title:'Amazing Grace (chords)',by:'John Newton · G, C, Em and D',lvl:2,bpm:84,chords:'G:6 C:3 G:3 G:3 Em:3 D:6 G:6 C:3 G:3 G:3 D:3 G:6'},
  {id:'c-saints',title:'When the Saints (chords)',by:'Traditional · G, C and D7',lvl:2,bpm:110,chords:'G:12 D7:4 G:8 C:8 G:4 D7:4 G:4'},
  {id:'c-jingle',title:'Jingle Bells (chords)',by:'J. Pierpont · G, C, A7 and D',lvl:2,bpm:112,chords:'G:16 C:4 G:4 A7:4 D:4 G:16 C:4 G:4 D:4 G:4'},
  {id:'c-greensleeves',title:'Greensleeves (chords)',by:'Traditional · Am, G and E',lvl:2,bpm:96,chords:'Am:3 G:3 Am:3 E:3 Am:3 G:3 E:3 Am:3'},
  {id:'c-risingsun',title:'House of the Rising Sun (chords)',by:'Traditional · Am, C, D, Fmaj7 and E',lvl:3,bpm:96,chords:'Am:3 C:3 D:3 Fmaj7:3 Am:3 C:3 E:3 E:3 Am:3 C:3 D:3 Fmaj7:3 Am:3 E:3 Am:3 E:3'}];
const DRILLS={guitar:[
    {id:'g-open',title:'Open strings',by:'Each string, low to high and back',lvl:1,bpm:66,midi:'E2:2 A2:2 D3:2 G3:2 B3:2 E4:2 E4:2 B3:2 G3:2 D3:2 A2:2 E2:2'},
    {id:'g-first',title:'First notes',by:'E, F and G on the high E string',lvl:1,bpm:70,midi:'E4 F4 G4:2 G4 F4 E4:2 E4 G4 F4 E4 F4:2 E4:2'},
    {id:'g-cmaj',title:'C major scale',by:'Open position, up and down',lvl:1,bpm:72,midi:'C3 D3 E3 F3 G3 A3 B3 C4:2 C4 B3 A3 G3 F3 E3 D3 C3:2'},
    {id:'g-gmaj',title:'G major scale',by:'Two octaves from the low E string',lvl:2,bpm:72,midi:'G2 A2 B2 C3 D3 E3 F#3 G3 A3 B3 C4 D4 E4 F#4 G4:2 F#4 E4 D4 C4 B3 A3 G3:2'},
    {id:'g-empenta',title:'E minor pentatonic',by:'The first box every rock player learns',lvl:2,bpm:80,midi:'E2 G2 A2 B2 D3 E3 G3 A3 B3 D4 E4 G4:2 E4 D4 B3 A3 G3 E3 D3 B2 A2 G2 E2:2'},
    {id:'g-ampenta',title:'A minor pentatonic',by:'Open position',lvl:2,bpm:80,midi:'A2 C3 D3 E3 G3 A3 C4 D4 E4 G4 A4:2 G4 E4 D4 C4 A3 G3 E3 D3 C3 A2:2'},
    {id:'g-spider',title:'Finger spider',by:'Frets 1-2-3-4 on every string',lvl:2,bpm:76,midi:'F2 F#2 G2 G#2 A#2 B2 C3 C#3 D#3 E3 F3 F#3 G#3 A3 A#3 B3 C4 C#4 D4 D#4 F4 F#4 G4 G#4:2'},
    {id:'g-chromatic',title:'Chromatic walk',by:'Every note from low E to A',lvl:1,bpm:72,midi:'E2 F2 F#2 G2 G#2 A2:2 A2 G#2 G2 F#2 F2 E2:2'}],
  melodic:[
    {id:'m-sa',title:'Find your Sa',by:'Hold Sa steady with the tanpura',lvl:1,bpm:60,notes:'S:4 _:2 S:4 _:2 S:4'},
    {id:'m-srg',title:'Sa Re Ga',by:'Your first three swaras',lvl:1,bpm:66,notes:'S:2 R:2 G:2 R:2 S:4 _:2 S R G R S:2'},
    {id:'m-pa',title:'Sa and Pa',by:'The two fixed notes',lvl:1,bpm:66,notes:"S:2 P:2 S:2 P:2 S':2 P:2 S:4"},
    {id:'m-mandra',title:'Mandra saptak',by:'The lower octave',lvl:2,bpm:72,notes:'S .N .D .P .m .G .R .S:2 .R .G .m .P .D .N S:2'},
    {id:'m-komal',title:'Komal swaras',by:'Re, Ga, Dha and Ni, flattened',lvl:2,bpm:66,notes:"S r S R S g S G S m S P S d S D S n S N S':2"}],
  tabla:[
    {id:'t-na',title:'Na on the dayan',by:'The ringing right-hand stroke',lvl:1,bpm:70,bols:'Na Na Na Na Na Na Na Na'},
    {id:'t-ge',title:'Ge on the bayan',by:'The deep left-hand stroke',lvl:1,bpm:70,bols:'Ge Ge Ge Ge Na Na Na Na'},
    {id:'t-dha',title:'Dha = Na + Ge',by:'Both drums together',lvl:1,bpm:70,bols:'Dha _ Dha _ Na Ge Dha _ Dha Dha Na Na Dha _ _ _'},
    {id:'t-tin',title:'Tin and Dhin',by:'Open and resonant strokes',lvl:1,bpm:72,bols:'Tin Tin Na Na Dhin Dhin Dha Dha Tin Na Dhin Dha'},
    {id:'t-tete',title:'Tete',by:'Fast alternating dayan strokes',lvl:2,bpm:70,bols:'Te Te Te Te Ge Te Te Ge Dha Te Te Dha Dha Te Te Dha'}]};
const TAAL_SONGS=[['keherwa','Keherwa','8 matras · film songs and bhajans',1,80,2],['dadra','Dadra','6 matras · light classical',1,84,3],['rupak','Rupak','7 matras · starts on khali',2,84,2],
  ['jhaptaal','Jhaptaal','10 matras · 2+3+2+3',2,80,2],['ektaal','Ektaal','12 matras · slow khayal',3,72,1],['teentaal','Teentaal','16 matras · the king of taals',2,72,1],['bhajani','Bhajani','8 matras · devotional',1,84,2]];
Object.assign(TAALS,{rupak:{matras:7,bols:'Tin Tin Na Dhi Na Dhi Na'.split(' '),vibhag:[3,2,2],marks:['0','1','2']},
  jhaptaal:{matras:10,bols:'Dhi Na Dhi Dhi Na Ti Na Dhi Dhi Na'.split(' '),vibhag:[2,3,2,3],marks:['X','2','0','3']},
  ektaal:{matras:12,bols:'Dhin Dhin DhaGe Tirakita Tu Na Kat Ta DhaGe Tirakita Dhi Na'.split(' '),vibhag:[2,2,2,2,2,2],marks:['X','0','2','0','3','4']},
  bhajani:{matras:8,bols:'Dhin _ Na Dhin Dhin Na Tin Na'.split(' '),vibhag:[4,4],marks:['X','0']}});

/* ---------- build per-instrument song objects ---------- */
function libParse(notes){let t=0;const out=[];for(const tok of notes.trim().split(/\s+/)){let[nm,du]=tok.split(':');const beats=du?parseFloat(du):1;
    if(nm==='_'){out.push({rest:true,start:t,beats});t+=beats;continue;}let lo=0,hi=0;while(nm.startsWith('.')){lo++;nm=nm.slice(1);}while(nm.endsWith("'")){hi++;nm=nm.slice(0,-1);}
    const pc=LET.indexOf(nm);if(pc<0)continue;out.push({semi:pc+12*(hi-lo),start:t,beats});t+=beats;}return{notes:out,total:t};}
/* guitar: pick the transposition that sits best in open position (frets 0–5) */
function guitarBase(semis){let best=48,bc=1e9;for(let b=40;b<=64;b++){let c=0;for(const s of semis){const m=b+s;if(m<40||m>69){c+=30;continue;}const p=tabPos(m);c+=p.f+(p.f>3?3:0);}c+=Math.abs(b-52)*.3;if(c<bc){bc=c;best=b;}}return best;}
let LIBRARY=null;
function userSongs(){try{return JSON.parse(localStorage.getItem('fretopia.mysongs')||'[]');}catch(e){return[];}}
function buildLibrary(){const base=LIB_RAW.trim().split('\n').map(l=>{const[id,title,by,coll,lvl,bpm,notes]=l.split('|');return{id,title,by,coll,lvl:+lvl,bpm:+bpm,notes};});
  LIBRARY=[...base,...raagSongs(),...userSongs()];}
function songFor(entry,fam){if(fam==='tabla')return entry;
  if(fam==='guitar'){if(entry.midi)return{...entry,sub:entry.by,kind:'tab',notes:entry.midi};const p=libParse(entry.notes);return{...entry,sub:entry.by,kind:'tab',lib:true,base:guitarBase(p.notes.map(n=>n.semi))};}
  return{...entry,sub:entry.by,kind:'sargam'};}
function catalog(fam){if(!LIBRARY)buildLibrary();
  if(fam==='tabla'){const d=DRILLS.tabla.map(s=>({...s,sub:s.by,kind:'bols',coll:'drill'}));const t=TAAL_SONGS.map(([k,title,by,lvl,bpm,cycles])=>({id:'t-'+k,title,by,sub:by,lvl,bpm,kind:'bols',taal:k,cycles,coll:'taal'}));
    t.push({id:'t-dugun',title:'Keherwa dugun',by:'Double speed',sub:'Double speed',lvl:3,bpm:60,kind:'bols',taal:'keherwa',cycles:2,dugun:true,coll:'taal'});return[...d,...t];}
  const drills=DRILLS[fam].map(s=>songFor({...s,coll:'drill'},fam)),ch=fam==='guitar'?CHORD_SONGS.map(c=>({...c,sub:c.by,kind:'chords',coll:'chords'})):[];return[...drills,...ch,...LIBRARY.map(e=>songFor(e,fam))];}

/* ---------- MIDI import: your own files become play-along songs ---------- */
function parseMidi(buf){const d=new DataView(buf);let p=0;const str=n=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(d.getUint8(p+i));p+=n;return s;},u32=()=>{const v=d.getUint32(p);p+=4;return v;},u16=()=>{const v=d.getUint16(p);p+=2;return v;},
    vlq=()=>{let v=0,b;do{b=d.getUint8(p++);v=(v<<7)|(b&127);}while(b&128);return v;};
  if(str(4)!=='MThd')throw new Error('Not a MIDI file');const hl=u32(),fmt=u16(),ntr=u16(),div=u16();p=8+hl;if(div&0x8000)throw new Error('Unsupported timing');
  let tempo=500000;const notes=[];
  for(let tr=0;tr<ntr&&p<buf.byteLength;tr++){if(str(4)!=='MTrk'){break;}const len=u32(),end=p+len;let tick=0,run=0;const on={};
    while(p<end){tick+=vlq();let st=d.getUint8(p);if(st&128){p++;run=st;}else st=run;const ty=st>>4,ch=st&15;
      if(st===0xFF){const mt=d.getUint8(p++),ml=vlq();if(mt===0x51&&ml===3)tempo=(d.getUint8(p)<<16)|(d.getUint8(p+1)<<8)|d.getUint8(p+2);p+=ml;}
      else if(st===0xF0||st===0xF7){p+=vlq();}
      else if(ty===9||ty===8){const k=d.getUint8(p),v=d.getUint8(p+1);p+=2;const key=ch*128+k;
        if(ty===9&&v>0){on[key]=tick;}else if(on[key]!=null){if(ch!==9)notes.push({tr,ch,midi:k,s:on[key]/div,e:tick/div});delete on[key];}}
      else if(ty===12||ty===13){p+=1;}else{p+=2;}}
    p=end;}
  if(!notes.length)throw new Error('No notes found');
  /* melody = the track with the most notes in a singable range; take its top note at each moment */
  const groups={};notes.forEach(n=>{const k=n.tr+'.'+n.ch;(groups[k]=groups[k]||[]).push(n);});
  let best=null,bs=-1;for(const k in groups){const g=groups[k],avg=g.reduce((a,n)=>a+n.midi,0)/g.length,score=g.length*(avg>52&&avg<84?1:.3);if(score>bs){bs=score;best=g;}}
  best.sort((a,b)=>a.s-b.s||b.midi-a.midi);const q=x=>Math.round(x*4)/4,mel=[];
  for(const n of best){const s=q(n.s);if(mel.length&&q(mel[mel.length-1].s)===s)continue;mel.push({midi:n.midi,s,e:q(n.e)});}
  const prof=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],hist=new Array(12).fill(0);mel.forEach(n=>hist[n.midi%12]+=n.e-n.s||.25);
  let key=0,ks=-1;for(let k=0;k<12;k++){let s=0;for(let i=0;i<12;i++)s+=hist[(k+i)%12]*prof[i];if(s>ks){ks=s;key=k;}}
  const mid=mel.reduce((a,n)=>a+n.midi,0)/mel.length,tonic=key+12*Math.round((mid-6-key)/12);
  const toks=[];let t=mel[0].s;
  mel.forEach((n,i)=>{if(n.s>t+.01)toks.push('_:'+(n.s-t));const nx=mel[i+1]?mel[i+1].s:n.e,dur=Math.max(.25,Math.min(nx,Math.max(n.e,n.s+.25))-n.s);
    let semi=n.midi-tonic;const o=Math.floor(semi/12),pc=semi-12*o;toks.push((o<0?'.'.repeat(-o):'')+LET[pc]+(o>0?"'".repeat(o):'')+(dur!==1?':'+dur:''));t=n.s+dur;});
  return{bpm:Math.round(60000000/tempo),notes:toks.slice(0,600).join(' ')};}
