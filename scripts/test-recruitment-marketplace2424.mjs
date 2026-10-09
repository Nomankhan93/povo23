import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const marketplace = read('src/features/workforce/WorkforceMarketplace.tsx');
const invitations = read('src/features/workforce/InvitationsPanel.tsx');
const inviteVolunteer = read('src/features/workforce/InviteVolunteer.tsx');
const marketplaceCss = read('src/features/workforce/WorkforceMarketplace.module.css');
const invitationsCss = read('src/features/workforce/InvitationsPanel.module.css');
const inviteVolunteerCss = read('src/features/workforce/InviteVolunteer.module.css');
const styleCss = read('src/style.css');
const queries = read('src/features/workforce/recruitmentQueries.ts');
const state = read('src/features/workforce/recruitmentState.ts');
const pkg = JSON.parse(read('package.json'));

const expectedHashes = {
  'src/features/workforce/recruitmentQueries.ts': '8592b68b8cb7a1937bb3864475434888583b73ef7bb9a8df1d2d8a82aefb0aea',
  'src/features/workforce/recruitmentState.ts': 'd684d63a14ed3dac5c376106d303b0b00833b931debd909a113c45e46db677ac',
  'src/features/workforce/AttendanceWorkspace.tsx': 'f9e50f6356e24a7c61f5b6ad5a11ebbba4687f123104487892531207980831a9',
  'src/features/workforce/WorkAvailabilitySchedule.tsx': '1f54c9458fef27c46d7df7245fae9e82c986da9227aa27ae4d86d820e52675be',
  'src/features/workforce/FieldWorkerDashboard.tsx': '9f905acc1d43f674c4d4773884c36d07cd168d6751c904a56ebd958ff898bd54',
  'src/features/projects/ProjectTeamWorkspace.tsx': '043658f9147c46365e308a22609d0947d38a9cf7d07cd272b3810ef16faa53fc',
  'src/features/projects/workspacePermissions.ts': 'ab5ec24668bb14a01561610f16a008e1a819ff02fd1879ba268e49f207d99fd7',
  'src/features/projects/projectNavigation.ts': '4108763147b73ad7ddd969711d6b270270941cabfffca7c83c9da512b51104b7',
  'src/features/volunteers/Directory.tsx': 'ae5c781a37e84a2752fccfdb4f94e0753605fef089d0fdc2ed546d78b4e037b9',
  'src/app/capabilityContract.ts': '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62',
  'src/app/routes.ts': 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879',
  'src/lib/supabase/client.ts': '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc',
  'src/lib/supabase/database.types.ts': 'e29703de0d84d0335ca185a20e155ff1d96d2558ac7e7a8e413b9c36c29a3761',
};

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.42.4 release and dedicated test are registered', async () => {
  assert.equal(pkg.version, '2.42.4');
  assert.equal(pkg.scripts['test:recruitment-marketplace-2424'], 'node --experimental-strip-types scripts/test-recruitment-marketplace2424.mjs');
});

await ok('protected recruitment, authorization, project and data files remain byte-identical', async () => {
  for (const [path, expected] of Object.entries(expectedHashes)) assert.equal(sha(path), expected, `${path} changed unexpectedly`);
});

await ok('database migration inventory and head remain unchanged', async () => {
  const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
});

