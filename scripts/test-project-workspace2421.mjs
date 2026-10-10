import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { getAuthorizedNavigationPages, getCapabilityContract } from '../src/app/capabilityContract.ts';

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
const read = (path) => readFileSync(path, 'utf8');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const projectTabs = ['reports','overview','team','recruitment','field-work','map','responses','cases','finance','governance','documents','activity'];

await ok('2.42.1 is presentation-only and adds no database migration', async () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(['2.42.1', '2.42.2', '2.42.3', '2.42.4','2.42.5','2.42.6','2.42.7','2.42.8'].includes(pkg.version));
  const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
  assert.equal(sha256('supabase/migrations/20261013000580_project_lifecycle_e2e_integrity.sql'), '7c46de397a816df58450c22f51a5259608331de8e2fdd9b58e85a19c3b3b24c5');
});

await ok('route and capability implementations are unchanged from 2.42.0', async () => {
  assert.equal(sha256('src/app/routes.ts'), 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879');
  assert.equal(sha256('src/app/capabilityContract.ts'), '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62');
  assert.equal(sha256('src/app/navigation.ts'), '675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132');
});

await ok('every existing Project Workspace tab ID and route tab set is preserved', async () => {
  const workspace = read('src/features/projects/ProjectWorkspace.tsx');
  const routeSource = read('src/app/routes.ts');
  const typeLine = workspace.match(/export type ProjectWorkspaceTab = ([^;]+);/)?.[1] || '';
  for (const id of projectTabs) assert.match(typeLine, new RegExp(`"${id}"`), id);
  const routeSet = routeSource.match(/const projectTabs = new Set\(\[([^\]]+)\]\)/)?.[1] || '';
  for (const id of projectTabs) assert.match(routeSet, new RegExp(`"${id}"`), `route ${id}`);
  assert.equal((typeLine.match(/"[^"]+"/g) || []).length, projectTabs.length);
});

await ok('Project Manager and Area Focal Person capability boundaries are unchanged', async () => {
  const manager = getCapabilityContract({platformRole:null,staffWorkspace:false,organizationWorkspace:false,projectWorkspace:true,projectRole:'project_manager',ownsWorkspaceProject:false});
  const focal = getCapabilityContract({platformRole:null,staffWorkspace:false,organizationWorkspace:false,projectWorkspace:true,projectRole:'area_focal_person',ownsWorkspaceProject:false});
  assert.equal(manager.projectManager, true);
  assert.equal(manager.areaFocalPerson, false);
  assert.equal(manager.manageWorkspaceProject, true);
  assert.equal(manager.manageWorkspaceTeam, false);
  assert.equal(manager.manageWorkspaceFinance, false);
  assert.equal(focal.projectManager, false);
  assert.equal(focal.areaFocalPerson, true);
  assert.equal(focal.manageWorkspaceProject, false);
  assert.equal(focal.manageCases, false);
  const managerPages = getAuthorizedNavigationPages({kind:'project',capabilities:manager,projectRole:'project_manager'});
  const focalPages = getAuthorizedNavigationPages({kind:'project',capabilities:focal,projectRole:'area_focal_person'});
  assert.ok(managerPages.includes('Recruitment'));
  assert.ok(managerPages.includes('Assistance ledger'));
  assert.equal(focalPages.includes('Recruitment'), false);
  assert.equal(focalPages.includes('Assistance ledger'), false);
  assert.ok(focalPages.includes('Beneficiary cases'));
});

await ok('Project Workspace capability filtering remains the existing presentation gate', async () => {
  const source = read('src/features/projects/ProjectWorkspace.tsx');
  assert.match(source, /if \(item\.id === "recruitment"\) return canManageRecruitment;/);
  assert.match(source, /if \(item\.id === "cases"\) return canManageCases;/);
  assert.match(source, /if \(item\.id === "finance"\) return canManageFinance;/);
  assert.match(source, /if \(item\.id === "activity"\) return canManageProject;/);
  assert.match(source, /tabs\.some\(item => item\.id === next\)/);
});

await ok('grouped desktop navigation preserves the approved section map', async () => {
  const source = read('src/features/projects/ProjectWorkspace.tsx');
  assert.match(source, /label: "Overview", ids: \["overview", "reports"\]/);
  assert.match(source, /label: "Delivery", ids: \["team", "recruitment", "field-work", "map", "responses"\]/);
  assert.match(source, /label: "Impact", ids: \["cases"\]/);
  assert.match(source, /label: "Administration", ids: \["finance", "governance", "documents", "activity"\]/);
  assert.match(source, /<SectionNav groups=\{groupedTabs\}/);
  assert.match(read('src/styles/fieldlance-2420.css'), /\.project-workspace-grouped-nav\{display:grid/);
});

await ok('mobile Project Section uses the 2.42.0 section and bottom-sheet primitives', async () => {
  const workspace = read('src/features/projects/ProjectWorkspace.tsx');
  const ui = read('src/components/ui/FieldLanceUI.tsx');
  const css = read('src/styles/fieldlance-2420.css');
  assert.match(workspace, /<MobileSectionPicker/);
  assert.match(workspace, /label="Project section" disabled=\{navigating\} presentation="sheet"/);
  assert.doesNotMatch(workspace, /project-workspace-tabs/);
  assert.match(ui, /presentation\?: "select" \| "sheet"/);
  assert.match(ui, /<BottomSheet open=\{open\} title=\{label\}/);
  assert.match(ui, /<h3>\{group\.label\}<\/h3>/);
  assert.match(css, /\.project-workspace-navigation\{display:none\}\.project-workspace-mobile-navigation\{display:block/);
  assert.match(css, /\.fl-mobile-section-trigger\{[^}]*min-height:48px/);
  assert.doesNotMatch(css.match(/@media\(max-width:700px\)\{[\s\S]*?\n\}/)?.[0] || '', /project-workspace-tabs/);
});

await ok('project identity header uses already-available project context and preserves the existing title query', async () => {
  const shell = read('src/app/AppShell.tsx');
  const workspace = read('src/features/projects/ProjectWorkspace.tsx');
  const header = read('src/features/projects/ProjectWorkspaceHeader.tsx');
  assert.match(shell, /project=\{\{[\s\S]*title: workspaceProject\?\.title[\s\S]*status: workspaceProject\?\.status[\s\S]*startDate: workspaceProject\?\.start_date[\s\S]*endDate: workspaceProject\?\.end_date/s);
  assert.match(shell, /projectRole=\{projectScopeAssignment\?\.role \|\| null\}/);
  assert.match(workspace, /from\("survey_projects"\)\.select\("title"\)/);
  assert.equal((workspace.match(/from\("survey_projects"\)/g) || []).length, 1);
  assert.match(header, /organizationName/);
  assert.match(header, /projectRole/);
  assert.match(header, /project\.startDate/);
  assert.match(header, /project\.endDate/);
  assert.match(header, /StatusBadge/);
});

await ok('lifecycle context is display-only and declines to fabricate an unknown stage', async () => {
  const header = read('src/features/projects/ProjectWorkspaceHeader.tsx');
  for (const label of ['Setup','Recruitment','Field Delivery','Review','Completion']) assert.match(header, new RegExp(`label: "${label}"`));
  assert.match(header, /if \(!project\) return null;/);
  assert.match(header, /if \(project\.status === "active" && project\.startDate && project\.endDate && today >= project\.startDate && today <= project\.endDate\) return "field-delivery";/);
  assert.match(header, /if \(project\.status === "active" && project\.startDate && today < project\.startDate && project\.recruitmentStatus === "open"\) return "recruitment";/);
  assert.match(header, /return null;\n\}/);
  assert.doesNotMatch(header, /db\.|rpc\(/);
});

await ok('2.42.1-r1 enforces lifecycle typography floor and token-only Project Workspace colors', async () => {
  const css = read('src/styles/fieldlance-2420.css');
  const shellStart = css.indexOf('/* Project workspace shell:');
  assert.ok(shellStart >= 0);
  const shellCss = css.slice(shellStart, css.indexOf('/* Existing ActionDialog', shellStart));
  assert.match(shellCss, /\.project-lifecycle-marker\{[^}]*font-size:12px/);
  const mobile = shellCss.match(/@media\(max-width:700px\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(mobile, /\.project-lifecycle li\{[^}]*font-size:12px/);
  for (const color of ['#fbfdff','#dbeafe','#f8fbff','#bfdbfe']) assert.equal(shellCss.toLowerCase().includes(color), false, color);
  assert.match(shellCss, /color-mix\(in srgb,var\(--fl-primary-soft\)/);
  assert.match(shellCss, /color-mix\(in srgb,var\(--fl-primary\)/);
});

await ok('2.42.1-r1 lifecycle date default uses the local calendar day instead of UTC serialization', async () => {
  const header = read('src/features/projects/ProjectWorkspaceHeader.tsx');
  assert.match(header, /function localCalendarDateKey\(date = new Date\(\)\)/);
  assert.match(header, /date\.getFullYear\(\)/);
  assert.match(header, /date\.getMonth\(\) \+ 1/);
  assert.match(header, /date\.getDate\(\)/);
  assert.match(header, /today = localCalendarDateKey\(\)/);
  assert.doesNotMatch(header, /toISOString\(\)\.slice\(0, 10\)/);
});

await ok('AppShell owns page context while Project Workspace owns project identity', async () => {
  const shell = read('src/app/AppShell.tsx');
  const workspace = read('src/features/projects/ProjectWorkspace.tsx');
  assert.match(shell, /const pageTitle = page === "Project workspace"\s*\? "Project workspace"/);
  assert.doesNotMatch(shell, /page === "Project workspace" && workspaceProject\s*\? workspaceProject\.title/);
  assert.match(workspace, /<ProjectWorkspaceHeader/);
  assert.match(read('src/features/projects/ProjectWorkspaceHeader.tsx'), /<h2 title=\{project\.title\}>\{project\.title\}<\/h2>/);
});

await ok('back-forward and direct project deep-link wiring remain intact', async () => {
  const workspace = read('src/features/projects/ProjectWorkspace.tsx');
  const shell = read('src/app/AppShell.tsx');
  assert.match(workspace, /if\(!routeTab \|\| routeTab===tab \|\| !tabs\.some\(item=>item\.id===routeTab\)\)return;\s*setTab\(routeTab\);/s);
  assert.match(workspace, /onRouteChange\?\.\(next,null,null\)/);
  assert.match(shell, /routeTab=\{browserRoute\.projectId===workspaceProjectId \? browserRoute\.projectTab as ProjectWorkspaceTab \| null : null\}/);
  assert.match(shell, /onRouteChange=\{\(tab,entityKind=null,entityId=null\)=>syncRoute\(\{scope,page:"Project workspace",projectId:workspaceProjectId,projectTab:tab,entityKind,entityId\}\)\}/);
  assert.match(shell, /browserRoute\.projectId[\s\S]*browserRoute\.page!=="Project workspace"[\s\S]*from\("survey_projects"\)\.select\("\*"\)/);
});

await ok('detailed feature tabs remain wired to their existing operational components and callbacks', async () => {
  const source = read('src/features/projects/ProjectWorkspace.tsx');
  for (const component of ['ReportsWorkspace','ProjectOverview','ProjectTeamWorkspace','WorkforceMarketplace','AttendanceWorkspace','SurveyProjects','FieldOperationsMap','BeneficiaryCasesWorkspace','ProjectFundingWorkspace','ProjectGovernance','ProjectDocuments','ProjectActivity']) assert.match(source, new RegExp(`<${component}\\b`), component);
  assert.match(source, /onReport=\{selection=>\{setReportSelection\(selection\);openTab\("reports"\)\}\}/);
  assert.match(source, /openOperations=\{\(\) => openTab\("responses"\)\}/);
  assert.match(source, /onOpportunityChange=\{id=>onRouteChange\?\.\("recruitment"/);
  assert.match(source, /initialAssignmentId=\{routeEntityKind === "assignment" \? routeEntityId : null\}/);
  assert.match(source, /initialResponseId=\{routeEntityKind === "response" \? routeEntityId : null\}/);
  assert.match(source, /onSelectedCaseChange=\{\(caseId\)=>onRouteChange\?\.\("cases"/);
});

console.log(`\n${passed} FieldLance 2.42.1-r1 Project Workspace scenarios passed.`);
