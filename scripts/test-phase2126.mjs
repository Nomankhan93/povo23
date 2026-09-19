import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super', 'manager', 'ngo', 'vol', 'other'].map((n, i) => [
    n,
    `92600000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  ]),
);
const rows = async (q, p = []) => (await db.query(q, p)).rows;
async function as(name) {
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] || '']);
  await db.exec(`SET ROLE ${name ? 'authenticated' : 'anon'}`);
}
async function call(name, args) {
  const actual = name === 'save_survey_response' ? [...args, crypto.randomUUID()] : args;
  return (
    await rows(
      `select public.${name}(${actual.map((_, i) => '$' + (i + 1)).join(',')}) result`,
      actual,
    )
  )[0].result;
}
const deny = (fn, re = /required|permission|access|unavailable|active/i) => assert.rejects(fn, re);
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  for (const [name, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${name}@example.test`]);
  }
  await db.query("update public.accounts set platform_role='super_admin' where id=$1", [ids.super]);
  await as('super');
  await call('set_account_access', [ids.manager, 'survey_manager', 'active']);
  const org = await call('save_organization', [null, { name: 'Verified Work NGO', status: 'active' }]);
  await call('set_membership', [org, ids.ngo, 'ngo_admin', 'active']);

  const province = await call('save_geography', [null, null, 'province', 'Work Province', 'WXP', 'Fixture', true]);
  const division = await call('save_geography', [null, province, 'division', 'Work Division', 'WXD', 'Fixture', true]);
  const district = await call('save_geography', [null, division, 'district', 'Work District', 'WXC', 'Fixture', true]);
  const taluka = await call('save_geography', [null, district, 'taluka', 'Work Taluka', 'WXT', 'Fixture', true]);

  await db.exec('RESET ROLE');
  await db.query(
    "update public.volunteer_profiles set status='verified',geography_id=$1,details=$2 where user_id=$3",
    [
      taluka,
      {
        full_name: 'Platform Surveyor',
        phone: '03001234567',
        area: 'Work Taluka',
        education: 'Graduate',
        skills: 'Data Collection, Household Survey',
        languages: 'Urdu, Sindhi',
        availability: 'Full time',
      },
      ids.vol,
    ],
  );
  await db.query(
    "update public.volunteer_profiles set status='verified',geography_id=$1,details=$2 where user_id=$3",
    [taluka, { full_name: 'Unrelated Volunteer', area: 'Work Taluka' }, ids.other],
  );

  await as('vol');
  await call('set_profile_sharing', [org, true]);

  await as('manager');
  const template = await call('publish_survey_template', [
    'Orphan household assessment',
    [{ id: 'need', label: 'Primary need', type: 'text', required: true }],
  ]);
  const d = (
    await rows(
      "select ((now() at time zone 'UTC')::date-1)::text project_start,((now() at time zone 'UTC')::date)::text today,((now() at time zone 'UTC')::date+14)::text end_date,(((now() at time zone 'UTC')::date + interval '23 hours'))::timestamptz::text reply_by",
    )
  )[0];
  const project = await call('create_survey_project', [
    org,
    'Umerkot Orphan Household Survey',
    template,
    district,
    100,
    d.project_start,
    d.end_date,
    'Assess orphan household needs and field conditions',
    'work-v1',
    'I consent to collection for this synthetic work-experience survey test.',
  ]);

  await as('ngo');
  await call('set_survey_assignment', [project, ids.vol, true]);

  await ok('active POEM assignment appears automatically before the first survey', async () => {
    await as('vol');
    const history = await call('work_experience_history', [ids.vol, 0]);
    assert.equal(history.total, 1);
    const x = history.rows[0];
    assert.equal(x.organization_name, 'Verified Work NGO');
    assert.equal(x.project_title, 'Umerkot Orphan Household Survey');
    assert.equal(x.field_label, 'Orphan household assessment');
    assert.equal(x.project_area, 'Work District');
    assert.equal(x.workflow_status, 'in_progress');
    assert.equal(x.verified, false);
    assert.equal(x.approved_surveys, 0);
  });

  const consent = { agreed: true, method: 'verbal', representative: 'Guardian Test', relationship: 'Guardian' };
  const response = await call('save_survey_response', [
    null,
    project,
    null,
    null,
    'Child One',
    '2018-01-01',
    'Household One',
    { need: 'Education support' },
    consent,
    true,
    0,
  ]);

  await ok('submitted survey updates POEM work metrics without a manual experience entry', async () => {
    await as('vol');
    const history = await call('work_experience_history', [ids.vol, 0]);
    const x = history.rows[0];
    assert.equal(x.submitted_surveys, 1);
    assert.equal(x.pending_review_surveys, 1);
    assert.equal(x.approved_surveys, 0);
    assert.equal((await rows('select count(*)::int c from public.volunteer_experiences where user_id=$1', [ids.vol]))[0].c, 0);
  });

  await as('ngo');
  await call('review_survey_response', [response, 'approved', 'Accepted field response', 1]);

  await ok('approved survey automatically becomes verified POEM work evidence', async () => {
    await as('vol');
    const history = await call('work_experience_history', [ids.vol, 0]);
    const x = history.rows[0];
    assert.equal(x.approved_surveys, 1);
    assert.equal(x.pending_review_surveys, 0);
    assert.equal(x.reviewed_surveys, 1);
    assert.equal(x.verified, true);
    assert.equal(x.verification_basis, 'approved_surveys');
    assert.deepEqual(x.field_areas, ['Work District']);
  });

  await ok('platform work privacy follows active project relationship rather than permanent profile sharing', async () => {
    await as('other');
    await deny(
      () => call('work_experience_history', [ids.vol, 0]),
      /Profile access required/i
    );

    await as('ngo');
    let shared = await call('work_experience_history', [ids.vol, 0]);
    assert.equal(shared.rows.length, 1);
    assert.equal(shared.rows[0].verified, true);

    // Legacy permanent sharing is no longer the access gate.
    // The active project assignment itself provides scoped NGO access.
    await as('vol');
    await call('set_profile_sharing', [org, false]);

    await as('ngo');
    shared = await call('work_experience_history', [ids.vol, 0]);
    assert.equal(shared.rows.length, 1);
    assert.equal(shared.rows[0].verified, true);
  });

  await ok('external experience remains a separate volunteer-controlled workflow', async () => {
    await as('vol');
    const manual = await call('save_experience', [
      null,
      org,
      'Community Volunteer',
      '2026-01-01',
      '2026-02-01',
      'Previous community field work outside the POEM project workflow.',
      false,
      0,
    ]);
    assert(manual);
    assert.equal((await rows('select count(*)::int c from public.volunteer_experiences where user_id=$1', [ids.vol]))[0].c, 1);
    const history = await call('work_experience_history', [ids.vol, 0]);
    assert.equal(history.total, 1);
  });

  await ok('closed survey project finalizes the automatic project history', async () => {
    await as('manager');
    await call('close_survey_project', [project]);
    await as('vol');
    const history = await call('work_experience_history', [ids.vol, 0]);
    const x = history.rows[0];
    assert.equal(x.workflow_status, 'completed');
    assert.equal(x.verified, true);
    assert(x.end_date);
  });

  await ok('recruitment consent snapshot includes bounded POEM-verified work without permanent sharing', async () => {
    await db.exec('RESET ROLE');
    await db.query("update public.accounts set full_name='' where id=$1", [ids.vol]);
    await as('manager');
    const nextProject = await call('create_survey_project', [
      org,
      'Follow-up Household Survey',
      template,
      district,
      50,
      d.project_start,
      d.end_date,
      'Collect follow-up household information for recruitment testing',
      'work-v2',
      'I consent to collection for this synthetic follow-up recruitment test.',
    ]);
    await as('ngo');
    const opportunity = await call('create_recruitment_opportunity', [
      nextProject,
      'Follow-up enumerator',
      'Collect follow-up household records in the project field area.',
      district,
      d.today,
      d.end_date,
      d.reply_by,
      'unpaid',
      '',
      2,
      'Data Collection',
      'Urdu',
      'all',
      'Previous POEM field experience is useful.',
      true,
    ]);
    await as('vol');
    const application = await call('apply_work_opportunity', [opportunity, 'Full time', 'Experienced POEM field surveyor.', true]);
    await db.exec('RESET ROLE');
    const a = (await rows('select profile_snapshot from public.work_applications where id=$1', [application]))[0];
    assert.equal(a.profile_snapshot.full_name, 'Platform Surveyor');
    assert.equal(a.profile_snapshot.poem_verified_work_count, 1);
    assert.equal(a.profile_snapshot.poem_verified_work[0].project_title, 'Umerkot Orphan Household Survey');
    assert.equal(a.profile_snapshot.poem_verified_work[0].approved_surveys, 1);
    assert.equal((await rows('select count(*)::int c from public.profile_shares where user_id=$1 and organization_id=$2', [ids.vol, org]))[0].c, 0);
  });

  await ok('work experience UI separates automatic POEM history from previous experience', async () => {
    const source = readFileSync('src/features/volunteers/ExperiencePanel.tsx', 'utf8');
    assert.match(source, /FieldLance verified work/);
    assert.match(source, /work_experience_history/);
    assert.match(source, /Previous \/ external experience/);
    assert.match(source, /Add previous experience/);
  });

  await as(null);
  await ok('anonymous caller cannot read automatic work history', async () => {
    await deny(() => call('work_experience_history', [ids.vol, 0]));
  });

  console.log(`\n${passed} POEM 2.12.6 automatic verified work-experience scenarios passed.`);
} finally {
  await db.close();
}