await ok('marketplace continues to use canonical availability and can_apply semantics', async () => {
  assert.match(marketplace, /rpc\('available_work_opportunities'/);
  assert.match(marketplace, /o\.can_apply/);
  assert.match(marketplace, /o\.eligibility_reason/);
  assert.doesNotMatch(marketplace, /recommendation[_ ]score|ranking[_ ]score|ai[_ -]?match/i);
});

await ok('opportunity match pills communicate true and false states in text, not color alone', async () => {
  assert.match(marketplace, /o\.area_match \? "✓ Area match" : "Area differs"/);
  assert.match(marketplace, /o\.skill_match \? "✓ Skill match" : "Skill differs"/);
  assert.match(marketplace, /o\.language_match \? "✓ Language match" : "Language differs"/);
  assert.doesNotMatch(marketplace, /data-match=\{o\.area_match\}>✓ Area match/);
  assert.doesNotMatch(marketplace, /data-match=\{o\.skill_match\}>✓ Skill match/);
  assert.doesNotMatch(marketplace, /data-match=\{o\.language_match\}>✓ Language match/);
});

await ok('ApplicantSnapshot uses canonical snapshot keys and collision-safe React row keys', async () => {
  const block = marketplace.match(/function ApplicantSnapshot\([\s\S]*?\n}\n\nfunction AssignmentOfferForm/)?.[0] || '';
  assert.ok(block, 'ApplicantSnapshot block not found');
  const mappedKeys = [...block.matchAll(/\["([^"]+)", "[^"]+"\]/g)].map(match => match[1]);
  assert.deepEqual(mappedKeys, [
    'full_name','phone','area','education','skills','languages','experience','availability','preference','transport','smartphone','preferred_areas','bio','geography_id','profile_publication_status','profile_version','poem_verified_work','poem_verified_work_count'
  ]);
  assert.equal(mappedKeys.filter(key => key === 'education').length, 1);
  assert.match(block, /\["preference", "Work preference"\]/);
  assert.match(block, /\["profile_publication_status", "Publication status"\]/);
  assert.match(block, /\["poem_verified_work_count", "Verified FieldLance work"\]/);
  assert.doesNotMatch(block, /\["work_preference",/);
  assert.doesNotMatch(block, /\["publication_status",/);
  assert.doesNotMatch(block, /\["verified_fieldlance_work",/);
  assert.match(block, /rows\.map\(\(\[key,label,value\]\) => <div className=\{styles\.snapshotItem\} key=\{key\}>/);
  assert.doesNotMatch(block, /key=\{label\}/);
  assert.match(block, /JSON\.stringify\(snapshot, null, 2\)/);
});

await ok('normal project recruitment remains automatic-marketplace first', async () => {
  assert.match(marketplace, /every published project already receives its automatic Field Worker marketplace listing/i);
  assert.match(marketplace, /create_recruitment_opportunity/);
  assert.match(marketplace, /targeted campaign/i);
  assert.doesNotMatch(inviteVolunteer, /create_recruitment_opportunity|create_opportunity/);
});

await ok('application consent and immutable snapshot workflow remain intact', async () => {
  assert.match(marketplace, /apply_work_opportunity/);
  assert.match(marketplace, /p_profile_share_consent:\s*f\.get\("consent"\) === "on"/);
  assert.match(marketplace, /application-scoped recruitment snapshot/i);
  assert.match(marketplace, /profile_snapshot/);
  assert.match(marketplace, /immutable application-time snapshot/i);
  assert.doesNotMatch(marketplace, /from\(\"(?:volunteer_)?profiles?\"\)|from\('(?:volunteer_)?profiles?'\)/i);
});

await ok('application withdrawal and review callbacks preserve current status semantics', async () => {
  assert.match(marketplace, /withdraw_work_application/);
  assert.match(marketplace, /review_work_application/);
  for (const status of ['pending', 'shortlisted', 'selected', 'rejected', 'withdrawn']) assert.match(marketplace, new RegExp(`\\b${status}\\b`));
  assert.match(marketplace, /applicationDisplayStatus\(application\.status, linked\)/);
});

await ok('selected application remains distinct from accepted formal assignment', async () => {
  assert.match(marketplace, /Selected · wait for a formal assignment offer/);
  assert.match(marketplace, /Sending this offer does not activate field work/);
  assert.match(marketplace, /respond_work_assignment/);
  assert.match(marketplace, /p_status: "accepted"/);
  assert.match(state, /linkedAssignment/);
});

await ok('exact application and assignment entity loading remains deep-link safe', async () => {
  assert.match(marketplace, /recruitmentQuery\(focusKind==='application'\?'work_applications':'work_assignments',scope\)\.eq\('id',focusId\)\.maybeSingle\(\)/);
  assert.match(marketplace, /includeFocused/);
  assert.match(queries, /limit\(51\)/);
  assert.match(queries, /if\(cursor\)query=query\.or/);
  assert.match(marketplace, /onFocusChange\?\.\("application"/);
  assert.match(marketplace, /onFocusChange\?\.\("assignment"/);
});

await ok('formal offer source, compensation snapshot and submit RPC remain intact', async () => {
  assert.match(marketplace, /create_work_assignment/);
  assert.match(marketplace, /p_source_kind:\s*offer\.source_kind/);
  assert.match(marketplace, /p_source_id:\s*offer\.source_kind === "shortlist" \? null : offer\.source_id/);
  assert.match(marketplace, /p_work_mode:\s*modeSnapshot/);
  assert.match(marketplace, /p_compensation_type:\s*typeSnapshot/);
  assert.match(marketplace, /p_currency:\s*currencySnapshot/);
  assert.match(marketplace, /p_rate:\s*rateSnapshot/);
});

await ok('schedule conflict check and hard-conflict blocking are unchanged', async () => {
  assert.match(marketplace, /check_work_assignment_conflicts/);
  assert.match(marketplace, /const hardConflict=conflict\?\.status==="hard_conflict"/);
  assert.match(marketplace, /disabled=\{busy\|\|checking\|\|hardConflict\}/);
  assert.match(marketplace, /window\.setTimeout\(\(\)=>\{/);
  assert.match(marketplace, /},250\)/);
});

await ok('worker formal-offer accept and decline callbacks remain unchanged', async () => {
  assert.match(marketplace, /respond_work_assignment", \{ p_id: a\.id, p_status: "declined", p_version: a\.version \}/);
  assert.match(marketplace, /respond_work_assignment", \{ p_id: a\.id, p_status: "accepted", p_version: a\.version \}/);
  assert.match(marketplace, /Accepting activates the assignment under the existing rules/);
});

await ok('direct invitation remains recruitment interest rather than assignment activation', async () => {
  assert.match(invitations, /respond_work_invitation/);
  assert.match(invitations, /cancel_work_invitation/);
  assert.match(invitations, /does not create an assignment or start field work/i);
  assert.doesNotMatch(invitations, /create_work_assignment/);
});

await ok('InviteVolunteer preserves its existing opportunity query and send callback', async () => {
  assert.match(inviteVolunteer, /\.from\("work_opportunities"\)/);
  assert.match(inviteVolunteer, /\.eq\("organization_id", organization\)/);
  assert.match(inviteVolunteer, /\.eq\("status", "open"\)/);
  assert.match(inviteVolunteer, /\.not\("survey_project_id", "is", null\)/);
  assert.match(inviteVolunteer, /send_work_invitation/);
  assert.match(inviteVolunteer, /p_opportunity:\s*text\(f,\s*"op"\)/);
  assert.match(inviteVolunteer, /p_user:\s*userId/);
});

await ok('unreachable legacy invitation-opportunity creator is retired without resurrecting it', async () => {
  assert.doesNotMatch(invitations, /create_opportunity/);
  assert.doesNotMatch(invitations, /setCreate\(true\)|newOpportunity|name="title"/);
  assert.match(invitations, /\.is\("survey_project_id", null\)/);
  assert.match(invitations, /close_opportunity/);
});

await ok('historical invitation opportunities remain readable', async () => {
  assert.match(invitations, /Historical invitation-only opportunities/);
  assert.match(invitations, /work_opportunities/);
  assert.match(invitations, /work_invitations/);
  assert.match(invitations, /OpportunityDetails/);
});

await ok('marketplace presentation uses scoped modules and existing shared primitives', async () => {
  assert.match(marketplace, /WorkforceMarketplace\.module\.css/);
  assert.match(marketplace, /BottomSheet/);
  assert.match(marketplace, /StatusBadge/);
  assert.match(marketplace, /<Tabs<OrganizationView>/);
  assert.doesNotMatch(marketplace, /useNarrowScreen/);
  assert.match(invitations, /InvitationsPanel\.module\.css/);
  assert.match(inviteVolunteer, /InviteVolunteer\.module\.css/);
});

await ok('new recruitment modules follow token, typography and breakpoint rules', async () => {
  for (const [name, css] of [['marketplace', marketplaceCss], ['invitations', invitationsCss], ['invite volunteer', inviteVolunteerCss]]) {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, `${name} has a hard-coded color`);
    assert.doesNotMatch(css, /!important/, `${name} uses !important`);
    assert.doesNotMatch(css, /font-size\s*:\s*(?:[0-9]|1[01])px\b/, `${name} contains sub-12px operational typography`);
    const breakpoints = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map(match => Number(match[1]));
    assert.ok(breakpoints.every(value => value === 1023 || value === 639), `${name} has unapproved breakpoints: ${breakpoints.join(', ')}`);
    assert.match(css, /var\(--fl-/);
  }
});

await ok('mobile filters and application review are CSS-controlled at 639px', async () => {
  assert.match(marketplaceCss, /@media \(max-width: 639px\)/);
  assert.match(marketplaceCss, /\.mobileFilterBar/);
  assert.match(marketplaceCss, /\.applicationsWorkspace\[data-mobile-detail="true"\]/);
  assert.doesNotMatch(marketplace, /matchMedia|useNarrowScreen/);
});

await ok('project recruitment mode avoids duplicate project identity while standalone modes keep context', async () => {
  assert.match(marketplace, /mode === "project"\s*\? "Recruitment"/);
  assert.match(marketplace, /mode === "ngo"\s*\? "Organization recruitment"/);
  assert.match(marketplace, /projectScopeId/);
});

await ok('application reviewer uses master-detail and immutable snapshot with full technical audit fidelity', async () => {
  assert.match(marketplace, /applicationsWorkspace/);
  assert.match(marketplace, /OrganizationApplicationDetail/);
  assert.match(marketplace, /ApplicantSnapshot/);
  assert.match(marketplace, /Technical snapshot/);
  assert.match(marketplace, /JSON\.stringify\(snapshot, null, 2\)/);
});

await ok('application reviewer exposes filter and selected-applicant state without overriding native button semantics', async () => {
  const reviewBlock = marketplace.match(/<div className=\{styles\.filterPills\}[\s\S]*?<section className=\{styles\.applicationDetail\}/)?.[0] || '';
  assert.ok(reviewBlock, 'applications master/detail block not found');
  assert.doesNotMatch(reviewBlock, /<button[^>]*role=["']listitem["']/);
  assert.doesNotMatch(reviewBlock, /role=["']list["']/);
  assert.match(reviewBlock, /<button type="button" key=\{status\} data-active=\{applicationFilter === status\} aria-pressed=\{applicationFilter === status\}/);
  assert.match(reviewBlock, /<button type="button" className=\{styles\.applicationListButton\} data-active=\{active\} aria-pressed=\{active\} key=\{a\.id\}/);
  assert.match(reviewBlock, /onClick=\{\(\)=>\{setSelectedApplicationId\(a\.id\);setApplicationDetailOpen\(true\)\}\}/);
});

await ok('recruitment-specific legacy inline invitation selector has no remaining consumer', async () => {
  assert.doesNotMatch(styleCss, /\.invite-inline\b/);
  assert.doesNotMatch(marketplace + invitations + inviteVolunteer, /invite-inline/);
});

await ok('new CSS modules have no orphaned class references', async () => {
  const pairs = [[marketplaceCss, marketplace], [invitationsCss, invitations], [inviteVolunteerCss, inviteVolunteer]];
  for (const [css, source] of pairs) {
    const classes = new Set([...css.matchAll(/(?<![\w-])\.([A-Za-z_][\w-]*)/g)].map(match => match[1]));
    const uses = new Set([...source.matchAll(/styles\.([A-Za-z_][\w]*)/g)].map(match => match[1]));
    assert.deepEqual([...classes].filter(name => !uses.has(name)), []);
    assert.deepEqual([...uses].filter(name => !classes.has(name)), []);
  }
});

await ok('recruitment RPC surface is unchanged except retired unreachable creator', async () => {
  const expectedMarketplaceRpcs = ['apply_work_opportunity','cancel_work_assignment','check_work_assignment_conflicts','complete_work_assignment','create_recruitment_opportunity','create_work_assignment','project_workforce_candidates','respond_work_assignment','review_work_application','set_work_opportunity_state','withdraw_work_application'];
  for (const rpcName of expectedMarketplaceRpcs) assert.match(marketplace, new RegExp(rpcName));
  for (const rpcName of ['cancel_work_invitation','close_opportunity','respond_work_invitation']) assert.match(invitations, new RegExp(rpcName));
  assert.match(inviteVolunteer, /send_work_invitation/);
});

console.log(`\n${passed} FieldLance 2.42.4 recruitment/marketplace scenarios passed.`);
