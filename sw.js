// Network-first: always fresh when online, still opens offline after one visit.
const CACHE='fretopia-v3';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./fonts/petaluma-script.woff2','./fonts/petaluma-music.woff2',
  ...['E2','G2','A2','B2','D3','E3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5'].map(n=>`./sounds/guitar/${n}.mp3`)];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c)).catch(()=>{});return r;}).catch(()=>caches.match(e.request)));});
