import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const migration = read('supabase/migrations/20261009000700_tasks_sla_escalation_center.sql');
const taskCenter = read('src/features/operations/TaskCenter.tsx');
const shell = read('src/app/AppShell.tsx');
const nav = read('src/app/navigation.ts');
const styles = read('src/styles/design-system.css');
const types = read('src/lib/supabase/database.types.ts');

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.23.0 Task Center regression contract is active', async () => {
  assert.equal(pkg.version, '2.23.0');
  assert.equal(pkg.scripts['test:task-center'], 'node scripts/test-task-center2230.mjs');
  assert.match(pkg.scripts.test, /test:task-center/);
});

await ok('forward migration adds task, SLA and immutable event tables', async () => {
  for (const table of ['operational_task_sla_policies','operational_tasks','operational_task_events']) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(types, new RegExp(`${table}: \\{`));
  }
  assert.match(migration, /create unique index operational_tasks_active_source/);
  assert.match(migration, /status in \('open','in_progress'\)/);
});

await ok('Task Center preserves source-of-truth boundaries', async () => {
  assert.match(migration, /Completing a task never mutates or approves the linked source workflow/);
  assert.match(taskCenter, /Source workflow remains authoritative/);
  assert.doesNotMatch(taskCenter, /review_work_application|review_survey_response|review_partner_ngo_application|settle_manual_e_wallet_withdrawal|complete_beneficiary_case_followup/);
});

await ok('RLS and RPC-only mutation protect operational task state', async () => {
  for (const table of ['operational_task_sla_policies','operational_tasks','operational_task_events']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke insert,update,delete on public\.operational_tasks from authenticated/);
  assert.match(migration, /create function app_private\.can_read_operational_task/);
  assert.match(migration, /create function app_private\.can_manage_operational_task/);
  for (const rpc of ['create_operational_task','update_operational_task','refresh_operational_task_escalations','operational_task_queue']) {
    assert.match(migration, new RegExp(`create function public\\.${rpc}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`));
  }
});

await ok('derived tasks cover the first authoritative operational queues', async () => {
  for (const source of ['partner_ngo_applications','volunteer_profiles','work_applications','work_assignments','survey_responses','beneficiary_case_followups','e_wallet_withdrawals']) {
    assert.match(migration, new RegExp(`on public\\.${source}`));
  }
  for (const taskType of ['organization_application_review','field_worker_profile_review','field_worker_application_review','assignment_offer_response','survey_response_review','beneficiary_case_followup','withdrawal_operations_review']) {
    assert.match(migration, new RegExp(taskType));
  }
});

await ok('SLA escalation uses persisted policy and three levels', async () => {
  assert.match(migration, /default_due_hours/);
  assert.match(migration, /escalation_level_2_hours/);
  assert.match(migration, /escalation_level_3_hours/);
  assert.match(migration, /then 3/);
  assert.match(migration, /then 2/);
  assert.match(migration, /then 1/);
});

await ok('Task Center exposes My, Team, Due Today, Overdue, Escalated and Completed views', async () => {
  for (const label of ['My Tasks','Team Tasks','Due Today','Overdue','Escalated','Completed']) assert.match(taskCenter, new RegExp(label));
  assert.match(taskCenter, /Open source/);
  assert.match(taskCenter, /Assign to me/);
  assert.match(taskCenter, /Complete task/);
});

await ok('Task Center is available in Field Worker, Organization, Staff and Project navigation', async () => {
  assert.match(shell, /\["Task Center", ClipboardList\]/);
  assert.ok((shell.match(/\["Task Center", ClipboardList\]/g) || []).length >= 4);
  assert.match(shell, /<TaskCenter/);
  assert.match(shell, /mode=\{projectScope \? "project" : organizationWorkspace \? "organization" : poem \? "staff" : "personal"\}/);
  assert.match(nav, /"Task Center": "Tasks"/);
  assert.match(nav, /"Task Center": "Tasks & SLA"/);
  assert.match(nav, /"Task Center": "Tasks & escalations"/);
});

await ok('workspace dashboards link into Task Center without replacing their existing home UX', async () => {
  assert.match(read('src/features/workforce/FieldWorkerDashboard.tsx'), /onNavigate\("Task Center"\)/);
  assert.match(read('src/features/organizations/OrganizationDashboard.tsx'), /onNavigate\("Task Center"\)/);
  assert.match(read('src/features/operations/FieldLanceStaffDashboard.tsx'), /\["Task Center", "Tasks & escalations"/);
});

await ok('Task Center has responsive dedicated FieldLance styling', async () => {
  for (const className of ['task-center','task-center-hero','task-center-metrics','task-center-tabs','task-center-card','task-center-meta-grid']) {
    assert.match(styles, new RegExp(`\\.${className}`));
  }
  assert.match(styles, /@media\(max-width:900px\).*task-center-metrics/s);
  assert.match(styles, /@media\(max-width:620px\).*task-center-hero/s);
  assert.match(styles, /@media\(max-width:420px\).*task-center-metrics/s);
});

await ok('2.23.0 adds exactly one forward migration after the 2.22 baseline', async () => {
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '20261009000700_tasks_sla_escalation_center.sql');
  assert.equal(migrations.length, 56);
});

console.log(`\n${passed} FieldLance Task Center regression scenarios passed for FieldLance ${pkg.version}.`);
