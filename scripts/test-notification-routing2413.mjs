import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const migration = read('supabase/migrations/20261013000470_notification_routing_action_context.sql');
const action = read('src/features/notifications/notificationAction.ts');
const center = read('src/features/notifications/Notifications.tsx');
const routes = read('src/app/routes.ts');
const shell = read('src/app/AppShell.tsx');
const tasks = read('src/features/operations/TaskCenter.tsx');
const types = read('src/lib/supabase/database.types.ts');

let passed = 0;
async function ok(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }

await ok('2.41.3 release and validation command are registered', async () => {
  const [major,minor,patch]=pkg.version.split('.').map(Number);
  assert.ok(major>2 || (major===2 && (minor>41 || (minor===41 && patch>=3))));
  assert.equal(pkg.scripts['test:notification-routing-2413'], 'node scripts/test-notification-routing2413.mjs');
  assert.match(pkg.scripts.test, /test:notification-routing-2413/);
});

await ok('forward migration adds explicit event metadata without rewriting notification history', async () => {
  assert.match(migration, /alter table public\.notifications\s+add column event_type text/);
  assert.match(types, /event_type: string \| null/);
  assert.match(migration, /Compatibility only: current 2\.41\.3 producers pass explicit action\/source metadata/);
  assert.match(migration, /legacy_/);
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.indexOf('20261013000470_notification_routing_action_context.sql'),migrations.indexOf('20261013000461_daily_payable_timezone_consistency.sql')+1);
});

await ok('recruitment and assignment producers carry exact source/action context', async () => {
  for (const event of ['work_application_submitted','work_application_','work_assignment_offered','work_assignment_']) assert.match(migration, new RegExp(event));
  assert.match(migration, /'work_application',new_id::text/);
  assert.match(migration, /'work_application',a\.id::text/);
  assert.match(migration, /'work_assignment',new_id::text/);
  assert.match(migration, /'work_assignment',w\.id::text/);
  assert.match(migration, /'Open application'/);
  assert.match(migration, /project_existing public\.work_applications/);
  assert.match(migration, /An active application already exists for this project/);
  assert.match(migration, /'Open assignment'/);
});

await ok('attendance survey case and task notifications carry canonical context', async () => {
  assert.match(migration, /'attendance_'\|\|event_name/);
  assert.match(migration, /'attendance',s\.assignment_id::text/);
  assert.match(migration, /'survey_response_'\|\|p_status/);
  assert.match(migration, /'survey_response',r\.id::text/);
  assert.match(migration, /'beneficiary_case_assigned'/);
  assert.match(migration, /'beneficiary_case',c\.id::text/);
  assert.match(migration, /'operational_task_'\|\|case when/);
  assert.match(migration, /'operational_task',new\.id::text/);
  assert.match(migration, /'broadcast_published'/);
});

await ok('notification actions resolve to exact entity-aware canonical routes', async () => {
  for (const kind of ['work_application','work_assignment','attendance','survey_response','beneficiary_case','operational_task']) assert.match(action, new RegExp(kind));
  for (const entity of ['application','assignment','response','case','task']) assert.match(action, new RegExp(`"${entity}"`));
  assert.match(action, /projectTab: "responses"/);
  assert.match(action, /projectTab: "recruitment"/);
  assert.match(action, /projectTab: "cases"/);
});

await ok('source visibility is rechecked under current authorization before navigation', async () => {
  for (const table of ['work_applications','work_assignments','survey_responses','beneficiary_cases']) assert.match(action, new RegExp(`"${table}"`));
  assert.match(action, /my_delegated_case_detail/);
  assert.match(action, /from\("operational_tasks"\)/);
  assert.match(action, /throw result\.error/);
  assert.match(center, /notificationSourceVisible\(row\)/);
  assert.match(center, /no longer available, or your access has changed/);
  assert.match(shell, /my_workspace_access/);
  assert.match(shell, /This notification target is no longer available or your access has changed/);
});

await ok('legacy action_page remains a compatible fallback', async () => {
  assert.match(action, /const page = row\.action_page \|\| defaultPage/);
  assert.match(center, /row\.action_page \|\| row\.source_kind/);
  assert.match(migration, /if new\.action_page is null then/);
});

await ok('Task Center supports exact entity routes and focus', async () => {
  assert.match(routes, /"task" \| null/);
  for (const path of ['/app/tasks/','/staff/tasks/','/org/','/project/']) assert.match(routes, new RegExp(path.replaceAll('/','\\/')));
  assert.match(routes, /page === "Task Center" && entityKind === "task"/);
  assert.match(tasks, /initialTaskId/);
  assert.match(tasks, /id=\{`task-\$\{task\.id\}`\}/);
  assert.match(tasks, /route-focus/);
  assert.match(shell, /browserRoute\.entityKind === "task"/);
});

await ok('Notification Center marks read and hands a resolved target to AppShell', async () => {
  assert.match(center, /mark_notification_read/);
  assert.match(center, /await onOpenTarget\(target\)/);
  assert.match(shell, /openNotificationTarget\(target: RouteTarget\)/);
  assert.match(shell, /syncRoute\(\{\.\.\.target,scope:resolved\}\)/);
});

console.log(`\n${passed} FieldLance 2.41.3 notification routing scenarios passed.`);
