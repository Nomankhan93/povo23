import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outputNames = ['FILES.txt', 'project-tree.txt', 'PROJECT_ANALYSIS_CONTEXT.txt'];
const ignoredDirNames = new Set(['.git', 'node_modules', 'dist', '.poem-patch-backups']);

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
    '===== POEM PROJECT ANALYSIS CONTEXT =====',
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
    'Current domains: auth/workspaces, organizations/onboarding, volunteers, surveys/capture/offline sync, registry/canonical identity, needs/assistance, controlled sharing, governance/verification, templates, workforce recruitment, payables and automatic POEM work history.',
    '',
    '===== CURRENT 2.18.2 PRODUCT BOUNDARIES =====',
    '- One personal POEM account can access multiple authorized workspaces.',
    '- Volunteer profiles self-publish after server validation; independent identity verification is separate.',
    '- Partner NGO onboarding is supported; approval creates the organization and first NGO Admin membership.',
    '- Open recruitment uses application-scoped profile snapshots; live NGO volunteer access is project/assignment/invitation scoped.',
    '- Historical permanent profile-share schema remains only for compatibility and is not a current UI workflow.',
    '- Survey capture includes encrypted device drafts/queue and reconnect synchronization; full cold-start offline/PWA caching remains outside the current baseline.',
    '- Worker payable accounting, verified organization funding, project reservation and payable-to-finance reconciliation exist; 2.18.2 adds guarded manual JazzCash/Easypaisa settlement and provider reconciliation without live provider API custody.',
    '- Project Manager and Area Focal Person workspaces include RLS-filtered operational metrics, area coverage, recent response queues and direct review navigation; broad NGO administration remains separate.',
    '- Active NGO Admins can create organization-owned survey-template drafts and use immutable approved NGO template versions.',
    '- Active NGO Admins can stage organization-owned project drafts; POEM approval materializes exactly one existing operational survey_projects row.',
    '- Project drafts can use POEM-owned templates or approved templates owned by the same NGO; cross-NGO private template reuse is rejected server-side.',
    '- POEM survey managers retain direct project creation and receive guarded template/project review queues with changes-request/reject/approve decisions.',
    '- Project approved-response targets are soft operational controls: target reach closes new recruitment/offers but does not reject existing/offline survey synchronization.',
    '- Project-level required-volunteer capacity is separate from the survey target and counts distinct committed volunteers across current formal/direct assignments.',
    '- NGO Admin and Project Manager can increase target/capacity or manually close/reopen recruitment; Area Focal remains scoped monitoring/review only.',
    '- Projects now carry structured compensation defaults for future work; NGO Admin / POEM survey-management authority can change them while Project Manager is read-only for the financial commitment.',
    '- New recruitment opportunities snapshot project compensation; later project-rate changes do not mutate historical opportunities.',
    '- Formal work assignments inherit the authoritative opportunity/project snapshot and remain immutable; existing payable generation continues to use approved-response uniqueness rather than a second accounting engine.',
    '- Finance Core now uses immutable `finance_accounts`, `finance_journals` and `finance_postings`; journal debits and credits must balance in one currency and balances are derived from postings.',
    '- Existing worker payable tables remain the authoritative entitlement subledger; 2.17.2 bridges monetary payable events idempotently into aggregate project reserved/committed/spent finance buckets.',
    '- Generic finance mutation is POEM admin/super-admin only; NGO Admin may reserve/release verified own-organization funds only through constrained project-funding RPCs; project operational roles do not inherit finance authority.',
    '- Verified funding sources/receipts and payable-finance links are immutable. Available/reserved/committed/spent values are derived from standardized finance accounts rather than editable balance columns.',
    '- New monetary payable events bridge atomically; insufficient reserved funding blocks financial approval. Historical unbridged events are detectable and replayable through constrained reconciliation RPCs.',
    '- Personal payout methods in 2.18.2 remain limited to JazzCash and Easypaisa e-wallets; bank accounts / IBAN payout paths are intentionally excluded.',
    '- E-wallet binding stores normalized account data behind RPC-only tables, returns masked account numbers to the UI, enforces one active wallet number per provider across POEM accounts, and uses pending/verified/rejected/suspended/unlinked lifecycle states.',
    '- Transaction PINs are server-hashed with the Supabase pgcrypto API; plaintext PINs are never persisted or returned. Five failed protected checks create a 15-minute lock.',
    '- Newly verified wallets have a 24-hour withdrawal activation hold; the mock admin may explicitly bypass it only for development tests. Withdrawal requests reserve exact approved-but-unpaid payable allocations so the same entitlement cannot fund concurrent withdrawals.',
    '- Wallet verification still uses the clearly labelled POEM-Admin-only mock sandbox. Withdrawal execution can remain mock for development or be approved into a guarded manual provider path where POEM records the real JazzCash/Easypaisa transaction reference after out-of-band payment; no live API credential is embedded.',
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
    'npm run test:local',
    'npm run test:operations',
    '',
    '===== KNOWN SCALE / OPERATIONS LIMITS =====',
    '- Supporting UI lists still use bounded fetches in several places (for example account/organization/membership/event selectors).',
    '- In-app notifications are currently a bounded inbox without full paging, push, email or SMS delivery.',
    '- Large-scale production readiness still requires browser/mobile E2E, load tests, backup/restore drills, monitoring and cloud parity checks.',
    '',
    '===== NEXT DEVELOPMENT BOUNDARY =====',
    '2.18.2 — JazzCash production adapter and 2.18.3 — Easypaisa production adapter only after official credentials and callback/signature documentation are available; preserve the stabilized provider-neutral withdrawal contract and finance bridge.',
    'Keep 2.14 project staff / collection-geography authorization as the operational boundary for approved project workflows.',
    'Keep project funding/reservation, payable reconciliation and e-wallet settlement on constrained RPCs; do not widen generic finance posting to NGO, project staff or wallet clients.',
    'Do not widen broad NGO directory, canonical, sharing or finance access for project-scoped staff; do not add bank payout support in the current 2.18 line unless explicitly planned later.',
    '',
    '===== INVENTORY EXCLUSIONS =====',
    '.git/, node_modules/, dist/, .poem-patch-backups/, supabase/.temp/, supabase/.branches/, local .env files, logs and temporary test directories are intentionally excluded.',
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
