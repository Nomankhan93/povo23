import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const branded=[
  '/manifest.webmanifest',
  '/fieldlance-icon-192.png',
  '/fieldlance-icon-512.png',
  '/apple-touch-icon.png',
  '/fieldlance-wordmark.webp',
];
const manifestPath='dist/.vite/manifest.json';
if(!existsSync(manifestPath))throw new Error('Vite manifest missing. build.manifest must stay enabled for offline-shell dependency selection.');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const selected=new Set();

function addManifestEntry(key){
  if(!manifest[key])throw new Error(`Required offline manifest entry missing: ${key}`);
  const seen=new Set();
  function visit(entryKey){
    if(seen.has(entryKey))return;
    seen.add(entryKey);
    const entry=manifest[entryKey];
    if(!entry)return;
    if(entry.file)selected.add('/'+entry.file);
    for(const css of entry.css||[])selected.add('/'+css);
    for(const asset of entry.assets||[])selected.add('/'+asset);
    for(const dependency of entry.imports||[])visit(dependency);
  }
  visit(key);
}

// Core app dependencies are needed for offline navigation. The downloaded field workspace
// is the only dynamic route explicitly precached; role/admin/reporting chunks remain on-demand.
function findManifestEntryBySource(source, { entry = false } = {}) {
  const match = Object.entries(manifest).find(([key, value]) => {
    const sourceMatches = key === source || value?.src === source;
    return sourceMatches && (!entry || value?.isEntry === true);
  });

  return match?.[0] ?? null;
}

const appEntry =
  findManifestEntryBySource('index.html', { entry: true }) ??
  Object.entries(manifest).find(([, value]) => value?.isEntry === true)?.[0];

if (!appEntry) {
  throw new Error('Required application entry missing from Vite manifest.');
}

const offlineFieldEntry = findManifestEntryBySource(
  'src/features/surveys/OfflineFieldWorkspace.tsx'
);

if (!offlineFieldEntry) {
  throw new Error(
    'Required offline manifest entry missing: src/features/surveys/OfflineFieldWorkspace.tsx'
  );
}

addManifestEntry(appEntry);
addManifestEntry(offlineFieldEntry);

const assets=['/','/index.html',...branded,...selected];
for(const asset of assets){
  const file='dist'+(asset==='/'?'/index.html':asset);
  if(!existsSync(file))throw new Error(`Offline-shell asset missing: ${asset}`);
}
const digest=createHash('sha256');
for(const asset of assets)digest.update(asset).update(readFileSync('dist'+(asset==='/'?'/index.html':asset)));
const hash=digest.digest('hex').slice(0,12);
const name='fieldlance-field-shell-'+hash;
writeFileSync('dist/field-sw.js',`const CACHE=${JSON.stringify(name)},ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Do not skipWaiting: existing field sessions keep their current application version.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('fieldlance-field-shell-')||k.startsWith('poem-field-shell-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
// Only the public static shell plus the offline field route is precached. Auth callbacks and API/storage URLs bypass this worker.
const appNavigation=(u.pathname==='/'||u.pathname==='/app'||u.pathname.startsWith('/app/'))&&!['code','token','token_hash','access_token','refresh_token','error','certificate'].some(k=>u.searchParams.has(k));
if(event.request.mode==='navigate'&&appNavigation){event.respondWith(caches.open(CACHE).then(c=>c.match('/index.html')));return;}
if(ASSETS.includes(u.pathname)&&!u.search)event.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname))||fetch(event.request)));
});
`);
console.log('Built FieldLance offline shell with '+assets.length+' critical assets. Lazy role/admin chunks remain on-demand. No API/auth/file responses cached.');
