import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  getAuthorizedNavigationPages,
  getCapabilityContract,
  hasStaffWorkspaceAccess,
} from '../src/app/capabilityContract.ts';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const shell = read('src/app/AppShell.tsx');
const contractSource = read('src/app/capabilityContract.ts');
let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function capabilities(platformRole, overrides = {}) {
  return getCapabilityContract({
    platformRole,
    staffWorkspace: true,
    organizationWorkspace: false,
    projectWorkspace: false,
    projectRole: null,
    ownsWorkspaceProject: false,
    ...overrides,
  });
}

await ok('2.41.14 release and targeted test are registered', async () => {
  assert.match(pkg.version, /^2\.41\.(?:1[4-9]|[2-9]\d)$/);
  assert.equal(pkg.scripts['test:navigation-capability-24114'], 'node --experimental-strip-types scripts/test-navigation-capability24114.mjs');
});

await ok('staff workspace access is explicit and ordinary Field Workers cannot enter staff scope', async () => {
  for (const role of ['admin','super_admin','volunteer_manager','ngo_manager','auditor','survey_manager']) {
    assert.equal(hasStaffWorkspaceAccess(role), true, role);
  }
  for (const role of ['volunteer','ngo_admin','project_manager','area_focal_person','']) {
    assert.equal(hasStaffWorkspaceAccess(role), false, role);
  }
});

await ok('platform role matrix exposes only existing staff capabilities', async () => {
  const superAdmin = capabilities('super_admin');
  assert.equal(superAdmin.superAdmin, true);
  assert.equal(superAdmin.reviewFieldWorkers, true);
  assert.equal(superAdmin.reviewOrganizations, true);
  assert.equal(superAdmin.manageSurveys, true);
  assert.equal(superAdmin.manageFinance, true);
  assert.equal(superAdmin.manageMemberships, true);
  assert.equal(superAdmin.manageAccounts, true);

  const volunteerManager = capabilities('volunteer_manager');
  assert.equal(volunteerManager.reviewFieldWorkers, true);
  assert.equal(volunteerManager.reviewOrganizations, false);
  assert.equal(volunteerManager.manageSurveys, false);
  assert.equal(volunteerManager.manageFinance, false);

  const ngoManager = capabilities('ngo_manager');
  assert.equal(ngoManager.reviewOrganizations, true);
  assert.equal(ngoManager.manageGeography, true);
  assert.equal(ngoManager.reviewFieldWorkers, false);

  const surveyManager = capabilities('survey_manager');
  assert.equal(surveyManager.manageSurveys, true);
  assert.equal(surveyManager.manageFinance, false);

  const auditor = capabilities('auditor');
  assert.equal(auditor.staffWorkspace, true);
  assert.equal(auditor.reviewFieldWorkers, false);
  assert.equal(auditor.reviewOrganizations, false);
  assert.equal(auditor.manageSurveys, false);
  assert.equal(auditor.manageFinance, false);
});

await ok('staff navigation derives from the capability matrix without privileged page leakage', async () => {
  const workerReview = getAuthorizedNavigationPages({kind:'staff',capabilities:capabilities('volunteer_manager'),dev:false});
  assert(workerReview.includes('Volunteers'));
  assert(workerReview.includes('Reputation & Certificates'));
  for (const page of ['NGO applications','Survey review','Project funding','Memberships','Accounts','Geography']) assert(!workerReview.includes(page), page);

  const organizationReview = getAuthorizedNavigationPages({kind:'staff',capabilities:capabilities('ngo_manager'),dev:false});
  for (const page of ['NGO applications','Organization Settings','Geography']) assert(organizationReview.includes(page), page);
  for (const page of ['Volunteers','Survey review','Project funding','Accounts']) assert(!organizationReview.includes(page), page);

  const survey = getAuthorizedNavigationPages({kind:'staff',capabilities:capabilities('survey_manager'),dev:false});
  for (const page of ['Survey review','Project governance','Survey templates','Canonical registry','Beneficiary cases','Assistance ledger','Data sharing','Workforce marketplace']) assert(survey.includes(page), page);
  assert(!survey.includes('Project funding'));

  const admin = getAuthorizedNavigationPages({kind:'staff',capabilities:capabilities('admin'),dev:false});
  for (const page of ['Project funding','Withdrawal operations','Memberships']) assert(admin.includes(page), page);
  assert(!admin.includes('Accounts'));
  assert(!admin.includes('E-Wallet sandbox'));

  const superDev = getAuthorizedNavigationPages({kind:'staff',capabilities:capabilities('super_admin'),dev:true});
  assert(superDev.includes('Accounts'));
  assert(superDev.includes('E-Wallet sandbox'));
});

