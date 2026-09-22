import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };
const read = (path) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261013000200_partner_self_publish_platform_moderation.sql');
const projects = read('src/features/surveys/SurveyProjects.tsx');
const projectDrafts = read('src/features/surveys/SurveyProjectDrafts.tsx');
const templates = read('src/features/surveys/SurveyTemplates.tsx');
const detail = read('src/features/surveys/SurveyProjectDetail.tsx');

await ok('2.36.1 adds post-publication moderation state and an immutable moderation event ledger', async () => {
  assert.match(migration, /alter table public\.survey_templates[\s\S]*moderation_status/);
  assert.match(migration, /alter table public\.survey_projects[\s\S]*moderation_status/);
  assert.match(migration, /create table public\.content_moderation_events/);
  assert.match(migration, /check\(action in \('blocked','removed','restored'\)\)/);
});

await ok('Organization template and project drafts self-publish without a FieldLance approval queue', async () => {
  assert.match(migration, /publish_organization_template_draft/);
  assert.match(migration, /publish_organization_project_draft/);
  assert.match(projectDrafts, /publish_organization_project_draft/);
  assert.match(projectDrafts, /Publish project/);
  assert.match(templates, /publish_organization_template_draft/);
  assert.match(templates, /Published immediately as an immutable Organization template/);
  assert.doesNotMatch(projectDrafts, /Approve & activate|Submit to FieldLance|NGO project review queue/);
  assert.doesNotMatch(templates, /Approve & publish|NGO review queue/);
});

await ok('legacy submit calls self-publish and legacy review calls fail closed instead of recreating pre-approval', async () => {
  assert.match(migration, /create or replace function public\.submit_template_draft[\s\S]*publish_organization_template_draft/);
  assert.match(migration, /create or replace function public\.submit_project_draft[\s\S]*publish_organization_project_draft/);
  assert.match(migration, /Template pre-approval is retired/);
  assert.match(migration, /Project pre-approval is retired/);
});

await ok('FieldLance staff receive audited block remove and restore controls for published projects and templates', async () => {
  assert.match(migration, /create function public\.moderate_survey_project/);
  assert.match(migration, /create function public\.moderate_survey_template/);
  assert.match(migration, /app_private\.can_manage_surveys\(\)/);
  assert.match(projects, /moderate_survey_project/);
  assert.match(projects, /Remove from operation/);
  assert.match(templates, /moderate_survey_template/);
  assert.match(templates, /Remove from operation/);
});

await ok('moderation pauses forward operations while preserving historical project records', async () => {
  assert.match(migration, /terminate_project_operations/);
  assert.match(migration, /set recruitment_status='closed'/);
  assert.match(migration, /set active=false/);
  assert.match(migration, /status='cancelled'/);
  assert.match(detail, /Historical records remain available, but new recruitment, assignments and field collection are paused/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(survey_projects|survey_templates)/i);
});

await ok('moderation is enforced below the UI for collection recruitment opportunities and assignments', async () => {
  assert.match(migration, /project_effectively_allowed/);
  assert.match(migration, /guard_moderated_survey_assignment/);
  assert.match(migration, /guard_moderated_project_recruitment/);
  assert.match(migration, /guard_moderated_work_opportunity/);
  assert.match(migration, /guard_moderated_work_assignment/);
  assert.match(migration, /guard_moderated_response_collection/);
});

await ok('template moderation cascades to dependent projects and restore does not silently reopen recruitment', async () => {
  assert.match(migration, /moderation_origin='template'/);
  assert.match(migration, /moderation_template_id=t\.id/);
  assert.match(migration, /where moderation_origin='template' and moderation_template_id=t\.id/);
  assert.match(migration, /Recruitment and cancelled assignments are not recreated automatically/);
});

await ok('2.36.1 adds exactly one forward migration after the 2.31 analytics migration', async () => {
  const migrations = readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '20261013000200_partner_self_publish_platform_moderation.sql');
  assert.equal(migrations.at(-2), '20261013000100_operational_analytics_reporting.sql');
});

console.log(`\n${passed} FieldLance 2.36.1 Partner Self-Publishing & Platform Moderation scenarios passed.`);
