import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';

let passed=0;
const ok=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
const read=(p)=>readFileSync(p,'utf8');

const vercel=JSON.parse(read('vercel.json'));
const securityHeaders=Object.fromEntries((vercel.headers?.find(h=>h.source==='/(.*)')?.headers||[]).map(h=>[h.key,h.value]));

ok('Vercel uses modern filesystem-first SPA rewrites instead of deprecated route handles',()=>{
  assert.equal(vercel.$schema,'https://openapi.vercel.sh/vercel.json');
  assert.equal('routes' in vercel,false);
  assert.deepEqual(vercel.rewrites,[{source:'/(.*)',destination:'/index.html'}]);
});

ok('production responses define a restrictive security-header baseline',()=>{
  for(const key of ['Content-Security-Policy','Permissions-Policy','Referrer-Policy','Strict-Transport-Security','X-Content-Type-Options','X-Frame-Options','X-Robots-Tag']) assert.ok(securityHeaders[key],key);
  assert.equal(securityHeaders['X-Content-Type-Options'],'nosniff');
  assert.equal(securityHeaders['X-Frame-Options'],'DENY');
  assert.match(securityHeaders['Strict-Transport-Security'],/max-age=31536000/);
});

ok('CSP blocks framing and plugins while allowing only current runtime dependencies',()=>{
  const csp=securityHeaders['Content-Security-Policy'];
  for(const required of ["default-src 'self'","base-uri 'self'","frame-ancestors 'none'","frame-src 'none'","form-action 'self'","object-src 'none'","worker-src 'self' blob:","https://*.supabase.co","wss://*.supabase.co","https://tiles.openfreemap.org","https://unpkg.com"]) assert.match(csp,new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(csp,/unsafe-eval/);
  assert.doesNotMatch(csp,/script-src[^;]*\*/);
});

ok('shell and service worker revalidate while fingerprinted assets are immutable',()=>{
  const bySource=Object.fromEntries(vercel.headers.map(entry=>[entry.source,Object.fromEntries(entry.headers.map(h=>[h.key,h.value]))]));
  for(const source of ['/index.html','/field-sw.js','/manifest.webmanifest']) assert.match(bySource[source]['Cache-Control'],/max-age=0, must-revalidate/);
  assert.equal(bySource['/assets/(.*)']['Cache-Control'],'public, max-age=31536000, immutable');
});

ok('auth and public certificate links use one optional canonical application origin',()=>{
  const auth=read('src/features/auth/Auth.tsx');
  const cert=read('src/features/workforce/ReputationCertificates.tsx');
  const origin=read('src/app/publicOrigin.ts');
  assert.match(auth,/emailRedirectTo:\s*publicAppUrl\("\/auth\/callback"\)/);
  assert.match(auth,/redirectTo:\s*publicAppUrl\("\/reset"\)/);
  assert.match(cert,/publicAppUrl\(certificatePath\(code\)\)/);
  assert.match(origin,/VITE_PUBLIC_APP_ORIGIN/);
  assert.match(origin,/window\.location\.origin/);
});

ok('production launch environment gate requires HTTPS origins and rejects secret frontend keys',()=>{
  const gate=read('scripts/check-production-domain24116.mjs');
  const env=read('.env.example');
  assert.match(gate,/VITE_PUBLIC_APP_ORIGIN/);
  assert.match(gate,/VITE_SUPABASE_URL/);
  assert.match(gate,/protocol!==['"]https:['"]/);
  assert.match(gate,/sb_secret_/);
  assert.match(env,/VITE_PUBLIC_APP_ORIGIN=/);
});

ok('app shell is explicitly excluded from search indexing',()=>{
  assert.match(read('index.html'),/name="robots" content="noindex,nofollow,noarchive"/);
  assert.equal(securityHeaders['X-Robots-Tag'],'noindex, nofollow, noarchive');
});

ok('2.41.16 adds no database migration',()=>{
  const migrations=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1),'20261013000580_project_lifecycle_e2e_integrity.sql');
});

ok('2.41.16 release and production launch commands are registered',()=>{
  const pkg=JSON.parse(read('package.json'));
  const [major,minor,patch]=pkg.version.split('.').map(Number);
  assert.ok(major>2||(major===2&&(minor>41||(minor===41&&patch>=16))),`expected release >= 2.41.16, found ${pkg.version}`);
  assert.equal(pkg.scripts['test:production-web-24116'],'node scripts/test-production-web24116.mjs');
  assert.equal(pkg.scripts['check:production-domain-24116'],'node scripts/check-production-domain24116.mjs');
  assert.match(read('docs/PRODUCTION-WEB-2.41.16.md'),/Production Web Security & Domain Launch/);
});

console.log(`\n${passed} FieldLance 2.41.16 production web/domain scenarios passed.`);
