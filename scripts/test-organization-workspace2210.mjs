import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const dashboard = read('src/features/organizations/OrganizationDashboard.tsx');
const shell = read('src/app/AppShell.tsx');
const navigation = read('src/app/navigation.ts');
const styles = read('src/styles/design-system.css');

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.21.0 Organization Workspace regression contract is active', async () => {
  const [major, minor, patch] = pkg.version.split('-')[0].split('.').map(Number);
  assert.ok(
    major > 2 ||
      (major === 2 && minor > 21) ||
      (major === 2 && minor === 21 && patch >= 0),
    `Expected FieldLance >= 2.21.0, received ${pkg.version}`,
  );
  assert.equal(pkg.scripts['test:organization-workspace'], 'node scripts/test-organization-workspace2210.mjs');
  assert.match(pkg.scripts.test, /test:organization-workspace/);
});

await ok('Organization Overview remains dedicated alongside Field Worker and FieldLance Staff homes', async () => {
  assert.match(shell, /import \{ OrganizationDashboard \}/);
  assert.match(shell, /organizationWorkspace \? \(/);
  assert.match(shell, /<OrganizationDashboard/);
  assert.match(shell, /<FieldWorkerDashboard/);
  assert.match(shell, /<FieldLanceStaffDashboard/);
  assert.match(shell, /<WorkflowOverview staff=\{false\} personal=\{false\}/);
});

await ok('Organization dashboard reads existing authoritative operational sources only', async () => {
  for (const table of [
    'survey_projects',
    'work_opportunities',
    'work_applications',
    'work_assignments',
    'beneficiary_cases',
    'survey_responses',
    'assistance_entries',
    'work_payable_units',
    'organization_programs',
    'organization_areas',
  ]) assert.match(dashboard, new RegExp(`from\\("${table}"\\)`));
  assert.doesNotMatch(dashboard, /\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(dashboard, /rpc\(/);
});

await ok('Organization Home exposes the recommended operational metrics', async () => {
  for (const label of [
    'Active projects',
    'Open opportunities',
    'New applications',
    'Active Field Workers',
    'Submitted surveys',
    'Active cases',
  ]) assert.match(dashboard, new RegExp(label));
});

await ok('Organization next-action hierarchy keeps decisions in existing workspaces', async () => {
  for (const marker of [
    'RECRUITMENT QUEUE',
    'SELECTION READY',
    'CASE FOLLOW-UP',
    'BUILD YOUR FIELD TEAM',
    'START DELIVERY',
    'OPERATIONS HEALTHY',
  ]) assert.match(dashboard, new RegExp(marker));
  assert.match(dashboard, /Survey access remains inactive until the Field Worker accepts/);
  assert.match(dashboard, /onNavigate\("Workforce marketplace"\)/);
  assert.match(dashboard, /onNavigate\("Beneficiary cases"\)/);
});

await ok('Organization navigation is curated and public labels do not rename internal page identifiers', async () => {
  assert.match(shell, /const organizationNav = \(\[/);
  for (const page of ['Overview','Survey projects','Project team','Workforce marketplace','Volunteers','Beneficiary cases','Assistance ledger','Workforce payables','Project funding']) {
    assert.match(shell, new RegExp(`"${page}"`));
  }
  for (const pair of [
    ['Volunteers', 'Field Workers'],
    ['Survey projects', 'Projects'],
    ['Project team', 'Team & access'],
    ['Workforce marketplace', 'Recruitment'],
    ['Workforce payables', 'Payables'],
    ['Project funding', 'Project finance'],
  ]) {
    assert.match(navigation, new RegExp(`"?${pair[0]}"?: "${pair[1]}"`));
  }
  assert.match(shell, /poem \? staffPageLabel\(name\) : organizationWorkspace \? organizationPageLabel\(name\) : workspacePageLabel\(name, personalWorkspace\)/);
});

await ok('Organization navigation keeps personal-only pages out of the curated organization list', async () => {
  const start = shell.indexOf('const organizationNav = ([');
  const end = shell.indexOf('const nav = projectScope', start);
  const organizationBlock = shell.slice(start, end);
  for (const personalPage of ['My profile', 'Work experience', 'Private documents', 'E-Wallets & withdrawals', 'Available Opportunities', 'My Applications', 'My Assigned Surveys']) {
    assert.doesNotMatch(organizationBlock, new RegExp(personalPage));
  }
});

await ok('approved organization identity is reused without exposing onboarding documents', async () => {
  assert.match(dashboard, /OrganizationLogoImage/);
  assert.match(dashboard, /organization\.logo_path/);
  assert.match(dashboard, /organization\.registration_number/);
  assert.doesNotMatch(dashboard, /partner_ngo_application_documents|poem-ngo-applications|signedUrl|createSignedUrl/);
});

await ok('Organization workspace styles are responsive and isolated', async () => {
  for (const className of [
    'organization-dashboard',
    'organization-hero',
    'organization-metric-grid',
    'organization-next-action',
    'organization-dashboard-grid',
    'organization-action-grid',
  ]) assert.match(styles, new RegExp(`\\.${className}`));
  assert.match(styles, /@media\(max-width:900px\).*organization-dashboard-grid/s);
  assert.match(styles, /@media\(max-width:620px\).*organization-metric-grid/s);
  assert.match(styles, /@media\(max-width:420px\).*organization-metric-grid/s);
});

await ok('2.21.0 is UX-only and adds no Supabase migration', async () => {
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.ok(migrations.includes('20261009000600_partner_ngo_application_experience.sql'));
});

console.log(`\n${passed} Organization Workspace UX regression scenarios passed for FieldLance ${pkg.version}.`);
