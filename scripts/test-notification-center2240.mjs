import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const migration = read('supabase/migrations/20261009000800_notifications_communication_center.sql');
const center = read('src/features/notifications/Notifications.tsx');
const shell = read('src/app/AppShell.tsx');
const nav = read('src/app/navigation.ts');
const styles = read('src/styles/design-system.css');
const types = read('src/lib/supabase/database.types.ts');

let passed = 0;
async function ok(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }

await ok('2.24.0 Notifications & Communication regression contract remains available', async () => {
  const [major,minor,patch]=pkg.version.split('-')[0].split('.').map(Number);
  assert.ok(major>2||(major===2&&minor>24)||(major===2&&minor===24&&patch>=0),`Expected FieldLance >= 2.24.0, received ${pkg.version}`);
  assert.equal(pkg.scripts['test:notification-center'], 'node scripts/test-notification-center2240.mjs');
  assert.match(pkg.scripts.test, /test:notification-center/);
});

await ok('forward migration extends recipient notifications without replacing the inbox', async () => {
  assert.match(migration, /alter table public\.notifications/);
  for (const column of ['category','priority','action_page','action_label','organization_id','project_id','source_kind','source_ref','broadcast_id','archived_at']) assert.match(migration, new RegExp(`add column ${column}`));
  assert.match(types, /notification_broadcasts: \{/);
  assert.match(types, /notification_preferences: \{/);
  assert.match(types, /archived_at: string \| null/);
});

await ok('notification preferences preserve in-app transactional updates and defer providers', async () => {
  assert.match(migration, /create table public\.notification_preferences/);
  for (const field of ['email_enabled','push_enabled','broadcasts_enabled','recruitment_enabled','assignments_enabled','tasks_enabled','surveys_enabled','finance_enabled','organization_enabled','cases_enabled']) assert.match(migration, new RegExp(field));
  assert.match(center, /In-app transactional updates stay available/);
  assert.match(center, /does not send external email, push, SMS or WhatsApp messages/);
  assert.doesNotMatch(migration, /https?:\/\//i);
});

await ok('actionable inbox supports paging, filters, read-all and archive lifecycle', async () => {
  for (const rpc of ['notification_center','mark_all_notifications_read','archive_notification','save_notification_preferences']) {
    assert.match(migration, new RegExp(`create function public\\.${rpc}`));
    assert.match(types, new RegExp(`${rpc}: \\{`));
  }
  for (const label of ['All','Unread','Tasks','Recruitment','Finance','Broadcasts','Archived','Mark all read','Load more']) assert.match(center, new RegExp(label));
  assert.match(center, /onNavigate\(row\.action_page\)/);
});

await ok('existing event inserts receive category and deep-link metadata without rewriting historical migrations', async () => {
  assert.match(migration, /create function app_private\.notification_default_metadata/);
  assert.match(migration, /create trigger notification_default_metadata before insert on public\.notifications/);
  for (const page of ['Workforce marketplace','My Applications','My Assigned Surveys','Invitations','Workforce payables','E-Wallets & withdrawals','NGO applications','Partner NGO application','Verification','Beneficiary cases','Survey projects']) assert.match(migration, new RegExp(page.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

await ok('task assignments and escalation events become actionable notifications', async () => {
  assert.match(migration, /create function app_private\.notify_task_event/);
  assert.match(migration, /create trigger operational_task_notification/);
  assert.match(migration, /new\.escalation_level>old\.escalation_level/);
  assert.match(migration, /'Task Center','Open task'/);
  assert.match(migration, /organization_recruitment/);
  assert.match(migration, /finance_operations/);
});

await ok('broadcasts are scoped, audited and preference-aware', async () => {
  assert.match(migration, /create table public\.notification_broadcasts/);
  assert.match(migration, /create function public\.publish_notification_broadcast/);
  for (const audience of ['all_active','field_workers','organization_admins','fieldlance_staff','organization_members','project_team']) assert.match(migration, new RegExp(audience));
  assert.match(migration, /broadcasts_enabled/);
  assert.match(migration, /notification_broadcast_published/);
  assert.match(migration, /FieldLance admin broadcast access required/);
  assert.match(migration, /Organization broadcast access required/);
  assert.match(migration, /Project broadcast access required/);
});

await ok('Communication Center adapts broadcast audiences by workspace authority', async () => {
  assert.match(shell, /mode=\{projectScope \? "project" : organizationWorkspace \? "organization" : poem \? "staff" : "personal"\}/);
  assert.match(shell, /canBroadcast=\{Boolean\(/);
  assert.match(center, /All active Field Workers/);
  assert.match(center, /Organization members/);
  assert.match(center, /Project team/);
  assert.match(nav, /Notifications: "Updates"/);
  assert.match(nav, /Notifications: "Updates & communication"/);
  assert.match(nav, /Notifications: "Communication center"/);
});

await ok('Communication Center uses dedicated responsive FieldLance styling', async () => {
  for (const className of ['notification-center','notification-center-hero','notification-center-metrics','notification-center-tabs','notification-card','notification-preferences','notification-broadcast']) assert.match(styles, new RegExp(`\\.${className}`));
  assert.match(styles, /@media\(max-width:900px\).*notification-center-hero/s);
  assert.match(styles, /@media\(max-width:620px\).*notification-card/s);
  assert.match(styles, /@media\(max-width:420px\).*notification-card-actions/s);
});

await ok('2.24.0 adds exactly one forward migration after Task Center', async () => {
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '20261009000800_notifications_communication_center.sql');
  assert.equal(migrations.length, 57);
});

console.log(`\n${passed} FieldLance Notifications & Communication Center scenarios passed for FieldLance ${pkg.version}.`);
