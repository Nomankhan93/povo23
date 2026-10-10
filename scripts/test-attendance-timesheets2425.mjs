import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const ui = read('src/features/workforce/AttendanceWorkspace.tsx');
const css = read('src/features/workforce/AttendanceWorkspace.module.css');
const globalCss = read('src/styles/design-system.css');
const routes = read('src/app/routes.ts');
const appShell = read('src/app/AppShell.tsx');
const projectWorkspace = read('src/features/projects/ProjectWorkspace.tsx');
const offlineWorkspace = read('src/features/surveys/OfflineFieldWorkspace.tsx');
const pkg = JSON.parse(read('package.json'));

const protectedHashes = {
  'src/features/workforce/attendanceOfflineStore.ts': 'a1b42fd7c7b27700203681174cecc87220fa92730cec1c0cc98df74f69e74e8a',
  'src/features/workforce/attendanceDownload.ts': '05f868a2dd9814a3022f174fae0c27bfed0ee072f4dbe85d8f172da4db35e12e',
  'src/lib/supabase/client.ts': '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc',
  'src/lib/supabase/database.types.ts': 'e29703de0d84d0335ca185a20e155ff1d96d2558ac7e7a8e413b9c36c29a3761',
  'src/app/routes.ts': 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879',
  'src/app/capabilityContract.ts': '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62',
  'src/features/projects/workspacePermissions.ts': 'ab5ec24668bb14a01561610f16a008e1a819ff02fd1879ba268e49f207d99fd7',
  'src/features/projects/projectNavigation.ts': '4108763147b73ad7ddd969711d6b270270941cabfffca7c83c9da512b51104b7',
  'src/features/payables/PayablesWorkspace.tsx': '17d945934cf9c30e69cc8616a80e49c388be061589c424427d34cd16bc15f16d',
  'src/features/workforce/WorkAvailabilitySchedule.tsx': '1f54c9458fef27c46d7df7245fae9e82c986da9227aa27ae4d86d820e52675be',
  'src/features/workforce/recruitmentQueries.ts': '8592b68b8cb7a1937bb3864475434888583b73ef7bb9a8df1d2d8a82aefb0aea',
  'src/features/workforce/recruitmentState.ts': 'd684d63a14ed3dac5c376106d303b0b00833b931debd909a113c45e46db677ac',
  'src/features/workforce/WorkforceMarketplace.tsx': '9790c58b813fa587253c81bcb7b2f7c89cd2358bcd5b8e597c5f09899f1dd30e',
};

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.42.5 release and dedicated attendance test are registered', async () => {
  assert.equal(pkg.version, '2.42.5');
  assert.equal(pkg.scripts['test:attendance-timesheets-2425'], 'node --experimental-strip-types scripts/test-attendance-timesheets2425.mjs');
});

await ok('database migration inventory and head remain unchanged', async () => {
  const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
});

await ok('protected attendance, authorization, payables and recruitment files remain byte-identical', async () => {
  for (const [path, expected] of Object.entries(protectedHashes)) assert.equal(sha(path), expected, `${path} changed unexpectedly`);
});

