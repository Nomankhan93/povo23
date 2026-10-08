import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';

const read=p=>readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const shell=read('src/app/AppShell.tsx');
const refresh=read('src/app/workspaceRefresh.ts');
const sw=read('scripts/build-field-worker.mjs');
const vite=read('vite.config.ts');
const brand=read('src/components/ui/FieldLanceBrand.tsx');
let passed=0;
const ok=(name,fn)=>{fn();passed++;console.log('PASS '+name)};

ok('2.41.18 release and targeted performance command are registered',()=>{
  assert.equal(pkg.version,'2.41.18');
  assert.equal(pkg.scripts['test:performance-24118'],'node scripts/test-performance24118.mjs');
});

ok('role dashboards and expensive secondary workspaces are lazy boundaries',()=>{
  for(const module of [
    '../features/workforce/FieldWorkerDashboard',
    '../features/organizations/OrganizationDashboard',
    '../features/operations/FieldLanceStaffDashboard',
    '../features/projects/ProjectTeamWorkspace',
    '../features/sharing/DataSharingWorkspace',
    '../features/notifications/Notifications',
  ]){
    assert.match(shell,new RegExp(`lazy\\(\\(\\) => import\\(${JSON.stringify(module).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
    assert.doesNotMatch(shell,new RegExp(`import \\{[^\\n]+\\} from ${JSON.stringify(module).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  }
});

ok('workspace bootstrap no longer downloads global organization/member directories',()=>{
  const start=shell.indexOf('async function load(options:');
  const end=shell.indexOf('async function refreshForeground',start);
  const load=shell.slice(start,end);
  assert.doesNotMatch(load,/\.from\("organizations"\)\.select\("\*"\)\.order\("name"\)\.limit\(500\)/);
  assert.doesNotMatch(load,/\.from\("organization_memberships"\)\.select\("\*"\)\.limit\(1000\)/);
  assert.match(shell,/async function ensureOrganizationDirectory/);
  assert.match(shell,/async function ensureMembershipDirectory/);
  assert.match(shell,/workspacePageNeedsOrganizationDirectory\(page\)/);
});

ok('foreground refresh is stale-aware and organization context refetch is change-driven',()=>{
  assert.match(refresh,/FOREGROUND_REFRESH_DEDUP_MS\s*=\s*30_000/);
  const start=shell.indexOf('async function refreshForeground');
  const end=shell.indexOf('useEffect(() => {',start);
  const foreground=shell.slice(start,end);
  assert.match(foreground,/previousOrganizationIds\.join\(': '\)|previousOrganizationIds\.join\(':'\)/);
  assert.match(foreground,/nextOrganizationIds\.join\(': '\)|nextOrganizationIds\.join\(':'\)/);
  assert.match(foreground,/refreshOwnOrganizationContext\(fresh\)/);
  assert.doesNotMatch(foreground,/ensureOrganizationDirectory/);
  assert.doesNotMatch(foreground,/ensureMembershipDirectory/);
});

ok('offline precache is manifest-selected instead of every dist asset',()=>{
  assert.match(vite,/manifest:true/);
  assert.match(sw,/dist\/\.vite\/manifest\.json/);
  assert.match(sw,/findManifestEntryBySource/);
  assert.match(sw,/isEntry/);
  assert.match(sw,/index\.html/);
  assert.match(sw,/addManifestEntry\(appEntry\)/);
  assert.match(sw,/OfflineFieldWorkspace\.tsx/);
  assert.match(sw,/addManifestEntry\(offlineFieldEntry\)/);
  assert.doesNotMatch(sw,/readdirSync\('dist\/assets'\)/);
  assert.match(sw,/Lazy role\/admin chunks remain on-demand/);
  assert.match(sw,/No API\/auth\/file responses cached/);
});

ok('runtime branding uses right-sized web assets rather than multi-megabyte masters',()=>{
  assert.match(brand,/fieldlance-wordmark\.webp/);
  assert.match(brand,/fieldlance-icon-192\.png/);
  assert.doesNotMatch(brand,/src\/assets|\.\.\/\.\.\/assets\/brand/);
  assert.ok(statSync('public/fieldlance-wordmark.webp').size < 100_000);
  assert.ok(statSync('public/fieldlance-icon-192.png').size < 100_000);
});

ok('built output, when present, keeps role chunks out of offline precache',()=>{
  if(!existsSync('dist/field-sw.js'))return;
  const built=read('dist/field-sw.js');
  const match=built.match(/ASSETS=(\[[^;]+\]);/);
  assert.ok(match,'generated service worker assets list');
  const assets=JSON.parse(match[1]);
  const allAssets=readdirSync('dist/assets').filter(x=>!x.startsWith('.'));
  assert.ok(assets.length < allAssets.length + 7,`critical ${assets.length}, total generated ${allAssets.length}`);
  const lazyRoleNames=['FieldWorkerDashboard','OrganizationDashboard','FieldLanceStaffDashboard'];
  for(const name of lazyRoleNames)assert.ok(!assets.some(x=>x.includes(name)),`${name} should remain on-demand`);
});

console.log(`\n${passed} FieldLance 2.41.18 performance, bundle and query-efficiency scenarios passed.`);
