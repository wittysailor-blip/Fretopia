// Network-first, never stale: pages, scripts and data are always re-checked with the server; sounds and fonts may come from cache.
const CACHE='fretopia-v8';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./fonts/inter.woff2',
  ...['E2','G2','A2','B2','D3','E3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5'].map(n=>`./sounds/guitar/${n}.mp3`)];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
  const fresh=r.mode==='navigate'||!/\/(sounds|fonts)\//.test(u.pathname);
  const net=fresh?fetch(u.href,{cache:'no-cache',credentials:'same-origin'}):fetch(r);
  e.respondWith(net.then(res=>{if(res.ok&&!u.pathname.endsWith('version.json')){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c)).catch(()=>{});}return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));});
