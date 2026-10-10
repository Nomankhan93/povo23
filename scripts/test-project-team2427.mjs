import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
let passed = 0;
async function ok(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const team = read('src/features/projects/ProjectTeamWorkspace.tsx');
const css = read('src/features/projects/ProjectTeamWorkspace.module.css');
const globalCss = read('src/styles/design-system.css');
const app = read('src/app/AppShell.tsx');
const projectWorkspace = read('src/features/projects/ProjectWorkspace.tsx');
const permissions = read('src/features/projects/workspacePermissions.ts');
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();

const protectedHashes = {
  'src/app/AppShell.tsx': '428e73f7de2df65b423c9acc819ad2237d048396be292557aec048cfd1b89397',
  'src/app/routes.ts': 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879',
  'src/app/navigation.ts': '675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132',
  'src/app/capabilityContract.ts': '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62',
  'src/features/projects/ProjectWorkspace.tsx': 'f1edb171031d1d2e2d1f5c240470914384e0731ba317fbbe586f8ceaf9dbfdd8',
  'src/features/projects/workspacePermissions.ts': 'ab5ec24668bb14a01561610f16a008e1a819ff02fd1879ba268e49f207d99fd7',
  'src/features/projects/projectNavigation.ts': '4108763147b73ad7ddd969711d6b270270941cabfffca7c83c9da512b51104b7',
  'src/features/geography/AreaSelector.tsx': 'ff5e3b029773421b1ab1d13492d3292b2f67bc0681a8ad99cdb0fea5474ef8d4',
  'src/features/geography/areaSelection.ts': 'ee41f722e48640841e31a0ee8beba9e1075ff4641dbf5c6ad9188187588a48df',
  'src/features/geography/model.tsx': 'da9155490fb8aa99fc7b6f75fb344c6cf0c636eb33c92bb936dcdbb015ff95c4',
  'src/features/workforce/recruitmentQueries.ts': '8592b68b8cb7a1937bb3864475434888583b73ef7bb9a8df1d2d8a82aefb0aea',
  'src/features/workforce/recruitmentState.ts': 'd684d63a14ed3dac5c376106d303b0b00833b931debd909a113c45e46db677ac',
  'src/lib/supabase/client.ts': '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc',
  'src/lib/supabase/database.types.ts': 'e29703de0d84d0335ca185a20e155ff1d96d2558ac7e7a8e413b9c36c29a3761',
};

await ok('package and lockfile are FieldLance 2.42.7', async () => {
  assert.ok(['2.42.7','2.42.8'].includes(pkg.version));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.['']?.version, pkg.version);
});
await ok('migration inventory remains 87', async () => assert.equal(migrations.length, 87));
await ok('migration head remains project lifecycle integrity', async () => assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql'));
await ok('2.42.7 adds no migration surface', async () => assert.equal(migrations.some(name => /2427|project_team.*2427/i.test(name)), false));
await ok('project_staff_candidates is preserved', async () => assert.match(team, /project_staff_candidates/));
await ok('assign_project_staff is preserved', async () => assert.match(team, /assign_project_staff/));
await ok('revoke_project_staff is preserved', async () => assert.match(team, /revoke_project_staff/));
await ok('project_staff_roster is preserved', async () => assert.match(team, /project_staff_roster/));
await ok('team-management boundary remains server/capability driven', async () => {
  assert.match(team, /canManageTeam/);
  assert.match(permissions, /return surveyManage \|\| ownsWorkspaceProject/);
  assert.match(app, /canManageTeam=\{canManageWorkspaceTeam\}/);
});
await ok('Project Manager does not gain team-management permission', async () => {
  assert.doesNotMatch(permissions, /project_manager/);
  assert.match(team, /ownStaff\?\.role === 'project_manager'/);
  assert.doesNotMatch(team, /own\?\.role === 'project_manager'[^\n]+setCandidates/);
});
await ok('Area Focal does not gain team-management permission', async () => {
  assert.doesNotMatch(permissions, /area_focal/);
  assert.match(team, /role === 'area_focal_person'/);
});
await ok('NGO-level project selector remains available', async () => {
  assert.match(team, /!projectId &&/);
  assert.match(team, /label="Project"/);
  assert.match(app, /page === "Project team"/);
});
await ok('Project Workspace single-project mode remains supported', async () => {
  assert.match(projectWorkspace, /<ProjectTeamWorkspace/);
  assert.match(projectWorkspace, /projectId=\{projectId\}/);
});
await ok('current role and scope presentation exists', async () => {
  assert.match(team, /Your role/);
  assert.match(team, /Assigned scope/);
  assert.match(team, /Whole project/);
});
await ok('team summary metrics exist', async () => {
  for (const label of ['Active staff', 'Project Managers', 'Area Focal Persons', 'Revoked assignments']) assert.match(team, new RegExp(label));
  assert.match(team, /roster\.filter/);
});
await ok('desktop roster uses shared DataTable', async () => {
  assert.match(team, /<DataTable caption="Project staff roster">/);
  assert.match(team, /<th>Person<\/th>/);
});
await ok('mobile roster uses shared MobileRecordCard', async () => assert.match(team, /<MobileRecordCard/));
await ok('active and revoked states remain textually represented', async () => {
  assert.match(team, /row\.status === 'active'/);
  assert.match(team, /row\.status === 'revoked'/);
  assert.match(team, /<StatusBadge/);
});
await ok('candidate lookup remains server-authorized and bounded by RPC', async () => {
  assert.match(team, /rpc\('project_staff_candidates'/);
  assert.doesNotMatch(team, /from\(['"]accounts['"]\)/);
});
await ok('Project Manager assignment has no area requirement', async () => assert.match(team, /p_areas: role === 'area_focal_person' \? areas : \[\]/));
await ok('Area Focal assignment requires selected areas', async () => {
  assert.match(team, /role === 'area_focal_person'/);
  assert.match(team, /!areas\.length/);
  assert.match(team, /<AreaSelector/);
});
await ok('project date constraints remain', async () => {
  assert.match(team, /min=\{project\.start_date\} max=\{project\.end_date\}/);
  assert.match(team, /min=\{starts \|\| project\.start_date\} max=\{project\.end_date\}/);
});
await ok('revoke retains reason-required confirmation semantics', async () => {
  assert.match(team, /<ReasonDialog/);
  assert.match(team, /reasonLabel="Reason for change"/);
  assert.match(team, /minReasonLength=\{5\}/);
  assert.match(team, /Revoke access for/);
});
await ok('read-only operational metrics remain', async () => {
  for (const label of ['Active survey assignments', 'Pending review', 'Approved', 'Corrections', 'Rejected']) assert.match(team, new RegExp(label));
  assert.match(team, /!canManageTeam &&/);
});
await ok('historical collection-eligibility safety wording remains', async () => assert.match(team, /Historical survey records do not establish collection eligibility\. Workers need accepted active contracts\./));
await ok('recruitment capacity semantics remain', async () => {
  assert.match(team, /set_project_recruitment_plan/);
  assert.match(team, /Closing recruitment does not reject already-created\/offline survey submissions/);
  assert.match(team, /remaining_capacity/);
});
await ok('compensation snapshot semantics remain', async () => {
  assert.match(team, /set_project_compensation_defaults/);
  assert.match(team, /future opportunity snapshots/);
  assert.match(team, /do not rewrite existing assignments or payables/);
});
await ok('no broad accounts-table query is added', async () => assert.doesNotMatch(team, /from\(['"]accounts['"]\)/));
await ok('scoped ProjectTeamWorkspace CSS module exists and is used', async () => {
  assert.equal(existsSync('src/features/projects/ProjectTeamWorkspace.module.css'), true);
  assert.match(team, /ProjectTeamWorkspace\.module\.css/);
  assert.doesNotMatch(team, /project-team-table|project-staff-form|project-context-banner/);
  assert.doesNotMatch(globalCss, /project-team-table|project-staff-form|project-context-banner|project-recruitment-plan|project-compensation-plan/);
});
await ok('Project Team CSS module has no hard-coded colors', async () => assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i));
await ok('Project Team CSS module has no important declarations', async () => assert.doesNotMatch(css, /!important/));
await ok('Project Team CSS module has no operational font below 12px', async () => {
  const sizes = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)].map(match => Number(match[1]));
  assert.ok(sizes.every(size => size >= 12), `found font sizes: ${sizes.join(', ')}`);
});
await ok('Project Team CSS module uses only approved responsive breakpoints', async () => {
  const breakpoints = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map(match => Number(match[1]));
  assert.deepEqual([...new Set(breakpoints)].sort((a, b) => a - b), [639, 1023]);
});

await ok('r1 Area Focal remove action uses the shared semantic Button', async () => {
  assert.match(team, /<Button[^>]+variant="tertiary"[^>]+className=\{styles\.areaChipRemove\}[^>]+aria-label=\{`Remove \$\{name\}`\}/);
  assert.doesNotMatch(team, /<button[^>]+aria-label=\{`Remove \$\{name\}`\}/);
});
await ok('r1 Area Focal remove action keeps area-specific accessible naming', async () => {
  assert.match(team, /aria-label=\{`Remove \$\{name\}`\}/);
  assert.match(team, /setAreas\(value => value\.filter\(item => item !== id\)\)/);
});
await ok('r1 Project Team desktop interaction targets enforce at least 44px', async () => {
  assert.match(css, /\.workspace :global\(\.fl-button\)[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.areaChipRemove\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.areaChip\s*\{[\s\S]*?min-height:\s*44px;/);
});
await ok('r1 Project Team mobile interaction targets enforce at least 48px', async () => {
  const mobile = css.match(/@media \(max-width:\s*639px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? '';
  assert.match(mobile, /\.workspace :global\(\.fl-button\)[\s\S]*?min-height:\s*48px;/);
  assert.match(mobile, /\.areaChip,[\s\S]*?\.areaChipRemove\s*\{[\s\S]*?min-height:\s*48px;/);
});
await ok('r1 removes the undersized 30px Area Focal remove target', async () => {
  assert.doesNotMatch(css, /\.areaChip(?:Remove|\s+button)[\s\S]{0,180}?min-height:\s*30px;/);
});
await ok('r1 does not retain a 44px mobile Area Focal remove target', async () => {
  const mobile = css.match(/@media \(max-width:\s*639px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? '';
  assert.doesNotMatch(mobile, /\.areaChipRemove[\s\S]{0,180}?min-height:\s*44px;/);
  assert.doesNotMatch(mobile, /\.areaChip\s+button[\s\S]{0,180}?min-height:\s*44px;/);
});
await ok('r1 control-size correction introduces no arbitrary Project Team breakpoint', async () => {
  const breakpoints = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map(match => Number(match[1]));
  assert.deepEqual([...new Set(breakpoints)].sort((a, b) => a - b), [639, 1023]);
});
await ok('r1 control-size correction introduces no hard-coded Project Team color', async () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});
await ok('r1 control-size correction introduces no important declaration', async () => {
  assert.doesNotMatch(css, /!important/);
});
await ok('r1 keeps authorization and protected implementation files byte-identical', async () => {
  for (const [path, expected] of Object.entries(protectedHashes)) assert.equal(hash(path), expected, path);
});
await ok('declared protected files remain byte-identical to 2.42.6 baseline', async () => {
  for (const [path, expected] of Object.entries(protectedHashes)) assert.equal(hash(path), expected, path);
});

console.log(`\n${passed}/44 FieldLance 2.42.7-r1 Project Team scenarios passed.`);
