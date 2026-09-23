import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outputNames = ['FILES.txt', 'project-tree.txt', 'PROJECT_ANALYSIS_CONTEXT.txt'];
const ignoredDirNames = new Set(['.git', 'node_modules', 'dist', '.poem-patch-backups', '.fieldlance-patch-backups']);

function normalized(path) {
  return path.split('\\').join('/');
}

function shouldIgnore(relPath, isDirectory) {
  const p = normalized(relPath);
  const parts = p.split('/').filter(Boolean);

  if (parts.some((part) => ignoredDirNames.has(part))) return true;
  if (parts.some((part) => part.startsWith('.library-test-'))) return true;
  if (p === 'supabase/.temp' || p.startsWith('supabase/.temp/')) return true;
  if (p === 'supabase/.branches' || p.startsWith('supabase/.branches/')) return true;
  if (!isDirectory && (p === '.env' || (p.startsWith('.env.') && p !== '.env.example'))) return true;
  if (!isDirectory && (p.endsWith('.log') || p.endsWith('.tsbuildinfo'))) return true;
  if (!isDirectory && /\.before-.*-fix$/.test(p)) return true;
  return false;
}

function walk(dir = root) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  const dirs = [];

  for (const entry of entries) {
    const abs = resolve(dir, entry.name);
    const rel = normalized(relative(root, abs));
    if (shouldIgnore(rel, entry.isDirectory())) continue;

    if (entry.isDirectory()) {
      dirs.push(rel);
      const child = walk(abs);
      dirs.push(...child.dirs);
      files.push(...child.files);
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }

  return { files, dirs };
}

function generateFilesTxt(files) {
  return `${files.join('\n')}\n`;
}

