import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const dashboard = read('src/features/operations/FieldLanceStaffDashboard.tsx');
const shell = read('src/app/AppShell.tsx');
const navigation = read('src/app/navigation.ts');
const styles = read('src/styles/design-system.css');

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.22.0 FieldLance Staff Operations regression contract is active', async () => {
  const [major, minor, patch] = pkg.version.split('-')[0].split('.').map(Number);
  assert.ok(
    major > 2 ||
      (major === 2 && minor > 22) ||
      (major === 2 && minor === 22 && patch >= 0),
    `Expected FieldLance >= 2.22.0, received ${pkg.version}`,
  );
  assert.equal(pkg.scripts['test:staff-operations'], 'node scripts/test-staff-operations2220.mjs');
  assert.match(pkg.scripts.test, /test:staff-operations/);
});

await ok('Staff Overview uses a dedicated dashboard while Field Worker and Organization homes remain intact', async () => {
  assert.match(shell, /import \{ FieldLanceStaffDashboard \}/);
  assert.match(shell, /<FieldWorkerDashboard/);
  assert.match(shell, /<OrganizationDashboard/);
  assert.match(shell, /<FieldLanceStaffDashboard/);
  assert.match(shell, /canReviewFieldWorkers=\{Boolean\(volunteers\)\}/);
  assert.match(shell, /canReviewOrganizations=\{Boolean\(ngos\)\}/);
  assert.match(shell, /canManageSurveys=\{surveyManage\}/);
  assert.match(shell, /canManageFinance=\{financeManage\}/);
});

await ok('Staff Operations reads existing authoritative sources and guarded finance RPCs', async () => {
  for (const table of [
    'organizations',
    'partner_ngo_applications',
    'volunteer_profiles',
    'survey_projects',
    'work_applications',
    'work_assignments',
    'survey_responses',
    'beneficiary_cases',
    'assistance_entries',
  ]) assert.match(dashboard, new RegExp(`from\\("${table}"\\)`));
  assert.match(dashboard, /admin_e_wallet_operations_queue/);
  assert.match(dashboard, /admin_e_wallet_provider_reconciliation/);
  assert.doesNotMatch(dashboard, /\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(dashboard, /approve_manual_e_wallet_withdrawal|review_work_application|review_profile|approve_partner_ngo_application/);
});

await ok('Staff Operations exposes network, recruitment, delivery, case and finance metrics', async () => {
  for (const label of [
    'Active organizations',
    'Active projects',
    'Recruitment in progress',
    'Survey review queue',
    'Active cases',
    'Finance attention',
  ]) assert.match(dashboard, new RegExp(label));
});

await ok('priority queue routes decisions back to existing guarded workspaces', async () => {
  for (const marker of [
    'ORGANIZATION APPROVALS',
    'FIELD WORKER REVIEW',
    'SURVEY REVIEW QUEUE',
    'RECRUITMENT OVERSIGHT',
    'FINANCE OPERATIONS',
    'RECONCILIATION',
    'CASE FOLLOW-UP',
    'NETWORK STATUS',
  ]) assert.match(dashboard, new RegExp(marker));
  for (const page of ['NGO applications','Volunteers','Verification','Workforce marketplace','Withdrawal operations','Beneficiary cases','Activity']) {
    assert.match(dashboard, new RegExp(page));
  }
});

await ok('Staff navigation is curated by existing platform-role capabilities', async () => {
  assert.match(shell, /const staffNav = \(\[/);
  assert.match(shell, /volunteers \? \[\["Volunteers"/);
  assert.match(shell, /ngos \? \[\["NGO applications"/);
  assert.match(shell, /surveyManage \? \[\["Project governance"/);
  assert.match(shell, /financeManage \? \[\["Project funding"/);
  assert.match(shell, /superAdmin \? \[\["Accounts"/);
  assert.match(shell, /: poem\s*\? staffNav/s);
});

await ok('Staff public labels improve terminology without renaming stable internal page identifiers', async () => {
  for (const pair of [
    ['Overview', 'Operations home'],
    ['Volunteers', 'Field Workers'],
    ['NGO applications', 'Organization applications'],
    ['Partner NGOs', 'Organizations'],
    ['Survey projects', 'Projects'],
    ['Workforce marketplace', 'Recruitment oversight'],
    ['Withdrawal operations', 'Withdrawals'],
    ['Activity', 'Audit trail'],
  ]) assert.match(navigation, new RegExp(`"?${pair[0]}"?: "${pair[1]}"`));
  assert.match(shell, /poem \? staffPageLabel\(name\)/);
  assert.match(shell, /const displayPage = poem \? staffPageLabel\(page\)/);
});

await ok('Staff sidebar does not mix personal-only Field Worker pages into the Staff workspace', async () => {
  const start = shell.indexOf('const staffNav = ([');
  const end = shell.indexOf('const nav = projectScope', start);
  const staffBlock = shell.slice(start, end);
  for (const personalPage of ['My profile','Work experience','Private documents','Available Opportunities','My Applications','My Assigned Surveys','E-Wallets & withdrawals']) {
    assert.doesNotMatch(staffBlock, new RegExp(personalPage));
  }
});

await ok('Staff Operations styles are responsive and isolated', async () => {
  for (const className of [
    'staff-ops-dashboard',
    'staff-ops-hero',
    'staff-ops-metric-grid',
    'staff-ops-next-action',
    'staff-ops-grid',
    'staff-ops-action-grid',
  ]) assert.match(styles, new RegExp(`\\.${className}`));
  assert.match(styles, /@media\(max-width:900px\).*staff-ops-grid/s);
  assert.match(styles, /@media\(max-width:620px\).*staff-ops-metric-grid/s);
  assert.match(styles, /@media\(max-width:420px\).*staff-ops-metric-grid/s);
});

await ok('2.22.0 is UX-only and adds no Supabase migration', async () => {
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '20261009000600_partner_ngo_application_experience.sql');
  assert.equal(migrations.length, 55);
});

console.log(`\n${passed} FieldLance Staff Operations UX regression scenarios passed for FieldLance ${pkg.version}.`);
