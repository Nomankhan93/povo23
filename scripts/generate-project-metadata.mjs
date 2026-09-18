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
    '===== CURRENT 2.16.0 PRODUCT BOUNDARIES =====',
    '- One personal POEM account can access multiple authorized workspaces.',
    '- Volunteer profiles self-publish after server validation; independent identity verification is separate.',
    '- Partner NGO onboarding is supported; approval creates the organization and first NGO Admin membership.',
    '- Open recruitment uses application-scoped profile snapshots; live NGO volunteer access is project/assignment/invitation scoped.',
    '- Historical permanent profile-share schema remains only for compatibility and is not a current UI workflow.',
    '- Survey capture includes encrypted device drafts/queue and reconnect synchronization; full cold-start offline/PWA caching remains outside the current baseline.',
    '- Payable accounting exists, but NGO account balances, project fund reservation and payment-provider money movement do not.',
    '- Project Manager and Area Focal Person workspaces include RLS-filtered operational metrics, area coverage, recent response queues and direct review navigation; broad NGO administration remains separate.',
    '- Active NGO Admins can create organization-owned survey-template drafts and use immutable approved NGO template versions.',
    '- Active NGO Admins can stage organization-owned project drafts; POEM approval materializes exactly one existing operational survey_projects row.',
    '- Project drafts can use POEM-owned templates or approved templates owned by the same NGO; cross-NGO private template reuse is rejected server-side.',
    '- POEM survey managers retain direct project creation and receive guarded template/project review queues with changes-request/reject/approve decisions.',
    '- Project approved-response targets are soft operational controls: target reach closes new recruitment/offers but does not reject existing/offline survey synchronization.',
    '- Project-level required-volunteer capacity is separate from the survey target and counts distinct committed volunteers across current formal/direct assignments.',
    '- NGO Admin and Project Manager can increase target/capacity or manually close/reopen recruitment; Area Focal remains scoped monitoring/review only.',
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
    '2.16.1 — Project Compensation Defaults & Assignment Contract Integration should snapshot paid/volunteer terms into existing assignments and feed the existing payable engine without creating a second accounting system.',
    'Keep 2.14 project staff / collection-geography authorization as the operational boundary for approved project workflows.',
    'Do not widen broad NGO directory, canonical, sharing or finance access for project-scoped staff.',
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
