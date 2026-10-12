import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const ui = read('src/components/ui/FieldLanceUI.tsx');
const actionDialog = read('src/components/ui/ActionDialog.tsx');
const foundationCss = read('src/styles/fieldlance-2420.css');
const legacyCss = read('src/styles/design-system.css');
const worker = read('src/features/workforce/FieldWorkerDashboard.tsx');
const org = read('src/features/organizations/OrganizationDashboard.tsx');
const staff = read('src/features/operations/FieldLanceStaffDashboard.tsx');
const reports = read('src/features/analytics/ReportsWorkspace.tsx');
const geography = read('src/features/geography/GeographyManager.tsx');
const ngo = read('src/features/organizations/PartnerNgoApplicationsReview.tsx');
const directory = read('src/features/volunteers/Directory.tsx');
const memberships = read('src/features/organizations/MembershipActions.tsx');
const membershipForm = read('src/features/organizations/MembershipForm.tsx');
const shell = read('src/app/AppShell.tsx');
const modules = [
  'src/features/workforce/FieldWorkerDashboard.module.css',
  'src/features/organizations/OrganizationDashboard.module.css',
  'src/features/operations/FieldLanceStaffDashboard.module.css',
  'src/features/analytics/ReportsWorkspace.module.css',
  'src/features/geography/GeographyManager.module.css',
  'src/features/organizations/PartnerNgoApplicationsReview.module.css',
  'src/features/organizations/MembershipWorkspace.module.css',
  'src/features/volunteers/Directory.module.css',
];

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log(`PASS ${name}`); };

ok('2.42.11 release is registered without database expansion', () => {
  assert.equal(pkg.version, '2.42.11');
  assert.equal(lock.version, '2.42.11');
  assert.equal(lock.packages[''].version, '2.42.11');
  assert.equal(pkg.scripts['test:ui-consistency-24211'], 'node scripts/test-ui-consistency24211.mjs');
  assert.match(pkg.scripts.test, /test:ui-consistency-24211/);
  const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
});

ok('routing capability navigation and protected field contracts remain byte-identical', () => {
  const expected = {
    'src/app/routes.ts': 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879',
    'src/app/capabilityContract.ts': '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62',
    'src/app/navigation.ts': '675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132',
    'src/features/surveys/SurveyForm.tsx': '1fb6ddb56b4b3e4bcb8eb0897092e8e7de8f4208f811eda6d1512353e12e1f59',
    'src/features/surveys/offlineSurveyStore.ts': '3e3cbe89250434b7be6ab831293bbe915895f2d09b09e875fbd59da7a2151204',
    'src/features/cases/BeneficiaryCasesWorkspace.tsx': 'f06191275b1257e8692edee0f16f590882cecbc5280e7316de9b7608f65b7e61',
    'scripts/build-field-worker.mjs': '852cbc7846a38adf73f2bc18642fb9031aa96cf5b5cfa9b3741102aaa22021f9',
  };
  for (const [path, hash] of Object.entries(expected)) assert.equal(sha(path), hash, `${path} changed unexpectedly`);
});