await ok('AttendanceWorkspace preserves its existing personal, project and offline call sites', async () => {
  assert.match(appShell, /view=\{page === "My Timesheets" \? "timesheets" : "attendance"\}/);
  assert.match(appShell, /initialSessionId=\{browserRoute\.entityKind === "attendance_session"/);
  assert.match(projectWorkspace, /<AttendanceWorkspace userId=\{userId\} projectId=\{projectId\} canManage=\{canManageProject\} view="attendance"/);
  assert.match(offlineWorkspace, /<AttendanceWorkspace key=\{attendanceRevision\} userId=\{ownerId\}/);
});

await ok('exact attendance-session and assignment attendance deep links remain canonical', async () => {
  assert.match(routes, /\/app\/field\/attendance\/\$\{encodeURIComponent\(entityId\)\}/);
  assert.match(routes, /\/app\/work\/assignments\/\$\{encodeURIComponent\(entityId\)\}\/attendance/);
  assert.match(routes, /\/app\/field\/timesheets/);
  assert.match(ui, /rpc\("attendance_session_detail",\{p_session:initialSessionId\}\)/);
  assert.match(ui, /Linked workday · exact record/);
});

await ok('worker attendance remains explicit and never introduces background location tracking', async () => {
  assert.match(ui, /navigator\.geolocation\.getCurrentPosition/);
  assert.doesNotMatch(ui, /watchPosition|BackgroundGeolocation|continuous location/i);
  assert.match(ui, /Start field work/);
  assert.match(ui, /End & submit workday/);
  assert.match(ui, /does not continuously or silently track your location/i);
  assert.match(ui, /Location evidence is captured only at explicit check-in and checkout actions/i);
});

await ok('existing attendance RPC and review state contracts remain represented', async () => {
  for (const rpcName of ['attendance_workspace','project_attendance_policy','set_project_attendance_policy','start_assignment_work_session','checkout_assignment_work_session','resubmit_attendance_session','review_attendance_session','adjust_attendance_times']) assert.match(ui, new RegExp(rpcName));
  for (const state of ['required','preferred','not_required','open','submitted','approved','correction_required','rejected']) assert.match(ui, new RegExp(`\\b${state}\\b`));
  assert.match(ui, /policy\?\.can_manage/);
});

await ok('offline download and encrypted queue behavior stays visible without changing protected stores', async () => {
  assert.match(ui, /readAttendanceDownload/);
  assert.match(ui, /downloadAttendance/);
  assert.match(ui, /attendanceFreshness/);
  assert.match(ui, /pendingAttendance/);
  assert.match(ui, /syncAttendanceQueue/);
  assert.match(ui, /saved encrypted on this device/i);
  assert.match(ui, /Download \/ refresh attendance/);
  assert.match(ui, /up to 24 hours/i);
});

await ok('My Attendance prioritizes assignment, current state, field readiness and one primary action', async () => {
  assert.match(ui, /FIELD READINESS/);
  assert.match(ui, /Current workday/);
  assert.match(ui, /Ready to start/);
  assert.match(ui, /Checked in/);
  assert.match(ui, /Check-in pending sync/);
  assert.match(ui, /Queued to submit/);
  assert.match(ui, /className=\{styles\.primaryAction\}/);
});

await ok('My Timesheets exposes status summary, filters and historical workday records', async () => {
  assert.match(ui, /MY TIMESHEETS/);
  assert.match(ui, /My Timesheets/);
  for (const label of ['Submitted','Approved','Needs correction','Rejected']) assert.match(ui, new RegExp(`label="${label}"`));
  assert.match(ui, /<Select label="Status"/);
  for (const label of ['Check in','Check out','Duration','Payable']) assert.match(ui, new RegExp(label));
});

await ok('worker correction and resubmission remain reachable on desktop with reviewer context', async () => {
  const desktopStart = ui.indexOf('<div className={styles.desktopRecords}>');
  const mobileStart = ui.indexOf('<div className={styles.mobileRecords}>');
  const workerDrawerStart = ui.indexOf('<Drawer open={Boolean(!projectView&&correctionSession)}');
  const managerDrawerStart = ui.indexOf('<Drawer open={Boolean(manageAttendance&&selected)}');
  assert.ok(desktopStart >= 0 && mobileStart > desktopStart, 'desktop/mobile record boundaries missing');
  assert.ok(workerDrawerStart > mobileStart && managerDrawerStart > workerDrawerStart, 'worker correction drawer must be outside mobile-only records');
  const desktopBlock = ui.slice(desktopStart, mobileStart);
  const workerDrawerBlock = ui.slice(workerDrawerStart, managerDrawerStart);
  assert.match(desktopBlock, /row\.status==="correction_required"[\s\S]*openCorrection\(row\)[\s\S]*Review correction/);
  assert.match(workerDrawerBlock, /Reviewer feedback/);
  assert.match(workerDrawerBlock, /correctionSession\.review_note/);
  assert.match(workerDrawerBlock, /Updated workday note/);
  assert.match(workerDrawerBlock, /resubmit\(correctionSession\)/);
  assert.match(workerDrawerBlock, /Resubmit correction/);
  assert.match(ui, /resubmit_attendance_session/);
});

await ok('My Attendance isolates current workday state from stale Timesheets filters and pagination', async () => {
  assert.match(ui, /const attendanceMode=!projectId&&view==="attendance"/);
  assert.match(ui, /p_status:attendanceMode\?null:status\|\|null/);
  assert.match(ui, /p_page:attendanceMode\?0:page/);
  assert.match(ui, /\[projectId,userId,view,page,status,revision,online\]/);
  assert.match(ui, /if\(projectId\|\|view!=="attendance"\)return;[\s\S]*setStatus\(""\);[\s\S]*setPage\(0\);/);
  assert.match(ui, /const openSession=workspace\?\.rows\.find\(r=>r\.status==="open"/);
  assert.match(ui, /workspace&&\(projectView\|\|view==="timesheets"\)&&<div className=\{styles\.pagination\}>/);
});

await ok('Current Workday display uses the attendance policy timezone', async () => {
  assert.match(ui, /function dateInTimezone\(d:Date,timezone:string\)/);
  assert.match(ui, /new Intl\.DateTimeFormat\("en-US",\{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"\}\)\.formatToParts\(d\)/);
  assert.match(ui, /<dt>Work date<\/dt><dd>\{dateInTimezone\(new Date\(\),policy\.timezone\)\}<\/dd>/);
  const currentWorkStart = ui.indexOf('<SectionHeader eyebrow="ACTIVE ASSIGNMENT"');
  const historyStart = ui.indexOf('<section className={styles.historySection}>');
  assert.ok(currentWorkStart >= 0 && historyStart > currentWorkStart, 'Current Workday block missing');
  assert.doesNotMatch(ui.slice(currentWorkStart, historyStart), /<dt>Work date<\/dt><dd>\{today\(\)\}<\/dd>/);
});

await ok('manager review uses a focus-managed shared Drawer and preserves all review actions', async () => {
  assert.match(ui, /<Drawer open=\{Boolean\(manageAttendance&&selected\)\}/);
  assert.match(ui, /Review decision/);
  assert.match(ui, /Approve/);
  assert.match(ui, /Request correction/);
  assert.match(ui, /Reject/);
  assert.match(ui, /Record adjustment/);
  assert.match(ui, /Raw check-in/);
  assert.match(ui, /Raw checkout/);
  assert.match(ui, /Effective check-in/);
  assert.match(ui, /Effective checkout/);
  assert.match(ui, /Raw captured evidence is never overwritten/);
});

await ok('location and attendance states are communicated textually, not by color alone', async () => {
  assert.match(ui, /StatusBadge/);
  assert.match(ui, /locationEvidence/);
  assert.match(ui, /Check-in:/);
  assert.match(ui, /Checkout:/);
  assert.match(ui, /Attendance action needs attention/);
  assert.match(ui, /Workday waiting to sync/);
});

await ok('Attendance presentation uses the 2.42 CSS Module and shared UI primitives', async () => {
  assert.match(ui, /AttendanceWorkspace\.module\.css/);
  for (const primitive of ['Alert','Button','Card','DataTable','Drawer','Field','FilterBar','MetricCard','SectionHeader','Select','StatusBadge','SyncStatus','Textarea']) assert.match(ui, new RegExp(`\\b${primitive}\\b`));
});

await ok('new Attendance CSS follows token, typography and breakpoint rules', async () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /font-size\s*:\s*(?:[0-9]|1[01])px\b/);
  const breakpoints = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map(match => Number(match[1]));
  assert.deepEqual(breakpoints, [1023, 639]);
  assert.match(css, /var\(--fl-/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

await ok('legacy Attendance feature selectors are retired from global design-system CSS', async () => {
  for (const legacy of ['attendance-workspace','attendance-hero','attendance-policy','attendance-checkin-panel','attendance-ledger','attendance-review-panel','attendance-section-heading','attendance-assignment-card','attendance-main-action','attendance-live','attendance-filters','attendance-metrics','attendance-list','attendance-row','attendance-time-grid','attendance-location-summary','attendance-note','attendance-correction','attendance-adjust-form','attendance-download-notice']) assert.doesNotMatch(globalCss, new RegExp(`\\.${legacy}\\b`), legacy);
});

await ok('new CSS Module has no orphaned local class references', async () => {
  const classes = new Set([...css.matchAll(/(?<![\w-])\.([A-Za-z_][\w-]*)/g)].map(match => match[1]).filter(name => !name.startsWith('fl-')));
  const uses = new Set([...ui.matchAll(/styles\.([A-Za-z_][\w]*)/g)].map(match => match[1]));
  const localClasses = [...classes].filter(name => !['fl-filter-controls','fl-field'].includes(name));
  assert.deepEqual(localClasses.filter(name => !uses.has(name)), []);
  assert.deepEqual([...uses].filter(name => !classes.has(name)), []);
});

console.log(`\n${passed} FieldLance 2.42.5 Attendance + Timesheets UX scenarios passed.`);
