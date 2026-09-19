import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super', 'manager', 'ngo', 'local', 'outside', 'late', 'draft'].map((n, i) => [
    n,
    `92400000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
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
const deny = (fn, re = /required|permission|closed|expired|exists|changed|active|verification|available|consent|published/i) =>
  assert.rejects(fn, re);
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
  const org = await call('save_organization', [null, { name: 'Recruitment NGO', status: 'active' }]);
  await call('set_membership', [org, ids.ngo, 'ngo_admin', 'active']);

  // Valid hierarchy: province -> division -> district -> taluka. This intentionally catches the bad
  // direct province -> district fixture that existed in the first unshipped 2.12.4 draft.
  const province = await call('save_geography', [null, null, 'province', 'Recruit Province', 'RCP', 'Fixture', true]);
  const localDivision = await call('save_geography', [null, province, 'division', 'Recruit Division', 'RDV', 'Fixture', true]);
  const localDistrict = await call('save_geography', [null, localDivision, 'district', 'Recruit District', 'RCD', 'Fixture', true]);
  const localTaluka = await call('save_geography', [null, localDistrict, 'taluka', 'Recruit Taluka', 'RCT', 'Fixture', true]);
  const outsideDivision = await call('save_geography', [null, province, 'division', 'Outside Division', 'ODV', 'Fixture', true]);
  const outsideDistrict = await call('save_geography', [null, outsideDivision, 'district', 'Outside District', 'OCD', 'Fixture', true]);
  const outsideTaluka = await call('save_geography', [null, outsideDistrict, 'taluka', 'Outside Taluka', 'OCT', 'Fixture', true]);

  const template = await call('publish_survey_template', [
    'Recruitment stabilization survey',
    [{ id: 'q', label: 'Question', type: 'text', required: true }],
  ]);
  const d = (
    await rows(
      "select ((now() at time zone 'UTC')::date)::text today,((now() at time zone 'UTC')::date+1)::text opportunity_start,((now() at time zone 'UTC')::date+14)::text end_date,((now() at time zone 'UTC')::date+30)::text after_end,(now()+interval '1 hour')::text reply_by,(now()+interval '365 days')::text expiry",
    )
  )[0];
  const project = await call('create_survey_project', [
    org,
    'Recruitment Stabilization Project',
    template,
    localDistrict,
    100,
    d.today,
    d.end_date,
    'Test recruitment authorization and activation',
    'recruitment-v1',
    'I consent to collection for this synthetic recruitment test survey.',
  ]);

  // Registration number is part of the independent organization verification subject.
  await db.exec('RESET ROLE');
  await db.query("update public.organizations set registration_number='REC-TEST-001' where id=$1", [org]);
  const details = (name, area) => ({
    full_name: name,
    phone: '03001234567',
    area,
    education: 'Graduate',
    skills: 'Data Collection, Community Survey',
    languages: 'Sindhi, Urdu',
    experience: 'Field survey experience',
    availability: 'Full time',
    preference: 'Education surveys',
    transport: 'Motorbike',
    smartphone: 'Yes',
    preferred_areas: area,
    bio: 'Synthetic recruitment test volunteer',
    address: 'PRIVATE FULL ADDRESS MUST NOT BE SNAPSHOTTED',
    references: 'PRIVATE REFERENCES MUST NOT BE SNAPSHOTTED',
  });
  for (const [name, geo, status] of [
    ['local', localTaluka, 'verified'],
    ['late', localTaluka, 'verified'],
    ['outside', outsideTaluka, 'verified'],
    ['draft', localTaluka, 'pending'],
  ]) {
    await db.query('update public.volunteer_profiles set status=$1,geography_id=$2,details=$3 where user_id=$4', [
      status,
      geo,
      details(`${name} volunteer`, name === 'outside' ? 'Outside Taluka' : 'Recruit Taluka'),
      ids[name],
    ]);
  }

  await as('manager');
  assert.equal(
    await call('publish_project_policy', [
      project,
      0,
      365,
      'none',
      true,
      true,
      false,
      'Require independent NGO and volunteer verification before activation',
    ]),
    1,
  );

  let legacyOpportunity;
  await ok('legacy project opportunities remain invitation-only and closed to open recruitment', async () => {
    await as('ngo');
    legacyOpportunity = await call('create_project_opportunity', [
      project,
      'Legacy direct opportunity',
      'Existing invitation workflow must remain private by default.',
      localDistrict,
      d.opportunity_start,
      d.end_date,
      d.reply_by,
      'unpaid',
      '',
      1,
      '',
      '',
    ]);
    const o = (await rows('select visibility,publication_state,applications_open from public.work_opportunities where id=$1', [legacyOpportunity]))[0];
    assert.equal(o.visibility, 'invite_only');
    assert.equal(o.publication_state, 'published');
    assert.equal(o.applications_open, false);
    await as('local');
    const found = await call('available_work_opportunities', [0, null, null, null, '', null, null]);
    assert.equal(found.rows.some((x) => x.id === legacyOpportunity), false);
  });

  let areaOpportunity;
  await ok('NGO publishes area recruitment without permanent profile-sharing grants', async () => {
    await as('ngo');
    areaOpportunity = await call('create_recruitment_opportunity', [
      project,
      'Local field recruitment',
      'Collect household surveys throughout the selected district.',
      localDistrict,
      d.opportunity_start,
      d.end_date,
      d.reply_by,
      'unpaid',
      '',
      3,
      'Data Collection',
      'Sindhi',
      'area',
      'Registered district or descendant Taluka required.',
      true,
    ]);
    assert(areaOpportunity);
    assert.equal((await rows('select count(*)::int c from public.profile_shares'))[0].c, 0);
  });

  await ok('public recruitment is visible independent of residence and profile-sharing grants', async () => {
    await as('local');
    let r = await call('available_work_opportunities', [0, null, null, null, '', null, null]);
    let row = r.rows.find((x) => x.id === areaOpportunity);
    assert(row);
    assert.equal(row.area_match, true);
    assert.equal(row.can_apply, true);

    await as('outside');
    r = await call('available_work_opportunities', [0, null, null, null, '', null, null]);
    row = r.rows.find((x) => x.id === areaOpportunity);
    assert(row);
    assert.equal(row.area_match, false);
    assert.equal(row.can_apply, true);
    assert.match(row.eligibility_reason, /outside your current profile location/i);

    await as('draft');
    r = await call('available_work_opportunities', [0, null, null, null, '', null, null]);
    row = r.rows.find((x) => x.id === areaOpportunity);
    assert(row);
    assert.equal(row.can_apply, false);
    assert.match(row.eligibility_reason, /publish an active volunteer profile/i);
    assert.equal((await rows('select count(*)::int c from public.profile_shares'))[0].c, 0);
  });

  let localApplication;
  await ok('application stores bounded consent snapshot and grants no project/profile access', async () => {
    await as('local');
    localApplication = await call('apply_work_opportunity', [
      areaOpportunity,
      'Available throughout the listed dates',
      'Interested in local field work.',
      true,
    ]);
    const a = (await rows('select * from public.work_applications where id=$1', [localApplication]))[0];
    assert.equal(a.profile_share_consent, true);
    assert.equal(typeof a.profile_snapshot.full_name, 'string');
    assert(a.profile_snapshot.full_name.length > 0);
    assert.equal(a.profile_snapshot.profile_publication_status, 'active');
    assert.equal(a.profile_snapshot.address, undefined);
    assert.equal(a.profile_snapshot.references, undefined);
    assert.equal((await rows('select count(*)::int c from public.profile_shares where user_id=$1 and organization_id=$2', [ids.local, org]))[0].c, 0);
    assert.equal((await rows('select count(*)::int c from public.survey_assignments where project_id=$1 and user_id=$2 and active', [project, ids.local]))[0].c, 0);
    assert.equal((await rows('select id from public.survey_projects where id=$1', [project])).length, 0);
    assert.equal((await rows('select id from public.work_opportunities where id=$1', [areaOpportunity])).length, 0);
  });

  await ok('duplicate active application and missing consent are rejected', async () => {
    await as('local');
    await deny(() => call('apply_work_opportunity', [areaOpportunity, 'Available', 'Duplicate', true]), /exists/i);
    await as('late');
    await deny(() => call('apply_work_opportunity', [areaOpportunity, 'Available', 'No consent', false]), /consent/i);
  });

  await ok('closing applications preserves received applications and stale admin reviews conflict', async () => {
    await as('ngo');
    let o = (await rows('select * from public.work_opportunities where id=$1', [areaOpportunity]))[0];
    const oldOpportunityVersion = o.version;
    await call('set_work_opportunity_state', [areaOpportunity, 'closed', oldOpportunityVersion]);
    let a = (await rows('select * from public.work_applications where id=$1', [localApplication]))[0];
    assert.equal(a.status, 'pending');
    const staleApplicationVersion = a.version;
    await call('review_work_application', [localApplication, 'shortlisted', 'Strong local candidate for review.', a.version]);
    await as('manager');
    await deny(() => call('review_work_application', [localApplication, 'rejected', 'Stale concurrent decision.', staleApplicationVersion]), /changed/i);
    await as('late');
    await deny(() => call('apply_work_opportunity', [areaOpportunity, 'Available', 'Applications are closed', true]), /open|published|required/i);
    await as('ngo');
    await deny(() => call('set_work_opportunity_state', [areaOpportunity, 'published', oldOpportunityVersion]), /changed/i);
    o = (await rows('select * from public.work_opportunities where id=$1', [areaOpportunity]))[0];
    await call('set_work_opportunity_state', [areaOpportunity, 'published', o.version]);
  });

  await ok('withdrawn application can reuse the same row after reopen without creating a duplicate', async () => {
    await as('late');
    const first = await call('apply_work_opportunity', [areaOpportunity, 'Available', 'First application.', true]);
    let a = (await rows('select * from public.work_applications where id=$1', [first]))[0];
    await call('withdraw_work_application', [first, a.version]);
    const second = await call('apply_work_opportunity', [areaOpportunity, 'Available again', 'Re-applied after withdrawal.', true]);
    assert.equal(second, first);
    assert.equal((await rows('select count(*)::int c from public.work_applications where opportunity_id=$1 and user_id=$2', [areaOpportunity, ids.late]))[0].c, 1);
  });

  let allOpportunity;
  let outsideApplication;
  await ok('POEM survey manager can publish all-volunteer recruitment and outside volunteer can apply', async () => {
    await as('manager');

    const compensation = await call('project_compensation_status', [project]);

    await call('set_project_compensation_defaults', [
      project,
      'paid',
      'per_verified_survey',
      'PKR',
      120.25,
      'PKR 120.25 per independently approved survey',
      'Configure structured compensation for the historical paid recruitment scenario',
      compensation.version,
    ]);

    allOpportunity = await call('create_recruitment_opportunity', [
      project,
      'Open statewide interest opportunity',
      'Recruit suitable volunteers regardless of their registered home district.',
      localDistrict,
      d.opportunity_start,
      d.end_date,
      d.reply_by,
      'paid',
      'PKR 120.25 per accepted survey after formal offer',
      2,
      'Data Collection',
      'Sindhi',
      'all',
      'Travel to the project district is the volunteer responsibility.',
      true,
    ]);
    assert.equal((await rows('select id from public.work_opportunities where id=$1', [allOpportunity])).length, 1);
    await as('outside');
    const r = await call('available_work_opportunities', [0, org, null, 'paid', 'Data', d.opportunity_start, null]);
    const row = r.rows.find((x) => x.id === allOpportunity);
    assert(row);
    assert.equal(row.can_apply, true);
    outsideApplication = await call('apply_work_opportunity', [allOpportunity, 'Available and willing to travel', 'Interested in this assignment.', true]);
  });

  await ok('current independent-verification policy blocks selection before evidence review', async () => {
    await as('manager');
    const a = (await rows('select * from public.work_applications where id=$1', [outsideApplication]))[0];
    await deny(
      () => call('review_work_application', [outsideApplication, 'selected', 'Selection should be gated.', a.version]),
      /verification/i,
    );
  });

  let orgCase;
  let outsideCase;
  await ok('independent organization and volunteer reviews unlock selection', async () => {
    await as('ngo');
    orgCase = await call('request_independent_verification', [
      'organization',
      org,
      'Private registration evidence ORG-REC-1',
      'Request independent organization review for recruitment',
    ]);
    await as('outside');
    outsideCase = await call('request_independent_verification', [
      'volunteer',
      ids.outside,
      'Private identity evidence VOL-REC-1',
      'Request independent volunteer identity review',
    ]);
    await as('super');
    await call('review_independent_verification', [orgCase, 'verified', 'issuer_check', 'Registration independently confirmed.', d.expiry, 1]);
    await call('review_independent_verification', [outsideCase, 'verified', 'in_person_check', 'Volunteer identity independently confirmed.', d.expiry, 1]);
    await as('manager');
    const a = (await rows('select * from public.work_applications where id=$1', [outsideApplication]))[0];
    await call('review_work_application', [outsideApplication, 'selected', 'Verified and selected for a formal offer.', a.version]);
  });

  let assignment;
  await ok('out-of-area all-volunteer selection can be offered and exact retries are idempotent', async () => {
    await as('manager');
    assignment = await call('create_work_assignment', [
      project,
      ids.outside,
      'application',
      outsideApplication,
      'paid',
      'per_verified_survey',
      'PKR',
      120.25,
      25,
      d.today,
      d.end_date,
      'Complete up to 25 accepted surveys under project consent and quality rules.',
    ]);
    const replay = await call('create_work_assignment', [
      project,
      ids.outside,
      'application',
      outsideApplication,
      'paid',
      'per_verified_survey',
      'PKR',
      120.25,
      25,
      d.today,
      d.end_date,
      'Complete up to 25 accepted surveys under project consent and quality rules.',
    ]);
    assert.equal(replay, assignment);
    assert.equal((await rows('select count(*)::int c from public.work_assignments where survey_project_id=$1 and user_id=$2', [project, ids.outside]))[0].c, 1);
    assert.equal((await rows('select count(*)::int c from public.survey_assignments where project_id=$1 and user_id=$2 and active', [project, ids.outside]))[0].c, 0);
  });

  await ok('acceptance rechecks governance and retry cannot duplicate survey access', async () => {
    await as('super');
    await call('review_independent_verification', [outsideCase, 'revoked', 'in_person_check', 'Verification revoked for retry test.', d.expiry, 2]);
    await as('outside');
    let w = (await rows('select * from public.work_assignments where id=$1', [assignment]))[0];
    await deny(() => call('respond_work_assignment', [assignment, 'accepted', w.version]), /verification/i);
    const fresh = await call('request_independent_verification', [
      'volunteer',
      ids.outside,
      'Private identity evidence VOL-REC-2',
      'Fresh volunteer verification after revocation',
    ]);
    await as('super');
    await call('review_independent_verification', [fresh, 'verified', 'document_review', 'Fresh evidence independently reviewed.', d.expiry, 1]);
    await as('outside');
    w = (await rows('select * from public.work_assignments where id=$1', [assignment]))[0];
    const offeredVersion = w.version;
    await call('respond_work_assignment', [assignment, 'accepted', offeredVersion]);
    await call('respond_work_assignment', [assignment, 'accepted', offeredVersion]);
    assert.equal((await rows('select count(*)::int c from public.survey_assignments where project_id=$1 and user_id=$2 and active', [project, ids.outside]))[0].c, 1);
  });

  await ok('direct survey assignment remains available but now obeys current verification policy', async () => {
    await as('local');
    await call('set_profile_sharing', [org, true]);
    await as('ngo');
    await deny(() => call('set_survey_assignment', [project, ids.local, true]), /verification/i);
    await as('local');
    const localCase = await call('request_independent_verification', [
      'volunteer',
      ids.local,
      'Private identity evidence VOL-LOCAL-1',
      'Request independent local volunteer review',
    ]);
    await as('super');
    await call('review_independent_verification', [localCase, 'verified', 'document_review', 'Local volunteer evidence independently reviewed.', d.expiry, 1]);
    await as('ngo');
    await call('set_survey_assignment', [project, ids.local, true]);
    assert.equal((await rows('select count(*)::int c from public.survey_assignments where project_id=$1 and user_id=$2 and active', [project, ids.local]))[0].c, 1);
  });

  await ok('work-date/deadline filtering and safe direct table RLS behave as intended', async () => {
    await as('late');
    let r = await call('available_work_opportunities', [0, null, localDistrict, null, '', d.after_end, null]);
    assert.equal(r.total, 0);
    r = await call('available_work_opportunities', [0, org, localDistrict, null, 'Collection', d.opportunity_start, d.end_date]);
    assert(r.total >= 1);
    assert.equal((await rows('select * from public.work_opportunities')).length, 0);
  });

  await ok('UI source exposes split volunteer navigation, hierarchical filters, pagination and direct assignments', async () => {
    const shell = readFileSync(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
    const workforce = readFileSync(new URL('../src/features/workforce/WorkforceMarketplace.tsx', import.meta.url), 'utf8');
    const invitations = readFileSync(new URL('../src/features/workforce/InvitationsPanel.tsx', import.meta.url), 'utf8');
    for (const label of ['Available Opportunities', 'My Applications', 'My Assigned Surveys']) assert(shell.includes(label));
    assert(workforce.includes('AreaSelector'));
    assert(workforce.includes('availablePage'));
    assert(workforce.includes('.from("survey_assignments")'));
    assert(workforce.includes('if (ok) setApplying(null)'));
    assert(workforce.includes('Existing applications remain reviewable'));
    assert(workforce.includes('{mode === "personal" && ('));
    assert(workforce.includes('Open to all active volunteers'));
    assert(!workforce.includes('// ...existing code...'));
    assert.equal((workforce.match(/<h3>Find active volunteers<\/h3>/g) || []).length, 1);
    assert(invitations.includes('.is("survey_project_id", null)'));
  });

  await ok('audit and recruitment notifications are retained', async () => {
    await db.exec('RESET ROLE');
    assert((await rows("select count(*)::int c from public.audit_events where action in ('recruitment_opportunity_created','recruitment_state_changed','work_application_submitted','work_application_reviewed','work_assignment_offered','work_assignment_responded')"))[0].c >= 6);
    assert((await rows("select count(*)::int c from public.notifications where title in ('New volunteer application','Application selected','Project assignment offer','Survey assignment updated')"))[0].c >= 3);
  });

  await as(null);
  await ok('anonymous opportunity search and application are denied', async () => {
    await deny(() => call('available_work_opportunities', [0, null, null, null, '', null, null]));
    await deny(() => call('apply_work_opportunity', [areaOpportunity, 'Available', 'Anonymous', true]));
  });

  console.log(`\n${passed} POEM 2.12.4/2.12.5 recruitment compatibility scenarios passed.`);
} finally {
  await db.close();
}