ok('shared MetricCard keeps card behavior and adds native-button interactivity', () => {
  assert.match(ui, /export function MetricCard\(\{ label, value, detail, icon, onClick/);
  assert.match(ui, /if \(onClick\) return <button type="button"/);
  assert.match(ui, /fl-metric-card-action/);
  assert.match(ui, /const metricClass = `fl-metric-card/);
  assert.match(ui, /return <Card className=\{metricClass\}/);
});

ok('all three dashboards adopt shared metrics statuses alerts and scoped styling', () => {
  const cases = [
    [worker, 'FieldWorkerDashboard.module.css', 'field-worker-dashboard'],
    [org, 'OrganizationDashboard.module.css', 'organization-dashboard'],
    [staff, 'FieldLanceStaffDashboard.module.css', 'staff-ops-dashboard'],
  ];
  for (const [source, moduleName, rootHook] of cases) {
    assert.match(source, new RegExp(moduleName.replace('.', '\\.')));
    assert.match(source, /MetricCard/);
    assert.match(source, /StatusBadge/);
    assert.match(source, /<Alert tone="danger"/);
    assert.match(source, new RegExp(rootHook));
  }
});

ok('dashboard data sources remain read-only and role gates remain explicit', () => {
  for (const table of ['work_applications','work_assignments']) assert.match(worker, new RegExp(`from\\("${table}"\\)`));
  assert.match(worker, /available_work_opportunities/);
  assert.match(worker, /my_withdrawal_summary/);
  for (const table of ['survey_projects','work_opportunities','work_applications','work_assignments','beneficiary_cases']) assert.match(org, new RegExp(`from\\("${table}"\\)`));
  for (const table of ['organizations','partner_ngo_applications','volunteer_profiles','survey_projects','survey_responses','beneficiary_cases']) assert.match(staff, new RegExp(`from\\("${table}"\\)`));
  for (const source of [worker, org, staff]) assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);
  for (const gate of ['canReviewOrganizations','canReviewFieldWorkers','canManageSurveys','canManageFinance','superAdmin']) assert.match(staff, new RegExp(gate));
});

ok('dashboard money presentation distinguishes missing data from real zero', () => {
  assert.match(worker, /value === null \|\| value === undefined \|\| value === ""/);
  assert.match(worker, /Number\.isFinite\(amount\)/);
  assert.match(worker, /summary \? moneyLabel\(summary\.available\) : "—"/);
  assert.doesNotMatch(worker, /Number\(value \|\| 0\)/);
  assert.doesNotMatch(staff, /Number\(row\.amount \|\| 0\)/);
  assert.match(staff, /"Amount unavailable"/);
});

ok('new feature CSS follows tokens typography and approved breakpoints', () => {
  for (const path of modules) {
    const css = read(path);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${path} contains a hard-coded color`);
    assert.doesNotMatch(css, /!important/, `${path} contains !important`);
    for (const match of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(match[1]) >= 12, `${path} contains font-size below 12px`);
    for (const match of css.matchAll(/@media\(max-width:(\d+)px\)/g)) assert.ok(['1023','639'].includes(match[1]), `${path} uses unapproved breakpoint ${match[1]}px`);
  }
  for (const path of modules.slice(0, 3)) {
    const css = read(path);
    assert.match(css, /min-height:44px/);
    assert.match(css, /@media\(max-width:639px\).*min-height:48px/s);
  }
});

ok('Reports preserves reporting pagination export and money semantics while using responsive records', () => {
  assert.match(reports, /rpc\("operational_report"/);
  assert.match(reports, /p_offset: offset/);
  assert.match(reports, /p_export: true/);
  assert.match(reports, /data\.total > 5000/);
  assert.match(reports, /reportCSV\(result\.rows\)/);
  assert.match(reports, /<SectionHeader/);
  assert.doesNotMatch(reports, /<PageHeader/);
  assert.match(reports, /<DataTable/);
  assert.match(reports, /<MobileRecordCard/);
  assert.doesNotMatch(reports, /<table\b/);
  assert.match(reports, /m\.currency\} \{m\.amount\}/);
});

ok('Geography preserves hierarchy RPC arguments and gains shared desktop/mobile presentation', () => {
  assert.match(geography, /rpc\("save_geography", \{ p_id: editing\?\.id \|\| null, p_parent: parent \|\| null, p_kind: kind, p_name: String\(f\.get\("name"\)\), p_code: String\(f\.get\("code"\)\), p_source: String\(f\.get\("source"\)\), p_active: f\.get\("active"\) === "on" \}\)/);
  assert.match(geography, /<GeographyBoundaryManager rows=\{rows\}/);
  assert.match(geography, /<DataTable/);
  assert.match(geography, /<MobileRecordCard/);
  assert.doesNotMatch(geography, /<table\b/);
});

ok('Organization application review preserves RPC contract and captures confirmation context', () => {
  assert.match(ngo, /type PendingDecision = \{ id: string; decision: string; note: string; version: number; label: string; organization: string \}/);
  assert.match(ngo, /p_id: captured\.id, p_decision: captured\.decision, p_note: captured\.note, p_version: captured\.version/);
  assert.match(ngo, /<ConfirmDialog/);
  assert.doesNotMatch(ngo, /window\.confirm|window\.prompt/);
  assert.match(ngo, /<DataTable/);
  assert.match(ngo, /<MobileRecordCard/);
  assert.doesNotMatch(ngo, /<table\b/);
});

ok('Volunteer Directory preserves search shortlist pagination and visibility contracts', () => {
  assert.match(directory, /rpc\("search_volunteers"/);
  for (const arg of ['p_org','p_query','p_geography','p_skill','p_language','p_availability','p_status','p_shortlist','p_page']) assert.match(directory, new RegExp(arg));
  assert.match(directory, /rpc\("save_shortlist"/);
  for (const arg of ['p_org','p_user','p_status','p_note','p_version']) assert.match(directory, new RegExp(arg));
  assert.match(directory, /<DataTable/);
  assert.match(directory, /<MobileRecordCard/);
  assert.doesNotMatch(directory, /<table\b/);
  assert.match(directory, /Previous/);
  assert.match(directory, /Next/);
});

ok('Organization Memberships preserve form/RPC fields and use captured shared confirmations', () => {
  for (const name of ['org','user','role','status']) assert.match(membershipForm, new RegExp(`name="${name}"`));
  assert.match(memberships, /type PendingAction/);
  assert.match(memberships, /const captured = pending/);
  assert.match(memberships, /<ConfirmDialog/);
  assert.doesNotMatch(memberships, /window\.confirm|window\.prompt/);
  const start = shell.indexOf('page === "Memberships"');
  const end = shell.indexOf('page === "Notifications"', start);
  const block = shell.slice(start, end > start ? end : start + 12000);
  assert.match(block, /<DataTable/);
  assert.match(block, /<MobileRecordCard/);
  assert.match(block, /rpc\('set_membership',\{p_org:m\.organization_id,p_user:m\.user_id,p_role:role,p_status:status\}\)/);
  assert.doesNotMatch(block, /<table\b/);
});

ok('touched screens use shared form vocabulary without widening unrelated global form cleanup', () => {
  for (const source of [reports, geography, ngo, directory, membershipForm]) assert.doesNotMatch(source, /form-grid/);
  assert.match(reports, /FieldGroup/);
  assert.match(geography, /FieldGroup/);
  assert.match(ngo, /Textarea/);
  assert.match(directory, /FormActions/);
  assert.match(membershipForm, /FieldGroup/);
  assert.match(legacyCss, /\.form-grid/);
});

ok('ActionDialog API and accessibility behavior stay compatible while presentation uses current targets', () => {
  for (const token of ['open','title','description','confirmLabel','cancelLabel','danger','reasonLabel','initialReason','minReasonLength','busy','onCancel','onConfirm']) assert.match(actionDialog, new RegExp(`\\b${token}\\b`));
  assert.match(actionDialog, /useId\(\)/);
  assert.match(actionDialog, /trapFocus\(event, dialogRef\.current\)/);
  assert.match(actionDialog, /event\.key === "Escape"/);
  assert.match(actionDialog, /return \(\) => previous\?\.focus\?\.\(\)/);
  assert.match(foundationCss, /\.action-dialog-actions button\{min-height:44px\}/);
  assert.match(foundationCss, /@media\(max-width:639px\).*\.action-dialog-actions button\{width:100%;min-height:48px\}/s);
  const dialogCss = foundationCss.slice(foundationCss.indexOf('.action-dialog-backdrop'), foundationCss.indexOf('@keyframes fieldlance-spin'));
  assert.doesNotMatch(dialogCss, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(legacyCss, /\.action-dialog-backdrop\{/);
  assert.doesNotMatch(legacyCss, /\.action-dialog\{padding:20px\}/);
});

ok('legacy dashboard and reporting islands are retired from global design-system CSS', () => {
  for (const selector of ['.field-worker-dashboard{','.organization-dashboard{','.staff-ops-dashboard{','.analytics-table{','.analytics-workspace{']) assert.doesNotMatch(legacyCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

console.log(`\n${passed} FieldLance 2.42.11 dashboard, table, form and dialog consistency scenarios passed.`);
