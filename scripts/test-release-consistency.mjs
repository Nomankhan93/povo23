import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const version = pkg.version;

const read = (path) => readFileSync(path, 'utf8');
const firstLine = (path) => read(path).split(/\r?\n/, 1)[0];

await ok('package and lockfile versions match', async () => {
  assert.equal(lock.version, version);
  assert.equal(lock.packages?.['']?.version, version);
});

await ok('current release headings follow package version', async () => {
  assert.equal(firstLine('README.md'), `# Current release: FieldLance ${version}`);
  assert.equal(firstLine('docs/ARCHITECTURE.md'), `# Current architecture note — FieldLance ${version}`);
  assert.equal(firstLine('docs/PERMISSIONS.md'), `# Current permissions note — FieldLance ${version}`);
  assert.equal(firstLine('docs/RELEASE-CHECKLIST.md'), `# Current release checklist — FieldLance ${version}`);
});

await ok('current release has phase upgrade and validation docs', async () => {
  for (const prefix of ['PHASE', 'UPGRADE', 'VALIDATION']) {
    assert.equal(existsSync(`docs/${prefix}-${version}.md`), true, `missing docs/${prefix}-${version}.md`);
  }
  assert.match(read('docs/VALIDATION.md'), new RegExp(`VALIDATION-${version.replaceAll('.', '\\.')}`));
});

await ok('analysis context identifies the current package release', async () => {
  assert.match(read('PROJECT_ANALYSIS_CONTEXT.txt'), new RegExp(`^Release: ${version.replaceAll('.', '\\.')}$`, 'm'));
});

await ok('runtime version remains package-driven', async () => {
  const runtimeVersion = read('src/app/version.ts');
  assert.match(runtimeVersion, /from\s+["']\.\.\/\.\.\/package\.json["']/);
  assert.match(runtimeVersion, /APP_VERSION\s*=\s*release\.version/);
});

await ok('core current docs do not advertise the obsolete stabilization release', async () => {
  for (const path of ['docs/ARCHITECTURE.md', 'docs/PERMISSIONS.md', 'docs/RELEASE-CHECKLIST.md', 'docs/VALIDATION.md']) {
    assert.doesNotMatch(read(path), /> Current stabilization release:/, path);
  }
});

await ok('2.13.3 consolidation adds no database migration', async () => {
  if (version === '2.13.3') {
    const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
    assert.equal(migrations.at(-1), '20261006000200_invitation_access_scope_fix.sql');
    assert.equal(migrations.length, 32);
  }
});

console.log(`\n${passed} release consistency scenarios passed for FieldLance ${version}.`);
