import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super', 'ngo', 'volunteer'].map((n, i) => [
    n,
    `93100000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  ]),
);
const rows = async (q, p = []) => (await db.query(q, p)).rows;
async function as(name) {
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] || '']);
  await db.exec(`SET ROLE ${name ? 'authenticated' : 'anon'}`);
}
async function call(name, args) {
  return (
    await rows(
      `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`,
      args,
    )
  )[0].result;
}
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  for (const [name, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
      id,
      `${name}@example.test`,
      { full_name: `${name} account` },
    ]);
  }
  await db.query("update public.accounts set platform_role='super_admin' where id=$1", [ids.super]);

  await as('super');
  const org = await call('save_organization', [null, { name: 'Scoped Access NGO', status: 'active' }]);
  await call('set_membership', [org, ids.ngo, 'ngo_admin', 'active']);
  const province = await call('save_geography', [null, null, 'province', 'Access Province', 'ASP', 'Fixture', true]);
  const division = await call('save_geography', [null, province, 'division', 'Access Division', 'ASD', 'Fixture', true]);
  const district = await call('save_geography', [null, division, 'district', 'Access District', 'ASX', 'Fixture', true]);
  const taluka = await call('save_geography', [null, district, 'taluka', 'Access Taluka', 'AST', 'Fixture', true]);
  const template = await call('publish_survey_template', [
    'NGO access stabilization survey',
    [{ id: 'q', label: 'Question', type: 'text', required: true }],
  ]);
  const d = (await rows("select ((now() at time zone 'UTC')::date)::text today,((now() at time zone 'UTC')::date+1)::text opportunity_start,((now() at time zone 'UTC')::date+10)::text finish,(now()+interval '2 hours')::text reply_by"))[0];
  const project = await call('create_survey_project', [
    org,
    'NGO Access Stabilization Project',
    template,
    district,
    20,
    d.today,
    d.finish,
    'Verify assignment scoped volunteer access',
    'access-v1',
    'I consent to collection for this synthetic NGO access stabilization project.',
  ]);

  await db.exec('RESET ROLE');
  await db.query(
    "update public.volunteer_profiles set status='verified',geography_id=$1,details=$2 where user_id=$3",
    [taluka, { full_name: 'Scoped Volunteer', skills: 'Survey', languages: 'Urdu' }, ids.volunteer],
  );

  let opportunity;
  await ok('selected open-recruitment applicant can be assigned without a permanent profile grant', async () => {
    assert.equal((await rows('select count(*)::int c from public.profile_shares'))[0].c, 0);
    await as('ngo');
    opportunity = await call('create_recruitment_opportunity', [
      project,
      'Scoped recruitment',
      'Recruit a volunteer through an explicit application rather than a permanent profile grant.',
      district,
      d.opportunity_start,
      d.finish,
      d.reply_by,
      'unpaid',
      '',
      1,
      '',
      '',
      'all',
      '',
      true,
    ]);
    await as('volunteer');
    const application = await call('apply_work_opportunity', [opportunity, 'Available for the project period', 'Interested in this field assignment.', true]);
    await as('ngo');
    const app = (await rows('select * from public.work_applications where id=$1', [application]))[0];
    await call('review_work_application', [application, 'selected', 'Suitable for this project assignment.', app.version]);
    await call('set_survey_assignment', [project, ids.volunteer, true]);
    assert.equal((await rows('select active from public.survey_assignments where project_id=$1 and user_id=$2', [project, ids.volunteer]))[0].active, true);
    await db.exec('RESET ROLE');
    assert.equal((await rows('select count(*)::int c from public.profile_shares'))[0].c, 0);
  });

  await ok('NGO profile access is bounded by the active project assignment', async () => {
    await as('ngo');
    let result = await call('search_volunteers', [org, '', null, '', '', '', '', '', 0]);
    assert.equal(result.total, 1);
    assert.equal(result.rows[0].user_id, ids.volunteer);
    assert.equal((await rows('select user_id from public.volunteer_profiles where user_id=$1', [ids.volunteer])).length, 1);

    await call('set_survey_assignment', [project, ids.volunteer, false]);
    result = await call('search_volunteers', [org, '', null, '', '', '', '', '', 0]);
    assert.equal(result.total, 0);
    assert.equal((await rows('select user_id from public.volunteer_profiles where user_id=$1', [ids.volunteer])).length, 0);
  });

  await ok('auth explicitly offers Volunteer Partner NGO and POEM staff destinations', async () => {
    const auth = readFileSync('src/features/auth/Auth.tsx', 'utf8');
    const intent = readFileSync('src/features/auth/entryIntent.ts', 'utf8');
    assert.match(auth, /Sign in as Partner NGO/);
    assert.match(auth, /Sign in as volunteer/i);
    assert.match(auth, /POEM staff/);
    assert.match(auth, /one personal POEM account/i);
    assert.match(intent, /poem-workspace-entry-intent/);
    assert.match(intent, /consumeWorkspaceEntryIntent/);
  });

  await ok('volunteer profile no longer exposes permanent NGO profile access controls', async () => {
    const shell = readFileSync('src/app/AppShell.tsx', 'utf8');
    assert.doesNotMatch(shell, /NGO profile access/);
    assert.doesNotMatch(shell, /Allow profile access/);
    assert.doesNotMatch(shell, /set_profile_sharing/);
    assert.doesNotMatch(shell, /from\("profile_shares"\)/);
    assert.match(shell, /My Volunteer Workspace/);
    assert.match(shell, /NGO Workspace/);
    assert.match(shell, /consumeWorkspaceEntryIntent/);
  });

  await ok('approved application provides a direct Open NGO workspace handoff', async () => {
    const application = readFileSync('src/features/organizations/PartnerNgoApplication.tsx', 'utf8');
    const shell = readFileSync('src/app/AppShell.tsx', 'utf8');
    assert.match(application, /Open NGO workspace/);
    assert.match(application, /onOpenOrganization/);
    assert.match(shell, /onOpenOrganization/);
    assert.match(shell, /Partner NGO application/);
  });

  await ok('profile sharing remains only a compatibility surface outside current UI', async () => {
    const migration = readFileSync('supabase/migrations/20261006000100_ngo_access_auth_stabilization.sql', 'utf8');
    assert.match(migration, /truncate table public\.profile_shares/);
    assert.match(migration, /ngo_scoped_profile_access/);
    assert.match(migration, /assignment_scoped/);
    assert.doesNotMatch(migration, /sharing with the project NGO/);
  });

  console.log(`\n${passed} POEM 2.13.1 NGO access/auth stabilization scenarios passed.`);
} finally {
  await db.close();
}