await ok('personal and Organization navigation remain curated boundaries', async () => {
  const neutral = capabilities('volunteer', {staffWorkspace:false});
  const personal = getAuthorizedNavigationPages({kind:'personal',capabilities:neutral,dev:false});
  for (const page of ['My profile','Available Opportunities','My Applications','My Assigned Surveys','E-Wallets & withdrawals']) assert(personal.includes(page), page);
  for (const page of ['Accounts','Memberships','NGO applications','Withdrawal operations']) assert(!personal.includes(page), page);

  const organization = getAuthorizedNavigationPages({kind:'organization',capabilities:neutral,dev:false});
  for (const page of ['Survey projects','Project team','Workforce marketplace','Volunteers','Survey templates','Project funding']) assert(organization.includes(page), page);
  for (const page of ['My profile','Available Opportunities','Accounts','Geography','Withdrawal operations']) assert(!organization.includes(page), page);
});

await ok('project navigation is role-scoped and preserves manager/focal boundaries', async () => {
  const neutral = capabilities('volunteer', {staffWorkspace:false, projectWorkspace:true});
  const manager = getAuthorizedNavigationPages({kind:'project',capabilities:neutral,projectRole:'project_manager',dev:false});
  for (const page of ['Recruitment','Beneficiary cases','Assistance ledger']) assert(manager.includes(page), page);

  const focal = getAuthorizedNavigationPages({kind:'project',capabilities:neutral,projectRole:'area_focal_person',dev:false});
  assert(focal.includes('Beneficiary cases'));
  assert(!focal.includes('Recruitment'));
  assert(!focal.includes('Assistance ledger'));

  const other = getAuthorizedNavigationPages({kind:'project',capabilities:neutral,projectRole:'field_worker',dev:false});
  for (const page of ['Recruitment','Beneficiary cases','Assistance ledger']) assert(!other.includes(page), page);
});

await ok('workspace action capabilities preserve existing owner and project-manager semantics', async () => {
  const staffSurvey = capabilities('survey_manager');
  assert.equal(staffSurvey.manageWorkspaceProject, true);
  assert.equal(staffSurvey.manageWorkspaceTeam, true);
  assert.equal(staffSurvey.manageProjectAssignments, true);

  const owner = capabilities('volunteer', {staffWorkspace:false, organizationWorkspace:true, ownsWorkspaceProject:true});
  assert.equal(owner.manageWorkspaceProject, true);
  assert.equal(owner.manageWorkspaceTeam, true);
  assert.equal(owner.manageWorkspaceFinance, true);
  assert.equal(owner.manageProjectAssignments, true);

  const projectManager = capabilities('volunteer', {staffWorkspace:false, projectWorkspace:true, projectRole:'project_manager'});
  assert.equal(projectManager.manageWorkspaceProject, true);
  assert.equal(projectManager.manageProjectAssignments, true);
  assert.equal(projectManager.manageWorkspaceTeam, false);
  assert.equal(projectManager.manageWorkspaceFinance, false);

  const focal = capabilities('volunteer', {staffWorkspace:false, projectWorkspace:true, projectRole:'area_focal_person'});
  assert.equal(focal.manageWorkspaceProject, false);
  assert.equal(focal.manageProjectAssignments, false);
});

await ok('AppShell consumes the centralized contract instead of rebuilding role navigation arrays', async () => {
  assert.match(shell, /getCapabilityContract/);
  assert.match(shell, /getAuthorizedNavigationPages/);
  assert.match(shell, /authorizedPages\.map\(\(name\) => \[name, navigationIcon\(name\)\]/);
  assert.doesNotMatch(shell, /const standardNav =/);
  assert.doesNotMatch(shell, /const organizationNav =/);
  assert.doesNotMatch(shell, /const staffNav =/);
  assert.doesNotMatch(shell, /\["admin", "super_admin"\]\.includes\(account\.platform_role\)/);
  assert.match(contractSource, /RLS|authoritative|navigation/i);
});

await ok('2.41.14 adds no navigation/capability database migration', async () => {
  const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
  assert(migrations.includes('20261013000570_security_advisor_rpc_surface_hardening.sql'));
  assert.equal(migrations.some(name => /navigation.*capability|capability.*navigation/i.test(name)), false);
});

console.log(`\n${passed} FieldLance 2.41.14 navigation/capability scenarios passed.`);
