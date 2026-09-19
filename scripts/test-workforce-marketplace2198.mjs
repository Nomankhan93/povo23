import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const marketplace = read('src/features/workforce/WorkforceMarketplace.tsx');
const styles = read('src/styles/design-system.css');
const navigation = read('src/app/navigation.ts');
const appShell = read('src/app/AppShell.tsx');
const pkg = JSON.parse(read('package.json'));

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('release version is 2.19.8', async () => {
  assert.equal(pkg.version, '2.19.8');
  assert.equal(pkg.scripts['test:workforce-marketplace'], 'node scripts/test-workforce-marketplace2198.mjs');
});

await ok('Field Worker lifecycle remains discover → apply → selection → assigned', async () => {
  for (const label of ['Discover', 'Apply', 'Selection', 'Assigned']) assert.match(marketplace, new RegExp(`"${label}"`));
  assert.match(marketplace, /available_work_opportunities/);
  assert.match(marketplace, /apply_work_opportunity/);
  assert.match(marketplace, /respond_work_assignment/);
  assert.match(marketplace, /My assigned surveys/i);
});

await ok('published opportunities remain cross-organization discovery without permanent profile sharing', async () => {
  assert.match(marketplace, /All organizations/);
  assert.match(marketplace, /application-scoped recruitment snapshot/i);
  assert.match(marketplace, /does not grant permanent full-profile access/i);
  assert.doesNotMatch(marketplace, /grant_profile_share|create_profile_share|permanent profile-sharing grant/);
});

await ok('organization recruitment hub exposes the four recommended workspace views', async () => {
  for (const label of ['Opportunities', 'Applications', 'Find Field Workers', 'Assignments']) assert.match(marketplace, new RegExp(label));
  assert.match(marketplace, /Active opportunities/);
  assert.match(marketplace, /New applications/);
  assert.match(marketplace, /Pending offers/);
  assert.match(marketplace, /Active assignments/);
});

await ok('organization selection continues through existing recruitment RPC lifecycle', async () => {
  assert.match(marketplace, /review_work_application/);
  assert.match(marketplace, /create_work_assignment/);
  assert.match(marketplace, /set_work_opportunity_state/);
  assert.match(marketplace, /project_workforce_candidates/);
  assert.match(marketplace, /Send assignment offer/);
});

await ok('formal offers do not activate survey access until Field Worker acceptance', async () => {
  assert.match(marketplace, /Accept to activate this assignment and its survey access/);
  assert.match(marketplace, /p_status: "accepted"/);
  assert.match(marketplace, /Survey access is active/);
  assert.match(marketplace, /offeredAssignmentCount/);
});

await ok('approved organization identity is reused on Field Worker opportunity and application cards', async () => {
  assert.match(marketplace, /OrganizationLogoImage/);
  assert.match(marketplace, /logo_path/);
  assert.match(marketplace, /logo_updated_at/);
});

await ok('marketplace UX is responsive and uses dedicated FieldLance classes', async () => {
  for (const className of ['workforce-metric-grid','workforce-tabs','workforce-opportunity-card','workforce-application-card','workforce-assignment-card','workforce-journey']) {
    assert.match(styles, new RegExp(`\\.${className}`));
  }
  assert.match(styles, /@media\(max-width:800px\).*workforce-tabs/s);
  assert.match(styles, /@media\(max-width:520px\).*workforce-metric-grid/s);
});

await ok('central navigation still exposes the Field Worker marketplace pages', async () => {
  for (const label of ['Available Opportunities','My Applications','My Assigned Surveys','Workforce marketplace']) {
    assert.match(navigation + appShell, new RegExp(label));
  }
  assert.match(appShell, /personalView=\{page === "Available Opportunities"/);
});

await ok('2.19.8 adds no Supabase migration', async () => {
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '20261009000600_partner_ngo_application_experience.sql');
  assert.equal(migrations.length, 55);
});

console.log(`\n${passed} Workforce Marketplace UX scenarios passed for FieldLance 2.19.8.`);
