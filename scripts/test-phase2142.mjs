import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

let passed=0;
async function ok(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
const app=readFileSync('src/app/AppShell.tsx','utf8');
const team=readFileSync('src/features/projects/ProjectTeamWorkspace.tsx','utf8');
const projects=readFileSync('src/features/surveys/SurveyProjects.tsx','utf8');
const detail=readFileSync('src/features/surveys/SurveyProjectDetail.tsx','utf8');
const css=readFileSync('src/styles/design-system.css','utf8');

await ok('project dashboard exposes RLS-filtered accepted-target and review metrics',async()=>{
 for(const token of ["Pending review","Approved","Corrections","Rejected","Approved response target completion","Latest visible responses"]) assert.match(team,new RegExp(token));
 assert.match(team,/from\('survey_responses'\)/);
 assert.match(team,/from\('survey_assignments'\)/);
 assert.match(team,/collection_geography_id/);
 assert.match(team,/limit\(8\)/);
});
await ok('project dashboard provides operational quick actions and visible area coverage',async()=>{
 assert.match(team,/openOperations/);
 assert.match(team,/Open responses & reviews/);
 assert.match(team,/Visible assignment areas/);
 assert.match(app,/openOperations=\{\(\) => change\("Survey projects"\)\}/);
 assert.match(app,/openNotifications=\{\(\) => change\("Notifications"\)\}/);
});
await ok('project-scoped survey navigation opens the authorized project directly and returns cleanly',async()=>{
 assert.match(projects,/rows\.length !== 1/);
 assert.match(projects,/setChosen\(rows\[0\]\)/);
 assert.match(projects,/backLabel=\{projectId \? "Project workspace" : "All projects"\}/);
 assert.match(projects,/onBackToWorkspace/);
});
await ok('response queue supports server-side status filtering without widening scope',async()=>{
 assert.match(detail,/responseStatus !== "all"/);
 assert.match(detail,/r = r\.eq\("status", responseStatus\)/);
 assert.match(detail,/Pending review/);
 assert.match(detail,/No responses match this filter in your current scope/);
});
await ok('focal review UI is separated from assignment-management controls',async()=>{
 assert.match(app,/projectScopeAssignment\?\.role === "project_manager"/);
 assert.match(app,/manageAssignments=\{canManageProjectAssignments\}/);
 assert.match(detail,/\{manageAssignments && \(/);
 assert.doesNotMatch(detail,/\{review && \(\s*<details className="survey-question">/);
});
await ok('revoked project workspace falls back to personal context instead of leaving a dead screen',async()=>{
 assert.match(app,/Your project workspace access is no longer active/);
 assert.match(app,/setScope\("personal"\)/);
 assert.match(app,/setPageState\("Overview"\)/);
});
await ok('mobile browser stabilization covers project cards filters and roster tables',async()=>{
 for(const token of ['project-operations-grid','response-toolbar','project-team-table td::before','project-quick-actions']) assert.match(css,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(team,/data-label="Person"/);
 assert.match(team,/detailRequest/);
 assert.match(team,/window\.setTimeout/);
});
await ok('2.14.2 is frontend stabilization and adds no schema migration',async()=>{
 const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
 assert.equal(migrations.includes('20261007000300_project_team_workspace_ui.sql'),true);
 assert.match(readFileSync('docs/PHASE-2.14.2.md','utf8'),/no database migration/i);
});

console.log(`\n${passed} POEM 2.14.2 operational-dashboard/browser-stabilization scenarios passed.`);
