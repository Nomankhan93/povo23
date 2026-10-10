import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

let passed=0;
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}
const read=path=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261013000580_project_lifecycle_e2e_integrity.sql');
const autoMarketplace=read('supabase/migrations/20261013000420_automatic_project_marketplace_publishing.sql');
const recruitment=read('supabase/migrations/20261013000470_notification_routing_action_context.sql');
const consent=read('supabase/migrations/20261013000490_recruitment_collection_consent.sql');
const dateGuard=read('supabase/migrations/20261013000530_collection_project_date_guard.sql');
const attendance=read('supabase/migrations/20261013000400_assignment_attendance_timesheets_location.sql');
const payables=read('supabase/migrations/20260929000100_workforce_payables.sql');
const governance=read('supabase/migrations/20261007000100_project_team_area_governance.sql');
const workforce=read('src/features/workforce/WorkforceMarketplace.tsx');
const projectWorkspace=read('src/features/projects/ProjectWorkspace.tsx');

await ok('published project remains the canonical automatic marketplace source',async()=>{
  assert.match(autoMarketplace,/ensure_project_marketplace_opportunity/);
  assert.match(autoMarketplace,/marketplace_origin='project_auto'/);
  assert.match(autoMarketplace,/sync_project_marketplace_state/);
});

await ok('application review and formal offers use project-management authority',async()=>{
  assert.match(recruitment,/review_work_application[\s\S]*app_private\.can_review_survey\(a\.survey_project_id\)/);
  assert.match(recruitment,/create_work_assignment[\s\S]*app_private\.can_review_survey\(p_project\)/);
});

await ok('worker acceptance atomically activates the collection assignment',async()=>{
  assert.match(recruitment,/respond_work_assignment[\s\S]*status='active'[\s\S]*insert into public\.survey_assignments\(project_id,user_id,active\)/);
  assert.match(workforce,/Accepting activates the assignment under the existing rules/);
  assert.match(workforce,/Survey access is active only while the assignment and project are eligible/);
});

await ok('collection requires accepted contract, active survey assignment and current project dates',async()=>{
  assert.match(consent,/has_accepted_collection_assignment/);
  assert.match(consent,/from public\.survey_assignments a/);
  assert.match(dateGuard,/between p\.start_date and p\.end_date/);
  assert.match(dateGuard,/between w\.start_date and w\.end_date/);
});

await ok('attendance starts only from an active accepted assignment',async()=>{
  assert.match(attendance,/start_assignment_work_session/);
  assert.match(attendance,/Active accepted assignment required/);
  assert.match(attendance,/w\.status<>'active' or w\.responded_at is null/);
});

await ok('survey review prevents self-review and produces independent approval state',async()=>{
  assert.match(governance,/review_survey_response/);
  assert.match(governance,/Cannot review your own survey/);
  assert.match(governance,/Only current submitted responses can be reviewed/);
});

await ok('approved survey responses feed the existing per-survey payable engine',async()=>{
  assert.match(payables,/survey_payable_changed after insert or update of status,reviewed_by/);
  assert.match(payables,/r\.status<>'approved'/);
  assert.match(payables,/r\.reviewed_by=r\.collector_id/);
  assert.match(payables,/compensation_type='per_verified_survey'/);
});

await ok('approved attendance feeds the existing daily-rate payable engine',async()=>{
  assert.match(attendance,/if p_action='approve' and w\.work_mode='paid' and w\.compensation_type='daily_rate'/);
  assert.match(attendance,/ensure_attendance_daily_payable/);
});

await ok('Project Manager assignment finalization now matches recruitment authority',async()=>{
  const matches=migration.match(/app_private\.can_manage_project\(w\.survey_project_id\)/g)||[];
  assert.equal(matches.length,2);
  assert.doesNotMatch(migration,/app_private\.ngo_admin\(w\.organization_id\)/);
  assert.match(projectWorkspace,/tab === \"recruitment\" && canManageRecruitment/);
  assert.match(projectWorkspace,/mode=\"project\"/);
  assert.match(workforce,/complete_work_assignment/);
  assert.match(workforce,/cancel_work_assignment/);
});

await ok('completion and cancellation revoke forward collection while retaining immutable history',async()=>{
  const deactivations=migration.match(/update public\.survey_assignments[\s\S]{0,160}set active=false/g)||[];
  assert.equal(deactivations.length,2);
  assert.match(migration,/work_assignment_completed/);
  assert.match(migration,/work_assignment_cancelled/);
});

await ok('assignment outcome notifications carry exact action context',async()=>{
  assert.match(migration,/'work_assignment_completed','assignment','normal','My Assigned Surveys','Open assignment'/);
  assert.match(migration,/'work_assignment_cancelled','assignment','high','My Assigned Surveys','Open assignment'/);
  assert.match(migration,/'work_assignment',w\.id::text/);
});

await ok('2.41.15 is one forward migration after the prior security head',async()=>{
  const migrations=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
  assert.equal(migrations.at(-2),'20261013000570_security_advisor_rpc_surface_hardening.sql');
  assert.equal(migrations.at(-1),'20261013000580_project_lifecycle_e2e_integrity.sql');
});

console.log(`\n${passed} FieldLance 2.41.15 project lifecycle integrity scenarios passed.`);
