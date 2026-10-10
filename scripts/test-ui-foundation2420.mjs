import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { getAuthorizedNavigationPages, getCapabilityContract } from '../src/app/capabilityContract.ts';
import { getMobileNavigation, getNavigationGroups } from '../src/app/navigation.ts';

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
const read = (path) => readFileSync(path, 'utf8');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

await ok('2.42.0 release is registered without database migration', async () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(['2.42.0', '2.42.1', '2.42.2', '2.42.3', '2.42.4','2.42.5','2.42.6'].includes(pkg.version));
  const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
});

await ok('route implementation is byte-identical to the 2.41.20 baseline', async () => {
  assert.equal(sha256('src/app/routes.ts'), 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879');
});

await ok('capability contract is byte-identical to the 2.41.20 baseline', async () => {
  assert.equal(sha256('src/app/capabilityContract.ts'), '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62');
});

await ok('navigation grouping changes presentation only', async () => {
  const personalCaps = getCapabilityContract({ platformRole: null, staffWorkspace: false, organizationWorkspace: false, projectWorkspace: false, ownsWorkspaceProject: false });
  const personalPages = getAuthorizedNavigationPages({ kind: 'personal', capabilities: personalCaps });
  const personalGroups = getNavigationGroups('personal', personalPages);
  const fieldOps = personalGroups.find(group => group.label === 'Field operations');
  assert.ok(fieldOps);
  assert.ok(fieldOps.pages.includes('My Attendance'));
  assert.ok(fieldOps.pages.includes('My Timesheets'));
  assert.equal(personalGroups.some(group => group.label === 'Other tools'), false);

  const orgCaps = getCapabilityContract({ platformRole: null, staffWorkspace: false, organizationWorkspace: true, projectWorkspace: false, ownsWorkspaceProject: true });
  const orgPages = getAuthorizedNavigationPages({ kind: 'organization', capabilities: orgCaps });
  const orgGroups = getNavigationGroups('organization', orgPages);
  const workforce = orgGroups.find(group => group.label === 'Workforce');
  assert.ok(workforce);
  assert.ok(workforce.pages.includes('Invitations'));
  assert.equal(orgGroups.some(group => group.label === 'Other tools'), false);

  for (const role of ['admin','super_admin','volunteer_manager','ngo_manager','auditor','survey_manager']) {
    const staffCaps = getCapabilityContract({ platformRole: role, staffWorkspace: true, organizationWorkspace: false, projectWorkspace: false, ownsWorkspaceProject: false });
    const staffPages = getAuthorizedNavigationPages({ kind: 'staff', capabilities: staffCaps, dev: true });
    assert.equal(getNavigationGroups('staff', staffPages).some(group => group.label === 'Other tools'), false, role);
  }
  for (const projectRole of ['project_manager','area_focal_person']) {
    const projectCaps = getCapabilityContract({ platformRole: null, staffWorkspace: false, organizationWorkspace: false, projectWorkspace: true, projectRole, ownsWorkspaceProject: false });
    const projectPages = getAuthorizedNavigationPages({ kind: 'project', capabilities: projectCaps, projectRole });
    assert.equal(getNavigationGroups('project', projectPages).some(group => group.label === 'Other tools'), false, projectRole);
  }
});

await ok('Field Worker mobile primary navigation destinations remain preserved', async () => {
  const caps = getCapabilityContract({ platformRole: null, staffWorkspace: false, organizationWorkspace: false, projectWorkspace: false, ownsWorkspaceProject: false });
  const allowed = getAuthorizedNavigationPages({ kind: 'personal', capabilities: caps });
  const items = getMobileNavigation('personal', allowed);
  assert.deepEqual(items.map(item => [item.target, item.label]), [
    ['Overview', 'Home'],
    ['Available Opportunities', 'Work'],
    ['My Assigned Surveys', 'Field'],
    ['Workforce payables', 'Earnings'],
    ['My profile', 'Profile'],
  ]);
  assert.ok(items.find(item => item.target === 'My Assigned Surveys')?.activePages.includes('My Attendance'));
  assert.ok(items.find(item => item.target === 'My Assigned Surveys')?.activePages.includes('My Timesheets'));
});

await ok('Organization and Staff mobile shells expose authorized destinations only', async () => {
  const orgCaps = getCapabilityContract({ platformRole: null, staffWorkspace: false, organizationWorkspace: true, projectWorkspace: false, ownsWorkspaceProject: true });
  const orgAllowed = getAuthorizedNavigationPages({ kind: 'organization', capabilities: orgCaps });
  for (const item of getMobileNavigation('organization', orgAllowed)) assert.ok(orgAllowed.includes(item.target));

  const staffCaps = getCapabilityContract({ platformRole: 'auditor', staffWorkspace: true, organizationWorkspace: false, projectWorkspace: false, ownsWorkspaceProject: false });
  const staffAllowed = getAuthorizedNavigationPages({ kind: 'staff', capabilities: staffCaps });
  for (const item of getMobileNavigation('staff', staffAllowed)) assert.ok(staffAllowed.includes(item.target));
});

await ok('Project workspace tab identifiers and workflow callbacks are preserved', async () => {
  const source = read('src/features/projects/ProjectWorkspace.tsx');
  const ids = [...source.matchAll(/\{ id: "([^"]+)", label:/g)].map(match => match[1]);
  assert.deepEqual(ids, ['overview','team','recruitment','field-work','map','responses','cases','finance','governance','documents','activity']);
  assert.match(source, /\{id:"reports",label:"Reports"/);
  const typeLine = source.match(/export type ProjectWorkspaceTab = ([^;]+);/)?.[1] || '';
  for (const id of ['reports','overview','team','recruitment','field-work','map','responses','cases','finance','governance','documents','activity']) assert.match(typeLine, new RegExp(`"${id}"`));
  assert.match(source, /protectProjectNavigation/);
  assert.match(source, /onRouteChange\?\./);
  assert.match(source, /<WorkforceMarketplace/);
  assert.match(source, /<AttendanceWorkspace/);
  assert.match(source, /<SurveyProjects/);
  assert.match(source, /<FieldOperationsMap/);
  assert.match(source, /<ProjectFundingWorkspace/);
});

await ok('Project workspace uses grouped desktop navigation and a mobile Project Section selector', async () => {
  const source = read('src/features/projects/ProjectWorkspace.tsx');
  assert.match(source, /label: "Overview", ids: \["overview", "reports"\]/);
  assert.match(source, /label: "Delivery", ids: \["team", "recruitment", "field-work", "map", "responses"\]/);
  assert.match(source, /label: "Impact", ids: \["cases"\]/);
  assert.match(source, /label: "Administration", ids: \["finance", "governance", "documents", "activity"\]/);
  assert.match(source, /<SectionNav/);
  assert.match(source, /<MobileSectionPicker/);
  assert.doesNotMatch(source, /className="project-workspace-tabs"/);
});

await ok('2.42.0 design-system primitives and token layer exist', async () => {
  const ui = read('src/components/ui/FieldLanceUI.tsx');
  const css = read('src/styles/fieldlance-2420.css');
  const main = read('src/main.tsx');
  for (const component of ['PageHeader','SectionHeader','Button','IconButton','ActionMenu','Field','Select','Textarea','FieldGroup','FormSection','FormActions','Card','MetricCard','EntityCard','StatusBadge','Alert','SyncStatus','DataTable','MobileRecordCard','FilterBar','Tabs','SectionNav','MobileSectionPicker','Dialog','ConfirmDialog','ReasonDialog','Drawer','BottomSheet','StickyActionBar']) {
    assert.match(ui, new RegExp(`export function ${component}\\b`), component);
  }
  for (const token of ['--fl-canvas','--fl-surface','--fl-text','--fl-primary','--fl-operational','--fl-space-4','--fl-radius-md','--fl-shadow-md','--fl-breakpoint-tablet']) assert.match(css, new RegExp(token));
  assert.match(main, /fieldlance-2420\.css/);
});

await ok('AppShell owns page context and keeps existing navigation callbacks', async () => {
  const source = read('src/app/AppShell.tsx');
  assert.match(source, /<PageHeader/);
  assert.match(source, /id="workspace-content"/);
  assert.match(source, /workspace-mobile-nav/);
  assert.match(source, /field-worker-bottom-nav/);
  assert.match(source, /onClick=\{\(\) => change\(item\.target\)\}/);
  assert.match(source, /openField\(\)/);
  assert.match(source, /change\("Notifications"\)/);
});

console.log(`\n${passed} FieldLance 2.42.0 UI foundation scenarios passed.`);
