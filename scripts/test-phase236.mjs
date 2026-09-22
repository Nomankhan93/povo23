import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAppRoute,routePath} from '../src/app/routes.ts';

let passed=0;
const ok=(name,fn)=>{fn();passed++;console.log('PASS '+name)};

ok('personal routes are stable and bookmarkable',()=>{
  assert.equal(routePath({scope:'personal',page:'Overview'}),'/app/home');
  assert.equal(routePath({scope:'personal',page:'Available Opportunities'}),'/app/work/opportunities');
  assert.equal(routePath({scope:'personal',page:'My Applications',entityKind:'application',entityId:'app-1'}),'/app/work/applications/app-1');
  assert.equal(routePath({scope:'personal',page:'My Assigned Surveys',entityKind:'assignment',entityId:'asn-1'}),'/app/work/assignments/asn-1');
  assert.equal(parseAppRoute('/app/profile').page,'My profile');
  assert.deepEqual(parseAppRoute('/app/work/applications/app-1').entityKind,'application');
});

ok('organization and staff routes preserve workspace scope',()=>{
  assert.equal(routePath({scope:'org-1',page:'Overview'}),'/org/org-1/home');
  assert.equal(routePath({scope:'org-1',page:'Beneficiary cases',entityKind:'case',entityId:'case-1'}),'/org/org-1/cases/case-1');
  assert.equal(routePath({scope:'poem',page:'Accounts'}),'/staff/accounts');
  assert.equal(parseAppRoute('/org/org-1/recruitment/applications/app-9').page,'Workforce marketplace');
  assert.equal(parseAppRoute('/staff/recruitment/assignments/asn-9').entityKind,'assignment');
});

ok('project workspace routes preserve tabs and record deep links',()=>{
  assert.equal(routePath({scope:'org-1',page:'Project workspace',projectId:'project-1',projectTab:'responses'}),'/org/org-1/projects/project-1/responses');
  assert.equal(routePath({scope:'poem',page:'Project workspace',projectId:'project-1',projectTab:'cases',entityKind:'case',entityId:'case-7'}),'/staff/projects/project-1/cases/case-7');
  assert.equal(routePath({scope:'project:project-1',page:'Project workspace',projectId:'project-1',projectTab:'recruitment',entityKind:'application',entityId:'app-7'}),'/projects/project-1/recruitment/applications/app-7');
  const parsed=parseAppRoute('/projects/project-1/recruitment/assignments/asn-7');
  assert.equal(parsed.scopeHint,'project:project-1');assert.equal(parsed.page,'Project workspace');assert.equal(parsed.projectTab,'recruitment');assert.equal(parsed.entityKind,'assignment');assert.equal(parsed.entityId,'asn-7');
});

ok('routing does not become an authorization boundary',()=>{
  const routes=readFileSync('src/app/routes.ts','utf8'),shell=readFileSync('src/app/AppShell.tsx','utf8');
  assert.match(shell,/resolveWorkspace\(access,browserRoute\.scopeHint\)/);
  assert.match(shell,/nav\.some\(\(\[name\]\)=>name===requested\)/);
  assert.match(shell,/from\("survey_projects"\)\.select\("\*"\)\.eq\("id",projectId\)\.maybeSingle\(\)/);
  assert.doesNotMatch(routes,/service_role|SUPABASE_SERVICE_ROLE/);
});

ok('browser history is draft-safe and project tabs are URL-driven',()=>{
  const shell=readFileSync('src/app/AppShell.tsx','utf8'),workspace=readFileSync('src/features/projects/ProjectWorkspace.tsx','utf8');
  assert.match(shell,/window\.addEventListener\("popstate",onPopState\)/);
  assert.match(shell,/flushActiveDraft\(\)\.then\(\(\)=>\{browserPathRef\.current=nextPath/);
  assert.match(shell,/history\.pushState\(\{fieldlance:true\},"",previousPath\)/);
  assert.match(workspace,/routeTab\?: ProjectWorkspaceTab \| null/);
  assert.match(workspace,/onRouteChange\?\.\(next,null,null\)/);
});

ok('case deep links and recruitment record focus survive refresh',()=>{
  const cases=readFileSync('src/features/cases/BeneficiaryCasesWorkspace.tsx','utf8'),market=readFileSync('src/features/workforce/WorkforceMarketplace.tsx','utf8');
  assert.match(cases,/initialCaseId\?:string\|null/);assert.match(cases,/onSelectedCaseChange\?:\(caseId:string\|null\)=>void/);
  assert.match(market,/focusKind\?: "application" \| "assignment" \| null/);assert.match(market,/scrollIntoView\(\{block:"center"\}\)/);
  assert.match(market,/route-focus/);
});

ok('mobile Field Worker information architecture exposes five primary destinations',()=>{
  const shell=readFileSync('src/app/AppShell.tsx','utf8'),css=readFileSync('src/styles/design-system.css','utf8');
  for(const label of ['Home','Work','Field','Earnings','Profile']) assert.ok(shell.includes(`"${label}"`));
  assert.match(shell,/field-worker-bottom-nav/);assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);assert.match(css,/safe-area-inset-bottom/);
});

console.log(`\n${passed} FieldLance 2.36 routing/mobile IA scenarios passed.`);
