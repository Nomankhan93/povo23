import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {workspaceTeamPermission} from '../src/features/projects/workspacePermissions.ts';
let passed=0;
async function ok(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
const app=readFileSync('src/app/AppShell.tsx','utf8');
const team=readFileSync('src/features/projects/ProjectTeamWorkspace.tsx','utf8');
const projects=readFileSync('src/features/surveys/SurveyProjects.tsx','utf8');
const migration=readFileSync('supabase/migrations/20261007000300_project_team_workspace_ui.sql','utf8');
const revocation=readFileSync('supabase/migrations/20261007000200_project_access_revocation_fix.sql','utf8');

await ok('workspace selector exposes project-scoped contexts without promoting NGO Admin access',async()=>{
 assert.match(app,/my_workspace_access/);
 assert.match(app,/Project workspace/);
 assert.match(app,/access.workspaces.map/);
 assert.match(app,/scope\.startsWith\("project:"\)/);
});
await ok('NGO workspace exposes project-team management while project workspace stays scoped',async()=>{
 assert.match(app,/page === "Project team"/);
 assert.match(app,/canManageTeam=\{true\}/);
 assert.match(app,/page === "Project workspace"/);
 assert.match(app,/canManageTeam=\{canManageWorkspaceTeam\}/);
 assert.match(app,/workspaceTeamPermission\(surveyManage, ownsWorkspaceProject\)/);
 assert.equal(workspaceTeamPermission(false,false),false,'Project staff alone cannot manage team');
 assert.equal(workspaceTeamPermission(true,false),true,'Authorized staff can manage team');
 assert.equal(workspaceTeamPermission(false,true),true,'Owning organization admin can manage team');
 assert.equal(workspaceTeamPermission(true,true),true);
 assert.match(app,/projectId=\{workspaceProjectId\}/);
});
await ok('project team UI uses guarded RPCs for assignment candidate lookup and revocation',async()=>{
 for(const token of ["project_staff_candidates","assign_project_staff","revoke_project_staff","project_staff_roster"]) assert.match(team,new RegExp(token));
 assert.doesNotMatch(team,/from\(['"]accounts['"]\)/);
 assert.match(team,/Area Focal Person/);
 assert.match(team,/Project Manager/);
});
await ok('project staff candidate lookup is server-authorized and bounded',async()=>{
 assert.match(migration,/can_manage_project_team\(p_project\)/);
 assert.match(migration,/organization_memberships/);
 assert.match(migration,/limit 50/i);
 assert.match(migration,/not exists\([\s\S]*project_staff_assignments/);
});
await ok('project-specific survey view is restricted by project id and RLS',async()=>{
 assert.match(projects,/projectId\?: string \| null/);
 assert.match(projects,/q = q\.eq\("id", projectId\)/);
 assert.match(app,/review=\{surveyManage \|\| projectScope/);
});
await ok('2.14 revocation guard remains in response assignment and capture reads',async()=>{
 const hits=(revocation.match(/app_private\.can_read_project\(/g)||[]).length;
 assert.ok(hits>=4,`expected revocation guards, found ${hits}`);
});

console.log(`\n${passed} POEM 2.14.1 project-team workspace scenarios passed.`);
