import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('package.json'));
const html=read('index.html');
const css=read('src/styles/design-system.css');
const shell=read('src/app/AppShell.tsx');
const navigation=read('src/app/navigation.ts');
const attendance=read('src/features/workforce/AttendanceWorkspace.tsx');
const offline=read('src/features/surveys/OfflineFieldWorkspace.tsx');
const main=read('src/main.tsx');
const swBuilder=read('scripts/build-field-worker.mjs');
const vercel=JSON.parse(read('vercel.json'));
const manifest=JSON.parse(read('public/manifest.webmanifest'));

const pass=(name,fn)=>{fn();console.log(`PASS ${name}`)};

pass('2.41.17 release and mobile acceptance commands are registered',()=>{
  assert.ok(['2.41.17','2.41.18','2.41.19','2.41.20','2.42.0','2.42.1','2.42.2','2.42.3','2.42.4','2.42.5','2.42.6','2.42.7'].includes(pkg.version));
  assert.match(pkg.scripts['test:mobile-production-24117']||'',/test-mobile-production24117\.mjs/);
  assert.match(pkg.scripts['test:browser-mobile-production-24117']||'',/browser-mobile-2419/);
  assert.match(pkg.scripts['check:mobile-production-24117']||'',/check-mobile-production24117\.mjs/);
});

pass('viewport opts into iOS safe areas and keeps install metadata',()=>{
  assert.match(html,/name="viewport"[^>]*viewport-fit=cover/);
  assert.match(html,/name="theme-color"/);
  assert.match(html,/rel="apple-touch-icon"/);
  assert.match(html,/rel="manifest"/);
});

pass('mobile worker chrome protects notch and home-indicator safe areas',()=>{
  assert.match(css,/field-worker-bottom-nav[\s\S]*safe-area-inset-bottom/);
  assert.match(css,/\.app>main>header\{[^}]*safe-area-inset-top/);
  assert.match(css,/\.app>\.sidebar\.open\{[^}]*safe-area-inset-top/);
  assert.match(css,/\.has-mobile-worker-nav \.content\{[^}]*safe-area-inset-left[^}]*safe-area-inset-right/);
  assert.match(css,/\.survey-sync-card\{top:calc\(64px \+ env\(safe-area-inset-top\)\)/);
});

pass('field worker bottom navigation remains touch-sized and accessible',()=>{
  assert.match(css,/\.field-worker-bottom-nav button\{[^}]*min-height:54px/);
  assert.match(shell,/workspace-mobile-nav/);
  assert.match(shell,/field-worker-bottom-nav/);
  assert.match(shell,/aria-current=\{active \? "page" : undefined\}/);
  assert.match(navigation,/target:'Overview',label:'Home'/);
  assert.match(navigation,/target:'My Assigned Surveys',label:'Field'/);
});

pass('attendance location capture remains explicit, bounded and offline-safe',()=>{
  assert.match(attendance,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(attendance,/timeout:12000/);
  assert.match(attendance,/permission:e\.code===1\?"denied":"unavailable"/);
  assert.match(attendance,/queueAttendanceStart/);
  assert.match(attendance,/queueAttendanceCheckout/);
  assert.match(attendance,/queued on this device|waiting for server sync/i);
});

pass('offline field workspace preserves encrypted device sync and explicit erase controls',()=>{
  assert.match(offline,/syncAttendanceQueue/);
  assert.match(offline,/Offline — collecting against a downloaded snapshot/);
  assert.match(offline,/ERASE/);
  assert.match(offline,/Server records are unchanged/);
  assert.match(offline,/Financial actions, case operations and basemaps are not available offline/);
});

pass('production service worker stays static-shell-only',()=>{
  assert.match(main,/serviceWorker\.register\('\/field-sw\.js'\)/);
  assert.match(swBuilder,/No API\/auth\/file responses cached/);
  assert.doesNotMatch(swBuilder,/supabase[^\n]*cache/i);
});

pass('manifest remains standalone and has required install icons',()=>{
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.theme_color,'#071a32');
  assert.ok(Array.isArray(manifest.icons)&&manifest.icons.some(x=>x.sizes==='192x192')&&manifest.icons.some(x=>x.sizes==='512x512'));
});

pass('production headers allow first-party geolocation while denying unrelated sensors',()=>{
  const global=vercel.headers.find(x=>x.source==='/(.*)');
  assert.ok(global);
  const headers=Object.fromEntries(global.headers.map(x=>[x.key.toLowerCase(),x.value]));
  assert.match(headers['permissions-policy'],/geolocation=\(self\)/);
  assert.match(headers['permissions-policy'],/camera=\(\)/);
  assert.match(headers['permissions-policy'],/microphone=\(\)/);
  assert.match(headers['content-security-policy'],/upgrade-insecure-requests/);
});

pass('2.41.17 adds no database migration',()=>{
  const migrations=readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1),'20261013000580_project_lifecycle_e2e_integrity.sql');
});

console.log('\n10 FieldLance 2.41.17 mobile production acceptance scenarios passed.');
