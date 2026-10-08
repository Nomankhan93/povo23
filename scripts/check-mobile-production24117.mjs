import assert from 'node:assert/strict';

const configured=(process.env.FIELDLANCE_PRODUCTION_URL||process.env.VITE_PUBLIC_APP_ORIGIN||'').trim();
if(!configured){
  console.error('ERROR: Set FIELDLANCE_PRODUCTION_URL or VITE_PUBLIC_APP_ORIGIN to the deployed HTTPS app origin.');
  process.exit(2);
}
const origin=new URL(configured);
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash){
  console.error('ERROR: Production origin must be an origin-only HTTPS URL, e.g. https://app.fieldlance.app');
  process.exit(2);
}
const base=origin.origin;
const get=async pathname=>{
  const res=await fetch(base+pathname,{redirect:'follow'});
  if(!res.ok)throw new Error(`${pathname} returned HTTP ${res.status}`);
  return res;
};
const root=await get('/');
const html=await root.text();
assert.match(html,/name="viewport"[^>]*viewport-fit=cover/,'deployed HTML must enable safe-area viewport fitting');
assert.match(html,/manifest\.webmanifest/,'deployed HTML must link the web manifest');
const permissions=root.headers.get('permissions-policy')||'';
assert.match(permissions,/geolocation=\(self\)/,'deployed Permissions-Policy must allow first-party geolocation');
assert.match(root.headers.get('strict-transport-security')||'',/max-age=/,'deployed HSTS header missing');
assert.match(root.headers.get('content-security-policy')||'',/upgrade-insecure-requests/,'deployed CSP missing');

const manifestResponse=await get('/manifest.webmanifest');
const manifest=await manifestResponse.json();
assert.equal(manifest.display,'standalone');
assert.ok(manifest.icons?.some(x=>x.sizes==='192x192'));
assert.ok(manifest.icons?.some(x=>x.sizes==='512x512'));

const worker=await get('/field-sw.js');
const workerText=await worker.text();
assert.match(workerText,/fetch/,'deployed service worker missing fetch policy');
assert.match(worker.headers.get('cache-control')||'',/must-revalidate/,'service worker must revalidate');

for(const route of ['/app/home','/app/work/opportunities','/app/field/projects']){
  const res=await get(route);
  const body=await res.text();
  assert.match(body,/id="root"/i,`${route} must receive the SPA shell`);
}

console.log(`PASS deployed mobile production shell at ${base}`);
console.log('PASS HTTPS headers, viewport safe areas, manifest, service worker and direct mobile routes');
console.log('NOTE: Continue with the physical Field Worker checklist; this command does not authenticate or simulate GPS permission prompts.');
