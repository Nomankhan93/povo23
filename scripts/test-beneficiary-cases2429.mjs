import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
let passed = 0;
async function ok(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const manager = read('src/features/cases/BeneficiaryCasesWorkspace.tsx');
const delegated = read('src/features/cases/DelegatedCasesWorkspace.tsx');
const managerCss = read('src/features/cases/BeneficiaryCasesWorkspace.module.css');
const delegatedCss = read('src/features/cases/DelegatedCasesWorkspace.module.css');
const permissions = read('docs/PERMISSIONS.md');
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();

const protectedHashes = {
  'src/app/routes.ts': 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879',
  'src/app/capabilityContract.ts': '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62',
  'src/app/navigation.ts': '675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132',
  'src/app/AppShell.tsx': '428e73f7de2df65b423c9acc819ad2237d048396be292557aec048cfd1b89397',
  'src/features/projects/ProjectWorkspace.tsx': 'f1edb171031d1d2e2d1f5c240470914384e0731ba317fbbe586f8ceaf9dbfdd8',
  'src/lib/supabase/client.ts': '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc',
  'src/lib/supabase/database.types.ts': 'e29703de0d84d0335ca185a20e155ff1d96d2558ac7e7a8e413b9c36c29a3761',
};

function migrationAggregate() {
  const digest = createHash('sha256');
  for (const name of migrations) {
    digest.update(name); digest.update('\0'); digest.update(readFileSync(`supabase/migrations/${name}`)); digest.update('\0');
  }
  return digest.digest('hex');
}

await ok('package and lockfile are FieldLance 2.42.9', async () => {
  assert.equal(pkg.version, '2.42.9');
  assert.equal(lock.version, '2.42.9');
  assert.equal(lock.packages?.['']?.version, '2.42.9');
});
await ok('database migration inventory is unchanged', async () => {
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
  assert.equal(migrationAggregate(), 'a652ce1f61f4e8f3f63b5be83599b36ed716c05c6bcaea811454368af0e80f16');
});
await ok('routing, capability and project integration files remain byte-identical', async () => {
  for (const [path, expected] of Object.entries(protectedHashes)) assert.equal(hash(path), expected, `${path} changed unexpectedly`);
});
await ok('manager Cases preserves the authoritative case, assistance, distribution and follow-up RPC contracts', async () => {
  for (const contract of ['beneficiary_case_queue','beneficiary_case_intake_options','beneficiary_case_detail','beneficiary_case_ownership_detail','create_beneficiary_case','update_beneficiary_case','set_beneficiary_case_owner','clear_beneficiary_case_owner','set_beneficiary_case_need','create_assistance_request','submit_assistance_request','review_assistance_request','cancel_assistance_request','create_assistance_distribution_plan','update_assistance_distribution_plan','schedule_assistance_distribution_plan','mark_assistance_distribution_plan_ready','cancel_assistance_distribution_plan','assistance_duplicate_support_preview','record_assistance_distribution_delivery','beneficiary_case_followup_queue','create_beneficiary_case_followup','complete_beneficiary_case_followup','cancel_beneficiary_case_followup','close_beneficiary_case','reopen_beneficiary_case']) assert.match(manager, new RegExp(contract));
});
await ok('manager Cases uses operational tabs, desktop tables and mobile record cards', async () => {
  assert.match(manager, /Beneficiary case operational views/);
  assert.match(manager, /id:'cases',label:'Cases'/);
  assert.match(manager, /id:'distribution',label:'Distribution'/);
  assert.match(manager, /id:'followups',label:'Follow-ups'/);
  assert.match(manager, /<DataTable caption="Beneficiary case queue"/);
  assert.match(manager, /<DataTable caption="Distribution planning queue"/);
  assert.match(manager, /<DataTable caption="Follow-up & outcome queue"/);
  assert.match(manager, /<MobileRecordCard/);
});
await ok('manager Cases preserves ownership and approval boundaries', async () => {
  assert.match(manager, /Delegate this case without granting broader project, beneficiary or finance access/);
  assert.match(manager, /detail\.can_approve_requests/);
  assert.match(manager, /Awaiting NGO Admin \/ FieldLance survey approval/);
  assert.match(manager, /Choose Approve or Reject explicitly/);
});
await ok('delivery semantics and duplicate-support privacy remain explicit', async () => {
  assert.match(manager, /An approved request is permission to plan support; it does not create a delivery ledger entry/);
  assert.match(manager, /This creates an operational plan only\. It does not record delivery or create an assistance ledger entry/);
  assert.match(manager, /Protected cross-NGO details are not disclosed/);
  assert.match(manager, /record_assistance_distribution_delivery/);
});
await ok('case closure remains server-eligibility driven and lifecycle history remains visible', async () => {
  assert.match(manager, /detail\.closure_eligibility\.can_close/);
  assert.match(manager, /Closure blockers remain/);
  assert.match(manager, /close_beneficiary_case/);
  assert.match(manager, /reopen_beneficiary_case/);
  assert.match(manager, /Case revision history/);
  assert.match(manager, /Closure \/ reopening history/);
});
await ok('create intents reuse one UUID for the same exact payload until success', async () => {
  assert.match(manager, /type CreateIntent=\{signature:string;id:string\}/);
  assert.match(manager, /const createIntentId=/);
  for (const ref of ['caseCreateIntent','requestCreateIntent','followupCreateIntent']) assert.match(manager, new RegExp(`${ref}=useRef<CreateIntent\\|null>\\(null\\)`));
  assert.match(manager, /const createIntent=useRef<CreateIntent\|null>\(null\)/);
  assert.match(manager, /create_beneficiary_case',\{p_id:id,\.\.\.payload\}/);
  assert.match(manager, /create_assistance_request',\{p_id:id,\.\.\.payload\}/);
  assert.match(manager, /create_assistance_distribution_plan',\{p_id:id,\.\.\.payload\}/);
  assert.match(manager, /create_beneficiary_case_followup',\{p_id:id,\.\.\.payload\}/);
  assert.match(manager, /caseCreateIntent\.current=null/);
  assert.match(manager, /requestCreateIntent\.current=null/);
  assert.match(manager, /followupCreateIntent\.current=null/);
});
await ok('delivery recorder still retains one assistance id until successful recording', async () => {
  assert.match(manager, /const \[deliveryId,setDeliveryId\]=useState\(\(\)=>crypto\.randomUUID\(\)\)/);
  assert.match(manager, /p_assistance:deliveryId/);
  assert.match(manager, /setDeliveryId\(crypto\.randomUUID\(\)\)/);
});
await ok('delegated Cases preserves restricted data boundary and delegated RPCs', async () => {
  assert.match(delegated, /my_delegated_case_queue/);
  assert.match(delegated, /my_delegated_followup_queue/);
  assert.match(delegated, /my_delegated_case_detail/);
  assert.match(delegated, /Assistance approvals, finance and organization administration remain outside this workspace/);
  assert.doesNotMatch(delegated, /review_assistance_request/);
  assert.doesNotMatch(delegated, /record_assistance_distribution_delivery/);
});
await ok('delegated queues use shared desktop/mobile presentation', async () => {
  assert.match(delegated, /<DataTable caption="My delegated cases"/);
  assert.match(delegated, /<DataTable caption="My delegated follow-ups"/);
  assert.match(delegated, /<MobileRecordCard/);
  assert.match(delegated, /<MetricCard/);
});
await ok('delegated follow-up creation also preserves stable retry identity', async () => {
  assert.match(delegated, /followupCreateIntent=useRef<CreateIntent\|null>\(null\)/);
  assert.match(delegated, /createIntentId\(followupCreateIntent,payload\)/);
  assert.match(delegated, /create_beneficiary_case_followup',\{p_id:id,\.\.\.payload\}/);
  assert.match(delegated, /followupCreateIntent\.current=null/);
});
await ok('explicit visit location evidence and no-background-tracking boundary remain intact', async () => {
  assert.match(delegated, /Capture current location/);
  assert.match(delegated, /No background tracking is used/);
  assert.match(delegated, /record_beneficiary_case_followup_location_versioned/);
  assert.match(delegated, /Retry saved capture/);
});
await ok('case CSS modules use tokens, approved breakpoints and interaction sizes', async () => {
  for (const css of [managerCss, delegatedCss]) {
    assert.match(css, /min-height: 44px/);
    assert.match(css, /min-height: 48px/);
    assert.match(css, /@media \(max-width: 1023px\)/);
    assert.match(css, /@media \(max-width: 639px\)/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
    assert.doesNotMatch(css, /!important/);
    const breakpoints = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map(match => Number(match[1]));
    assert.ok(breakpoints.every(value => value === 1023 || value === 639));
    for (const px of [...css.matchAll(/font-size:\s*(\d+)px/g)].map(match => Number(match[1]))) assert.ok(px >= 12, `font-size ${px}px is below 12px`);
  }
});
await ok('2.42.9 permissions note explicitly preserves delegated and server authorization boundaries', async () => {
  assert.match(permissions, /Current permissions note — FieldLance 2\.42\.9/);
  assert.match(permissions, /delegated/i);
  assert.match(permissions, /RLS/i);
  assert.match(permissions, /no new.*finance authority/i);
});

console.log(`\n${passed} FieldLance 2.42.9 Beneficiary Cases scenarios passed.`);
