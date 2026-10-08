import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {certificatePath,isExplicitRoute,parseAppRoute,routePath} from '../src/app/routes.ts';

let passed=0;
const ok=(name,fn)=>{fn();passed++;console.log('PASS '+name)};

ok('auth callback is a recognized transient public route',()=>{
  const callback=parseAppRoute('/auth/callback');
  assert.equal(callback.kind,'auth_callback');
  assert.equal(isExplicitRoute(callback),false);
  assert.equal(parseAppRoute('/auth/callback/extra').kind,'unknown');
  const app=readFileSync('src/app/App.tsx','utf8');
  assert.match(app,/route\.kind==="auth_callback"&&\(s\|\|event==="INITIAL_SESSION"\)/);
  assert.match(app,/current\.session&&parseAppRoute\(\)\.kind==="auth_callback"/);
  assert.match(app,/history\.replaceState\(\{\},"","\/"\)/);
  const auth=readFileSync('src/features/auth/Auth.tsx','utf8');
  assert.match(auth,/emailRedirectTo:\s*publicAppUrl\("\/auth\/callback"\)/);
  assert.match(auth,/redirectTo:\s*publicAppUrl\("\/reset"\)/);
});

ok('certificate verification has a canonical public path with legacy compatibility',()=>{
  assert.equal(certificatePath(),'\/verify');
  assert.equal(certificatePath('abc def'),'\/verify\/abc%20def');
  const route=parseAppRoute('/verify/abc%20def');
  assert.equal(route.kind,'verify');
  assert.equal(route.entityKind,null);
  assert.equal(route.entityId,'abc def');
  assert.equal(isExplicitRoute(route),false);
  assert.equal(parseAppRoute('/verify/a/b').kind,'unknown');
  const app=readFileSync('src/app/App.tsx','utf8');
  const reputation=readFileSync('src/features/workforce/ReputationCertificates.tsx','utf8');
  assert.match(app,/legacyCertificate=new URLSearchParams\(location\.search\)\.get\('certificate'\)/);
  assert.match(app,/publicRoute\.kind==='verify'\|\|legacyCertificate/);
  assert.match(reputation,/publicAppUrl\(certificatePath\(code\)\)/);
  assert.match(reputation,/history\.replaceState\(history\.state,'',certificatePath\(code\)\)/);
});

ok('known route prefixes reject unknown pages and extra path segments',()=>{
  for(const path of [
    '/app/not-a-page',
    '/staff/not-a-page',
    '/org/org-1/not-a-page',
    '/projects/project-1/not-a-tab',
    '/access/extra',
    '/reset/extra',
    '/onboarding/organization/extra',
    '/app/work/opportunities/extra',
    '/staff/accounts/extra',
  ]) assert.equal(parseAppRoute(path).kind,'unknown',path);
});

ok('canonical workspace routes still round-trip after strict parsing',()=>{
  const targets=[
    {scope:'personal',page:'Overview'},
    {scope:'personal',page:'My Applications',entityKind:'application',entityId:'app-1'},
    {scope:'org-1',page:'Beneficiary cases',entityKind:'case',entityId:'case-1'},
    {scope:'org-1',page:'Workforce marketplace',entityKind:'application',entityId:'app-2'},
    {scope:'poem',page:'Accounts'},
    {scope:'poem',page:'Task Center',entityKind:'task',entityId:'task-1'},
    {scope:'project:project-1',page:'Task Center',entityKind:'task',entityId:'task-2'},
    {scope:'project:project-1',page:'Beneficiary cases',entityKind:'case',entityId:'case-2'},
  ];
  for(const target of targets){
    const path=routePath(target);
    const parsed=parseAppRoute(path);
    assert.notEqual(parsed.kind,'unknown',path);
    assert.equal(parsed.page,target.page,path);
  }
});

ok('project workspace tabs and exact entity deep links are strict',()=>{
  const valid=[
    '/projects/p-1/overview',
    '/projects/p-1/recruitment/opportunities/o-1/applications',
    '/projects/p-1/recruitment/applications/a-1',
    '/projects/p-1/recruitment/assignments/asn-1',
    '/projects/p-1/field-work/assignments/asn-2',
    '/projects/p-1/responses/r-1',
    '/projects/p-1/cases/c-1',
  ];
  for(const path of valid) assert.notEqual(parseAppRoute(path).kind,'unknown',path);
  for(const path of [
    '/projects/p-1/recruitment/opportunities/o-1/wrong',
    '/projects/p-1/responses/r-1/extra',
    '/projects/p-1/field-work/asn-2',
    '/projects/p-1/overview/extra',
  ]) assert.equal(parseAppRoute(path).kind,'unknown',path);
});

ok('existing project-scoped tool prefix remains compatible',()=>{
  assert.equal(parseAppRoute('/project/p-1/tasks/t-1').page,'Task Center');
  assert.equal(parseAppRoute('/project/p-1/tasks/t-1').entityKind,'task');
  assert.equal(parseAppRoute('/project/p-1/cases/c-1').page,'Beneficiary cases');
  assert.equal(parseAppRoute('/project/p-1/recruitment/applications/a-1').entityKind,'application');
});

ok('Vercel serves real files first and falls back to the SPA shell',()=>{
  const vercel=JSON.parse(readFileSync('vercel.json','utf8'));
  assert.equal('routes' in vercel,false);
  assert.deepEqual(vercel.rewrites?.[0],{source:'/(.*)',destination:'/index.html'});
});

console.log(`\n${passed} FieldLance 2.41.11 canonical routing/domain-readiness scenarios passed.`);
