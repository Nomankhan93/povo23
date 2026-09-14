import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const assets=['/','/index.html','/favicon.svg',...readdirSync('dist/assets').map(n=>'/assets/'+n)];
const hash=createHash('sha256').update(assets.join('|')).digest('hex').slice(0,12);
const name='poem-field-shell-'+hash;
writeFileSync('dist/field-sw.js',`const CACHE=${JSON.stringify(name)},ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Do not skipWaiting: existing field sessions keep their current application version.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('poem-field-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
if(event.request.mode==='navigate'&&u.pathname==='/'){event.respondWith(caches.open(CACHE).then(c=>c.match('/index.html')));return;}
if(ASSETS.includes(u.pathname)&&!u.search)event.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname))||fetch(event.request)));
});
`);
console.log('Built offline shell with '+assets.length+' static assets. No API/auth/file responses cached.');
