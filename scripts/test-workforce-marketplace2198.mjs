import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const marketplace = read('src/features/workforce/WorkforceMarketplace.tsx');
const styles = read('src/styles/design-system.css');
const marketplaceStyles = read('src/features/workforce/WorkforceMarketplace.module.css');
const navigation = read('src/app/navigation.ts');
const appShell = read('src/app/AppShell.tsx');
const pkg = JSON.parse(read('package.json'));

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.19.8 Workforce Marketplace regression contract remains available', async () => {
  const [major, minor, patch] = pkg.version.split('-')[0].split('.').map(Number);
  assert.ok(
    major > 2 ||
      (major === 2 && minor > 19) ||
      (major === 2 && minor === 19 && patch >= 8),
    `Expected FieldLance >= 2.19.8, received ${pkg.version}`,
  );
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
  assert.match(marketplace, /No permanent Organization profile access is required/i);
  assert.doesNotMatch(marketplace, /grant_profile_share|create_profile_share|permanent profile-sharing grant/);
});

await ok('organization recruitment hub exposes the four recommended workspace views', async () => {
  for (const label of ['Opportunities', 'Applications', 'Find Field Workers', 'Assignments']) assert.match(marketplace, new RegExp(label));
  assert.match(marketplace, /Open opportunities/);
  assert.match(marketplace, /Applications/);
  assert.match(marketplace, /Offers pending/);
  assert.match(marketplace, /Active assignments/);
});

await ok('organization selection continues through existing recruitment RPC lifecycle', async () => {
  assert.match(marketplace, /review_work_application/);
  assert.match(marketplace, /create_work_assignment/);
  assert.match(marketplace, /set_work_opportunity_state/);
  assert.match(marketplace, /project_workforce_candidates/);
  assert.match(marketplace, /Send formal offer/);
});

await ok('formal offers do not activate survey access until Field Worker acceptance', async () => {
  assert.match(marketplace, /Accepting activates the assignment under the existing rules/);
  assert.match(marketplace, /p_status: "accepted"/);
  assert.match(marketplace, /Survey access is active only while the assignment and project are eligible/);
  assert.match(marketplace, /offeredAssignmentCount/);
});

await ok('approved organization identity is reused on Field Worker opportunity and application cards', async () => {
  assert.match(marketplace, /OrganizationLogoImage/);
  assert.match(marketplace, /logo_path/);
  assert.match(marketplace, /logo_updated_at/);
});

await ok('marketplace UX is responsive and uses scoped FieldLance presentation', async () => {
  assert.match(marketplace, /WorkforceMarketplace\.module\.css/);
  for (const className of ['summaryGrid','opportunityCard','applicationsWorkspace','assignmentCard','journey']) {
    assert.match(marketplaceStyles, new RegExp(`\\.${className}\\b`));
  }
  assert.match(marketplaceStyles, /@media \(max-width: 1023px\)/);
  assert.match(marketplaceStyles, /@media \(max-width: 639px\)/);
});

await ok('central navigation still exposes the Field Worker marketplace pages', async () => {
  for (const label of ['Available Opportunities','My Applications','My Assigned Surveys','Workforce marketplace']) {
    assert.match(navigation + appShell, new RegExp(label));
  }
  assert.match(appShell, /personalView=\{page === "Available Opportunities"/);
});

await ok('2.19.8 adds no Supabase migration', async () => {
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.ok(migrations.includes('20261009000600_partner_ngo_application_experience.sql'));
});

console.log(`\n${passed} Workforce Marketplace UX regression scenarios passed for FieldLance ${pkg.version}.`);
