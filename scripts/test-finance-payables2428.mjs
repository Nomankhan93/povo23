import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
let passed = 0;
async function ok(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const payables = read('src/features/payables/PayablesWorkspace.tsx');
const payablesCss = read('src/features/payables/PayablesWorkspace.module.css');
const funding = read('src/features/finance/ProjectFundingWorkspace.tsx');
const fundingCss = read('src/features/finance/ProjectFundingWorkspace.module.css');
const permissions = read('docs/PERMISSIONS.md');
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();

const protectedHashes = {
  'src/features/finance/fundingRequest.ts': '76f4e5fb84e1edc34f65f6fb70c71d30396aae614ad8debd820f943dfd4eb68b',
  'src/app/capabilityContract.ts': '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62',
  'src/app/routes.ts': 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879',
  'src/app/navigation.ts': '675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132',
  'src/app/AppShell.tsx': '428e73f7de2df65b423c9acc819ad2237d048396be292557aec048cfd1b89397',
  'src/features/projects/ProjectWorkspace.tsx': 'f1edb171031d1d2e2d1f5c240470914384e0731ba317fbbe586f8ceaf9dbfdd8',
  'src/lib/supabase/client.ts': '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc',
  'src/lib/supabase/database.types.ts': 'e29703de0d84d0335ca185a20e155ff1d96d2558ac7e7a8e413b9c36c29a3761',
  'src/features/payments/EarningsWorkspace.tsx': '1d8cd1af8a60f2b6fdc600ddcfa671f2a9862f3ea3470e654f9c0b4801f90a9d',
  'src/styles/design-system.css': '97e4c5a1d061391832c43e57ce4193e8d0670f9a7ffc31c3c8e356c13d493196',
};

function migrationAggregate() {
  const digest = createHash('sha256');
  for (const name of migrations) {
    digest.update(name); digest.update('\0'); digest.update(readFileSync(`supabase/migrations/${name}`)); digest.update('\0');
  }
  return digest.digest('hex');
}

await ok('package and lockfile remain compatible with the 2.42.8 finance contract', async () => {
  assert.ok(['2.42.8','2.42.9'].includes(pkg.version));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.['']?.version, pkg.version);
});
await ok('database migration inventory is unchanged', async () => {
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
  assert.equal(migrationAggregate(), 'a652ce1f61f4e8f3f63b5be83599b36ed716c05c6bcaea811454368af0e80f16');
});
await ok('protected routing, capability, funding helper and integration files remain byte-identical', async () => {
  for (const [path, expected] of Object.entries(protectedHashes)) assert.equal(hash(path), expected, `${path} changed unexpectedly`);
});
await ok('Payables retains the authoritative RPC/query contracts and secondary workflows', async () => {
  for (const contract of ['work_payable_statement','act_work_payable','reserve_payable_receipt','authorize_payable_receipt','respond_work_amendment','offer_work_amendment','claim_work_payable','reconcile_survey_payable']) assert.match(payables, new RegExp(contract));
  assert.match(payables, /work_contract_amendments/);
  assert.match(payables, /work_payable_events/);
  assert.match(payables, /work-payable-receipts/);
});
await ok('Payables is assignment-first and uses desktop tables plus mobile record cards', async () => {
  assert.match(payables, /PAID ASSIGNMENTS/);
  assert.match(payables, /Choose a paid assignment/);
  assert.match(payables, /<DataTable caption="Paid assignments">/);
  assert.match(payables, /<MobileRecordCard/);
  assert.match(payables, /SELECTED ASSIGNMENT SUMMARY/);
  assert.match(payables, /These totals cover the assignment, not only the currently visible page/);
});
await ok('Payables keeps existing pagination and bounded-history semantics explicit', async () => {
  assert.match(payables, /range\(listPage \* 50, listPage \* 50 \+ 49\)/);
  assert.match(payables, /p_page: page/);
  assert.match(payables, /range\(eventPage \* 50, eventPage \* 50 \+ 49\)/);
  assert.match(payables, /Latest 100 amendments/);
  assert.match(payables, /up to 50 units shown per page/);
  assert.match(payables, /Up to 50 events are shown per journal page/);
});
await ok('signed payable values remain valid while malformed financial values are not fabricated as zero', async () => {
  assert.match(payables, /\^\-\?\\d/);
  assert.match(payables, /Signed adjustments are preserved/);
  assert.match(payables, /negative balance represents overpayment\/recovery/i);
  assert.match(payables, /return 'Unavailable'/);
  assert.doesNotMatch(payables, /Number\(value\s*\|\|\s*0\)/);
});
await ok('Payables accounting confirmation is bound to captured unit/version/request context', async () => {
  assert.match(payables, /type Confirmation/);
  assert.match(payables, /contextKey: currentContextKey/);
  assert.match(payables, /p_version: unit\.version/);
  assert.match(payables, /p_request: crypto\.randomUUID\(\)/);
  assert.match(payables, /snapshot\.contextKey !== currentContextKey/);
  assert.match(payables, /await execute\(snapshot\.command\)/);
  assert.match(payables, /if \(sending\.current\) return/);
  assert.match(payables, /sending\.current = true/);
  assert.match(payables, /Retry same request/);
  assert.match(payables, /execute\(pending\)/);
});
await ok('Payables keeps receipt privacy, currency isolation and payment-vs-transfer wording', async () => {
  assert.match(payables, /private and will be attached only if the payment accounting action is confirmed/i);
  assert.match(payables, /currencies are never combined/i);
  assert.match(payables, /does not transfer money/i);
  assert.match(payables, /does not issue a bank refund/i);
  assert.match(payables, /createSignedUrl\(path, 60/);
});
await ok('2.42.8 permissions note preserves historical wallet/provider safety documentation', async () => {
  assert.match(permissions, /Historical permissions note — FieldLance 2\.42\.8/);
  assert.match(permissions, /Historical permissions note — FieldLance 2\.42\.7/);
  assert.match(permissions, /mock.*JazzCash.*Easypaisa|JazzCash.*Easypaisa.*mock/is);
});
await ok('Project Funding retains all existing finance RPC contracts', async () => {
  for (const contract of ['project_funding_status','project_funding_assurance','project_closure_status','project_payable_finance_reconciliation','project_funding_history','record_organization_funding','reserve_project_funding','release_project_funding','create_finance_funding_source','reconcile_project_payable_finance','sweep_expired_project_funding_commitments','advance_project_closure']) assert.match(funding, new RegExp(contract));
});
await ok('Project Funding models ledger operations rather than an invented approval workflow', async () => {
  assert.match(funding, /FUNDING POSITION/);
  assert.match(funding, /PAID WORK FUNDING ASSURANCE/);
  assert.match(funding, /FUNDING OPERATIONS/);
  assert.match(funding, /VERIFIED FUNDING INTAKE/);
  assert.match(funding, /PAYABLE RECONCILIATION/);
  assert.match(funding, /PROJECT FINANCE CLOSURE/);
  assert.match(funding, /direct authorized ledger operations, not funding approval requests/i);
});
await ok('Project Funding prevents stale/mixed project-currency results', async () => {
  assert.match(funding, /loadGeneration/);
  assert.match(funding, /contextRef/);
  assert.match(funding, /generation !== loadGeneration\.current \|\| contextRef\.current !== requestedContext/);
  assert.match(funding, /setStatus\(null\)/);
  assert.match(funding, /setAssurance\(null\)/);
  assert.match(funding, /setClosure\(null\)/);
  assert.match(funding, /setReconciliation\(null\)/);
  assert.match(funding, /setHistory\(\[\]\)/);
  assert.match(funding, /setSources\(\[\]\)/);
  assert.match(funding, /setLoadedContext\(''\)/);
  assert.match(funding, /loadedContext === contextKey/);
});
await ok('Funding source creation preserves entered input after failure', async () => {
  assert.match(funding, /const success = await act/);
  assert.match(funding, /if \(success\) form\.reset\(\)/);
  assert.doesNotMatch(funding, /await act[\s\S]{0,1200}form\.reset\(\)\s*}/);
});
await ok('Funding confirmations capture one stable request identity and exact context', async () => {
  assert.match(funding, /type FundingConfirmation/);
  assert.match(funding, /p_idempotency_key: crypto\.randomUUID\(\)/);
  assert.match(funding, /setFundingConfirmation/);
  assert.match(funding, /snapshot\.contextKey !== contextRef\.current/);
  assert.match(funding, /executeFunding\(snapshot\.request, snapshot\.form\)/);
  assert.match(funding, /executeFunding\(pending\)/);
  assert.match(funding, /original request ID and payload are retained/i);
});
await ok('reconciliation, expired-commitment release and closure confirmations use captured payloads', async () => {
  assert.match(funding, /type OperationalConfirmation/);
  assert.match(funding, /if \(!snapshot \|\| sending\.current\) return/);
  assert.match(funding, /snapshot\.kind === 'reconcile'/);
  assert.match(funding, /p_project: snapshot\.project/);
  assert.match(funding, /p_currency: snapshot\.currency/);
  assert.match(funding, /snapshot\.kind === 'sweep'/);
  assert.match(funding, /p_state: snapshot\.state/);
  assert.doesNotMatch(funding, /FieldLance 2\.26/);
});
await ok('Funding display distinguishes missing data from a real zero and retains four-decimal presentation support', async () => {
  assert.match(funding, /value === null \|\| value === undefined \|\| value === ''/);
  assert.match(funding, /maximumFractionDigits: 4/);
  assert.match(funding, /return 'Unavailable'/);
  assert.doesNotMatch(funding, /Number\(value\s*\|\|\s*0\)/);
});
await ok('funding limits and latest-history scope are visible and unchanged', async () => {
  assert.match(funding, /limit\(500\)/);
  assert.match(funding, /p_limit: 50/);
  assert.match(funding, /limit\(100\)/);
  assert.match(funding, /Latest 50 movements/);
  assert.match(funding, /not a complete ledger export/);
});
await ok('Payables and Project Funding use scoped 2.42 CSS modules and shared primitives', async () => {
  assert.match(payables, /PayablesWorkspace\.module\.css/);
  assert.match(funding, /ProjectFundingWorkspace\.module\.css/);
  for (const primitive of ['Alert','Button','Card','ConfirmDialog','DataTable','Field','MetricCard','MobileRecordCard','SectionHeader','StatusBadge']) {
    assert.match(payables + funding, new RegExp(`\\b${primitive}\\b`));
  }
});
for (const [name, css] of [['Payables', payablesCss], ['Project Funding', fundingCss]]) {
  await ok(`${name} CSS uses tokens, approved typography and approved breakpoints`, async () => {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
    assert.doesNotMatch(css, /!important/);
    assert.doesNotMatch(css, /font-size\s*:\s*(?:[0-9]|1[01])px\b/);
    const breakpoints = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map(match => Number(match[1]));
    assert.deepEqual(breakpoints, [1023, 639]);
    assert.match(css, /var\(--fl-/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /min-height:\s*48px/);
  });
}

console.log(`\n${passed} FieldLance 2.42.8 Payables + Project Funding scenarios passed.`);