function generateProjectTree(files, dirs) {
  const all = ['.', ...dirs.map((p) => `./${p}`), ...files.map((p) => `./${p}`)]
    .sort((a, b) => {
      if (a === '.') return -1;
      if (b === '.') return 1;
      return a.localeCompare(b);
    });
  return `${all.join('\n')}\n`;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function migrationNames(files) {
  return files
    .filter((p) => p.startsWith('supabase/migrations/') && p.endsWith('.sql'))
    .map((p) => p.slice('supabase/migrations/'.length))
    .sort();
}

function generateAnalysisContext(files) {
  const pkg = readJson('package.json');
  const migrations = migrationNames(files);
  const tests = files.filter((p) => p.startsWith('scripts/test-') && p.endsWith('.mjs')).sort();
  const sourceFiles = files.filter((p) => p.startsWith('src/') && /\.(ts|tsx)$/.test(p));
  const docs = files.filter((p) => p.startsWith('docs/') && p.endsWith('.md'));
  const nvm = existsSync(resolve(root, '.nvmrc')) ? readFileSync(resolve(root, '.nvmrc'), 'utf8').trim() : 'not specified';
  const migrationHead = migrations.at(-1) ?? 'none';

  const lines = [
    '===== FieldLance PROJECT ANALYSIS CONTEXT =====',
    'Generated deterministically by scripts/generate-project-metadata.mjs.',
    'Do not hand-edit this file; run npm run metadata:generate.',
    '',
    '===== RELEASE =====',
    `Release: ${pkg.version}`,
    `Package: ${pkg.name}`,
    `Node engine: ${pkg.engines?.node ?? 'not specified'}`,
    `NVM version: ${nvm}`,
    `Supabase CLI package: ${pkg.devDependencies?.supabase ?? 'not specified'}`,
    '',
    '===== ARCHITECTURE =====',
    'React + TypeScript + Vite modular monolith backed by Supabase Auth/PostgreSQL/PostgREST/Storage.',
    'PostgreSQL RLS and guarded RPCs are the authorization boundary; frontend navigation is not a security boundary.',
    'Current domains: auth/workspaces, organizations/onboarding, volunteers, surveys/capture/offline sync, registry/canonical identity, needs/assistance, controlled sharing, governance/verification, templates, workforce recruitment, payables and automatic FieldLance work history.',
    '',
    '===== CURRENT 2.38.1 PRODUCT BOUNDARIES =====',
    '- One personal FieldLance account can access multiple authorized workspaces.',
    '- 2.30.1 stabilizes document deletion, draft-safe navigation, pending application counts and lazy feature boundaries.',
    '- 2.36.0 adds canonical browser routes for personal, Organization, Staff and project workspaces; deep links never replace RLS/RPC authorization.',
    '- 2.36.1 retires Partner Organization project/template pre-approval: active Organization Admins publish their own saved drafts directly while FieldLance survey-management staff govern published content through audited block/remove/restore moderation.',
    '- 2.37.0 adds private structured Field Worker availability, date exceptions, capacity preferences and privacy-preserving assignment conflict summaries. Hard capacity conflicts are enforced on offered/active work assignments below the UI.',
    '- 2.38.1 makes the published project itself the canonical workforce marketplace unit: every active published project receives an automatic current listing visible to all active Field Workers while recruitment is effectively open. Permanent profile sharing and Organization-first worker search are not prerequisites.',
    '- Automatic marketplace listings use application-scoped profile snapshot consent, follow project recruitment/moderation state, and roll forward on compensation changes without rewriting historical application/assignment terms. Direct worker search and targeted campaigns remain optional secondary workflows.',
    '- 2.38.0 adds assignment-bound explicit attendance/work sessions and timesheets. Location evidence is captured only on explicit check-in/check-out according to project policy; continuous/background tracking, polygon geofencing and biometric attendance are not introduced.',
    '- 2.38.0 stores raw capture time separately from server receive time and keeps reviewer effective-time corrections in immutable adjustment/event history. Project IANA timezone determines the work date.',
    '- Organization Admin and active Project Manager manage attendance policy/review. FieldLance platform survey authority retains authorized oversight/read access but is not a routine attendance approver solely because of the platform role; Area Focal gains no broad attendance-management authority.',
    '- Approved daily-rate attendance creates/reuses the existing work_payable_units day record; finance approval/payment stays on the existing payable/finance authority. fixed_assignment and per_verified_survey semantics remain unchanged and hourly-rate pay is not added.',
    '- Moderation is separate from project active/closed state and template immutability. Temporary blocks pause effective recruitment/assignment/collection without destroying commitment state; operational removal closes/cancels forward work while preserving historical survey/case/assistance/payable/audit records. Restoring removed content never silently recreates cancelled work.',
    '- Browser Back/Forward waits for active field-draft persistence; failed persistence restores the previous route instead of silently unmounting field work.',
    '- Project workspace tabs, beneficiary cases and recruitment application/assignment focus can be restored from canonical URLs. Personal mobile navigation exposes Home / Work / Field / Earnings / Profile while secondary tools remain in the drawer.',
    '- 2.36.0 added no database migration and was built directly on the validated 2.31.0 baseline. 2.36.1 adds moderation/self-publication, 2.37.0 workforce scheduling, and 2.38.0 attendance/location/payable integration as forward migrations. Planned scopes previously labelled 2.32-2.35 are not present and must not later ship with a lower package version.',
    '- 2.30.0 completes the project workspace: distinct Overview/Team/Recruitment/Field Work/Responses/Cases/Finance/Governance/Documents/Activity surfaces, current-project locked finance/governance, private project documents, and a guarded project activity feed.',
    '- Project-document mutation follows existing project-management authority. Active project staff may read ready project documents; project activity remains manager-only. Existing survey evidence and organization-compliance storage remain authoritative.',
    '- 2.19.0 adds beneficiary cases/requests; 2.19.1 adds planning-only distribution plans; 2.19.2 records controlled delivery into assistance_entries with canonical duplicate-support controls; 2.19.3 adds structured follow-up, outcomes and controlled close/reopen lifecycle history.',
    '- 2.19.4 stabilized the frontend foundation. 2.19.5 completed the user-facing FieldLance rebrand. 2.19.6 added the visual-system/navigation foundation. 2.19.7 redesigns Partner NGO onboarding. 2.19.8 redesigns the workforce marketplace UX. 2.20.0 adds a dedicated Field Worker daily workspace. 2.21.0 adds a dedicated Organization daily workspace. 2.22.0 adds a role-aware FieldLance Staff Operations Home over existing organization, Field Worker, project, recruitment, survey, case, assistance and guarded finance sources without replacing backend authorization.',
    '- Case intake requires approved survey provenance; one assessed need can belong to only one active case at a time.',
    '- FieldLance survey authority, NGO Admin and Project Manager manage cases/requests/plans/follow-ups within existing project scope; only NGO Admin / FieldLance survey authority approve or reject requests. Area Focal remains outside broad case/planning/delivery/follow-up mutation authority.',
    '- Assistance-request approval means approved for planning only. A ready plan still is not delivery; 2.19.2 creates assistance_entries through guarded delivery recording, and 2.19.3 requires structured post-delivery follow-up/outcome evidence before controlled case closure.',
    '- Volunteer profiles self-publish after server validation; independent identity verification is separate.',
    '- Partner NGO onboarding uses Organization → Operating Areas → Programs → Documents → Review; approval creates the organization and first NGO Admin membership. Draft logos remain private and approval synchronizes the logo to organization presentation.',
    '- Open recruitment uses application-scoped profile snapshots; live NGO volunteer access is project/assignment/invitation scoped.',
    '- Historical permanent profile-share schema remains only for compatibility and is not a current UI workflow.',
    '- Survey capture includes encrypted device drafts/queue and reconnect synchronization; full cold-start offline/PWA caching remains outside the current baseline.',
    '- Worker payable accounting, verified organization funding, project reservation and payable-to-finance reconciliation exist; 2.18.2 adds guarded manual JazzCash/Easypaisa settlement and provider reconciliation without live provider API custody.',
    '- Project Manager and Area Focal Person workspaces include RLS-filtered operational metrics, area coverage, recent response queues and direct review navigation; broad NGO administration remains separate.',
    '- Active Organization Admins can create organization-owned survey-template drafts and directly publish immutable Organization template versions; no FieldLance pre-approval queue is required.',
    '- Active Organization Admins can stage and directly publish organization-owned project drafts; publication materializes exactly one existing operational survey_projects row immediately.',
    '- Project drafts can use allowed FieldLance-owned templates or allowed published templates owned by the same Organization; cross-Organization private template reuse is rejected server-side.',
    '- FieldLance survey managers retain direct project/template creation plus audited post-publication moderation. Block/remove/restore requires a reason; Organization users cannot self-moderate platform content.',
    '- Project approved-response targets are soft operational controls: target reach closes new recruitment/offers but does not reject existing/offline survey synchronization.',
    '- Project-level required-volunteer capacity is separate from the survey target and counts distinct committed volunteers across current formal/direct assignments.',
    '- NGO Admin and Project Manager can increase target/capacity or manually close/reopen recruitment; Area Focal remains scoped monitoring/review only.',
    '- Projects now carry structured compensation defaults for future work; NGO Admin / FieldLance survey-management authority can change them while Project Manager is read-only for the financial commitment.',
    '- Automatic project marketplace listings snapshot project compensation; later project-rate changes roll the current listing forward without mutating historical opportunities/applications.',
    '- Formal work assignments inherit the authoritative opportunity/project snapshot and remain immutable; existing payable generation continues to use approved-response uniqueness rather than a second accounting engine.',
    '- Finance Core now uses immutable `finance_accounts`, `finance_journals` and `finance_postings`; journal debits and credits must balance in one currency and balances are derived from postings.',
    '- Existing worker payable tables remain the authoritative entitlement subledger; 2.17.2 bridges monetary payable events idempotently into aggregate project reserved/committed/spent finance buckets.',
    '- Generic finance mutation is FieldLance admin/super-admin only; NGO Admin may reserve/release verified own-organization funds only through constrained project-funding RPCs; project operational roles do not inherit finance authority.',
    '- Verified funding sources/receipts and payable-finance links are immutable. Available/reserved/committed/spent values are derived from standardized finance accounts rather than editable balance columns.',
    '- New monetary payable events bridge atomically; insufficient reserved funding blocks financial approval. Historical unbridged events are detectable and replayable through constrained reconciliation RPCs.',
    '- Personal payout methods in 2.18.2 remain limited to JazzCash and Easypaisa e-wallets; bank accounts / IBAN payout paths are intentionally excluded.',
    '- E-wallet binding stores normalized account data behind RPC-only tables, returns masked account numbers to the UI, enforces one active wallet number per provider across FieldLance accounts, and uses pending/verified/rejected/suspended/unlinked lifecycle states.',
    '- Transaction PINs are server-hashed with the Supabase pgcrypto API; plaintext PINs are never persisted or returned. Five failed protected checks create a 15-minute lock.',
    '- Newly verified wallets have a 24-hour withdrawal activation hold; the mock admin may explicitly bypass it only for development tests. Withdrawal requests reserve exact approved-but-unpaid payable allocations so the same entitlement cannot fund concurrent withdrawals.',
    '- Wallet verification still uses the clearly labelled FieldLance-Admin-only mock sandbox. Withdrawal execution can remain mock for development or be approved into a guarded manual provider path where FieldLance records the real JazzCash/Easypaisa transaction reference after out-of-band payment; no live API credential is embedded.',
    '- Mock and manual settlement both use exact server-generated allocation request IDs and existing work_payable_events, so the 2.17.2 finance bridge remains the only Committed → Spent path. Manual operations add server-side payout limits, dual control, unique provider references and reconciliation across allocation/payment/reversal/finance-link state.',
    '',
    '===== DATABASE BASELINE =====',
    `Ordered migration files: ${migrations.length}`,
    `Migration head: ${migrationHead}`,
    'Existing migration filenames are immutable historical ordering identifiers. New forward migrations must sort after the current head.',
    '',
    ...migrations.map((name) => `- ${name}`),
    '',
    '===== TEST / SOURCE INVENTORY =====',
    `Test scripts (scripts/test-*.mjs): ${tests.length}`,
    `TypeScript/TSX source files: ${sourceFiles.length}`,
    `Markdown docs: ${docs.length}`,
    `Inventory files (excluding local/build/temp/backup state): ${files.length}`,
    '',
    '===== RELEASE COMMANDS =====',
    'npm run metadata:check',
    'npm run release:consistency',
    'npm run preflight',
    'npx supabase start',
    'npx supabase migration up --local',
    'npm run test:ngo-application',
    'npm run test:workforce-marketplace',
    'npm run test:field-worker-workspace',
    'npm run test:organization-workspace',
    'npm run test:staff-operations',
    'npm run test:task-center',
    'npm run test:notification-center',
    'npm run test:followup',
    'npm run test:assistance',
    'npm run test:distribution',
    'npm run test:cases',
    'npm run test:payments',
    'npm run test:local',
    'npm run test:operations',
    'npm run test:routing-236',
    'npm run test:self-publish-2361',
    'npm run test:workforce-scheduling-237',
    'npm run test:attendance-238',
    '',
    '===== KNOWN SCALE / OPERATIONS LIMITS =====',
    '- Supporting UI lists still use bounded fetches in several places (for example account/organization/membership/event selectors).',
    '- Communication Center now supports 50-row paging, archive/history, deep links, preferences and scoped broadcasts; external email/push/SMS/WhatsApp delivery remains deferred.',
    '- Large-scale production readiness still requires browser/mobile E2E, load tests, backup/restore drills, monitoring and cloud parity checks.',
    '',
    '===== NEXT DEVELOPMENT BOUNDARY =====',
    'FieldLance 2.38.0 adds explicit assignment attendance, work-session timesheets, check-in/out location evidence and daily-rate payable integration on top of the 2.37 scheduling foundation.',
    'Future releases must use versions greater than 2.38.0. The previously planned 2.32-2.35 scopes remain deferred and should be renumbered when implemented.',
    'The next planned feature phase is 2.39 Case Ownership & Area-Scoped Case Operations. Keep attendance/location privacy boundaries stable and do not broaden Area Focal authority without explicit geography-scoped case design.',
    'Keep the validated beneficiary assistance lifecycle stable; do not silently expand case closure into inventory, beneficiary cash-transfer execution, automated eligibility or finance.',
    'Keep 2.14 project staff / collection-geography authorization as the operational boundary; Area Focal case access remains deferred until an explicit area-scoped design exists.',
    'Keep project funding/reservation, payable reconciliation and e-wallet settlement on constrained RPCs. Live JazzCash/Easypaisa adapters remain deferred until official provider credentials/documentation are available.',
    '',
    '===== INVENTORY EXCLUSIONS =====',
    '.git/, node_modules/, dist/, .poem-patch-backups/, .fieldlance-patch-backups/, supabase/.temp/, supabase/.branches/, local secret .env files, logs and temporary test directories are intentionally excluded.',
    '- .env.example is intentionally tracked and should remain included in analysis/handoff ZIPs.',
    '',
  ];

  return lines.join('\n');
}

const inventory = walk();
const outputs = {
  'FILES.txt': generateFilesTxt(inventory.files),
  'project-tree.txt': generateProjectTree(inventory.files, inventory.dirs),
  'PROJECT_ANALYSIS_CONTEXT.txt': generateAnalysisContext(inventory.files),
};

let stale = false;
for (const name of outputNames) {
  const expected = outputs[name];
  const path = resolve(root, name);
  if (checkOnly) {
    const actual = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (actual !== expected) {
      stale = true;
      console.error(`STALE ${name}: run npm run metadata:generate`);
    } else {
      console.log(`OK ${name}`);
    }
  } else {
    writeFileSync(path, expected);
    console.log(`WROTE ${name}`);
  }
}

if (checkOnly && stale) process.exit(1);
