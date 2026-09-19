import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const dashboard = read('src/features/workforce/FieldWorkerDashboard.tsx');
const shell = read('src/app/AppShell.tsx');
const navigation = read('src/app/navigation.ts');
const styles = read('src/styles/design-system.css');

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.20.0 Field Worker Workspace regression contract remains available', async () => {
  const [major, minor, patch] = pkg.version.split('-')[0].split('.').map(Number);
  assert.ok(
    major > 2 ||
      (major === 2 && minor > 20) ||
      (major === 2 && minor === 20 && patch >= 0),
    `Expected FieldLance >= 2.20.0, received ${pkg.version}`,
  );
  assert.equal(pkg.scripts['test:field-worker-workspace'], 'node scripts/test-field-worker-workspace2200.mjs');
  assert.match(pkg.scripts.test, /test:field-worker-workspace/);
});

await ok('personal Overview uses the dedicated Field Worker dashboard alongside dedicated Organization and Staff homes', async () => {
  assert.match(shell, /import \{ FieldWorkerDashboard \}/);
  assert.match(shell, /personalWorkspace \? \(/);
  assert.match(shell, /<FieldWorkerDashboard/);
  assert.match(shell, /<FieldLanceStaffDashboard/);
  assert.match(shell, /<WorkflowOverview staff=\{false\} personal=\{false\}/);
});

await ok('Field Worker dashboard follows the discover to earn lifecycle', async () => {
  for (const label of ['Discover', 'Apply', 'Selection', 'Assigned', 'Complete', 'Earn']) {
    assert.match(dashboard, new RegExp(`label: "${label}"`));
  }
  for (const page of ['Available Opportunities', 'My Applications', 'My Assigned Surveys']) {
    assert.match(dashboard, new RegExp(page));
  }
});

await ok('dashboard reads existing recruitment, assignment, earnings and verified-history sources', async () => {
  assert.match(dashboard, /from\("work_applications"\)/);
  assert.match(dashboard, /from\("work_assignments"\)/);
  assert.match(dashboard, /available_work_opportunities/);
  assert.match(dashboard, /my_withdrawal_summary/);
  assert.match(dashboard, /work_experience_history/);
  assert.doesNotMatch(dashboard, /\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(dashboard, /apply_work_opportunity|review_work_application|create_work_assignment|act_work_payable|request_e_wallet_withdrawal/);
});

await ok('dashboard exposes the recommended daily metrics and next-action hierarchy', async () => {
  for (const label of [
    'Open opportunities',
    'Applications in review',
    'Offers waiting',
    'Active assignments',
    'Completed work',
    'Available earnings',
  ]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /ACTION REQUIRED/);
  assert.match(dashboard, /ACTIVE FIELD WORK/);
  assert.match(dashboard, /FIND YOUR NEXT ASSIGNMENT/);
});

await ok('existing backend activation rule remains explicit in Field Worker UX', async () => {
  assert.match(dashboard, /Survey access activates only after you accept the formal offer/);
  assert.match(dashboard, /Accept before survey access activates/);
  assert.match(dashboard, /Accepted offers appear here and in My Assigned Surveys/);
});

await ok('personal navigation receives FieldLance labels without renaming internal page identifiers', async () => {
  assert.match(navigation, /Overview: "Home"/);
  assert.match(navigation, /"Work experience": "Verified work history"/);
  assert.match(navigation, /"Workforce payables": "Earnings & payables"/);
  assert.match(navigation, /"E-Wallets & withdrawals": "Wallet & withdrawals"/);
  assert.match(navigation, /workspacePageLabel/);
  assert.match(shell, /workspacePageLabel\(name, personalWorkspace\)/);
  for (const stablePageId of ['Available Opportunities', 'My Applications', 'My Assigned Surveys', 'Workforce payables', 'E-Wallets & withdrawals']) {
    assert.match(shell + navigation, new RegExp(stablePageId));
  }
});

await ok('dashboard includes profile readiness, account readiness and offline field access', async () => {
  assert.match(dashboard, /profileCompleteness/);
  assert.match(dashboard, /Profile readiness/);
  assert.match(dashboard, /ACCOUNT READINESS/);
  assert.match(dashboard, /Private documents/);
  assert.match(dashboard, /Offline field/);
  assert.match(dashboard, /onField/);
});

await ok('Field Worker dashboard styles are responsive and isolated', async () => {
  for (const className of [
    'field-worker-dashboard',
    'field-worker-hero',
    'field-worker-metric-grid',
    'field-worker-next-action',
    'field-worker-journey',
    'field-worker-dashboard-grid',
    'field-worker-readiness-list',
  ]) assert.match(styles, new RegExp(`\\.${className}`));
  assert.match(styles, /@media\(max-width:900px\).*field-worker-dashboard-grid/s);
  assert.match(styles, /@media\(max-width:620px\).*field-worker-metric-grid/s);
  assert.match(styles, /@media\(max-width:420px\).*field-worker-metric-grid/s);
});

await ok('2.20.0 is UX-only and adds no Supabase migration', async () => {
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '20261009000600_partner_ngo_application_experience.sql');
  assert.equal(migrations.length, 55);
});

console.log(`\n${passed} Field Worker Workspace UX regression scenarios passed for FieldLance ${pkg.version}.`);
