import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('PASS ' + name); };
const shell = readFileSync('src/app/AppShell.tsx', 'utf8');
const refreshPolicy = readFileSync('src/app/workspaceRefresh.ts', 'utf8');

ok('foreground refresh is visibility-aware and deduplicates focus plus visibility bursts', () => {
  assert.match(refreshPolicy, /FOREGROUND_REFRESH_DEDUP_MS\s*=\s*1_500/);
  assert.match(refreshPolicy, /visibilityState === "visible"/);
  assert.match(refreshPolicy, /now - lastRunAt >= FOREGROUND_REFRESH_DEDUP_MS/);
  assert.match(shell, /shouldRunForegroundRefresh\(foregroundRefreshAt\.current, now, document\.visibilityState\)/);
});

ok('geography data is demand-driven instead of bootstrap-blocking', () => {
  for (const page of ['My profile', 'Project workspace', 'Survey projects', 'My Field Map', 'Organization Settings']) {
    assert.match(refreshPolicy, new RegExp(JSON.stringify(page).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const start = shell.indexOf('async function load(options:');
  const end = shell.indexOf('async function refreshForeground', start);
  assert.ok(start >= 0 && end > start);
  const load = shell.slice(start, end);
  assert.doesNotMatch(load, /\.from\("geographies"\)/);
  assert.match(load, /workspacePageNeedsGeographies\(pageRef\.current\)/);
});

ok('account directory and full audit history are loaded only when required', () => {
  assert.match(refreshPolicy, /accountDirectoryPages = new Set\(\["Memberships", "Accounts", "Activity"\]\)/);
  assert.match(refreshPolicy, /return page === "Activity"/);
  const start = shell.indexOf('async function load(options:');
  const end = shell.indexOf('async function refreshForeground', start);
  const load = shell.slice(start, end);
  assert.doesNotMatch(load, /\.from\("accounts"\)\.select\("\*"\)\.order\("full_name"\)/);
  assert.match(load, /\.from\("audit_events"\).*\.limit\(4\)/s);
});

ok('foreground browser events use narrow refresh instead of full workspace load', () => {
  const effectStart = shell.indexOf("window.addEventListener('focus', refresh)");
  assert.ok(effectStart >= 0);
  const effectWindow = shell.slice(Math.max(0, effectStart - 500), effectStart + 500);
  assert.match(effectWindow, /refreshForeground\(\)/);
  assert.doesNotMatch(effectWindow, /const refresh = \(\) => \{[^}]*load\(/s);
  const start = shell.indexOf('async function refreshForeground');
  const end = shell.indexOf('useEffect(() => {', start);
  const foreground = shell.slice(start, end);
  assert.doesNotMatch(foreground, /\.from\("geographies"\)/);
  assert.doesNotMatch(foreground, /\.from\("organizations"\)/);
  assert.doesNotMatch(foreground, /\.from\("organization_memberships"\)/);
});

ok('duplicate own-profile bootstrap query is removed', () => {
  const start = shell.indexOf('async function load(options:');
  const end = shell.indexOf('async function refreshForeground', start);
  const load = shell.slice(start, end);
  const matches = load.match(/\.from\("volunteer_profiles"\)/g) || [];
  assert.equal(matches.length, 1);
  assert.match(load, /\.maybeSingle\(\)/);
});

ok('notifications and profile-photo updates avoid accidental full reloads', () => {
  assert.match(shell, /refresh=\{refreshNotifications\}/);
  assert.match(shell, /onPhotoChanged=\{refreshOwnProfile\}/);
  assert.match(shell, /GeographyManager rows=\{geographies\} refresh=\{\(\) => load\(\{forceGeographies:true\}\)\}/);
});

ok('workspace access is still revalidated on foreground refresh', () => {
  const start = shell.indexOf('async function refreshForeground');
  const end = shell.indexOf('useEffect(() => {', start);
  const foreground = shell.slice(start, end);
  assert.match(foreground, /rpc\("my_workspace_access", \{\}\)/);
  assert.match(foreground, /\.from\("accounts"\).*\.eq\("id", session\.user\.id\)\.single\(\)/s);
  assert.match(foreground, /\.from\("project_staff_assignments"\).*\.eq\("status", "active"\)/s);
  assert.match(foreground, /applyAccess\(fresh/);
});

ok('2.41.13 targeted validation command is registered', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['test:workspace-refresh-24113'], 'node scripts/test-workspace-refresh24113.mjs');
});

console.log(`\n${passed} FieldLance 2.41.13 workspace bootstrap/refresh scenarios passed.`);
