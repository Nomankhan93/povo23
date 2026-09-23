import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super', 'manager', 'ngo', 'volA', 'volB'].map((name, i) => [
    name,
    `92500000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  ]),
);
const rows = async (q, p = []) => (await db.query(q, p)).rows;
async function as(name) {
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] || '']);
  await db.exec(`SET ROLE ${name ? 'authenticated' : 'anon'}`);
}
async function call(name, args) {
  return (await rows(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args))[0].result;
}
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
const deny = (fn, re = /required|permission|resolve|stale|changed|review/i) => assert.rejects(fn, re);

try {
  for (const [name, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${name}@example.test`]);
  }
  await db.query("update public.accounts set platform_role='super_admin' where id=$1", [ids.super]);
  await as('super');
  await call('set_account_access', [ids.manager, 'survey_manager', 'active']);
  const org = await call('save_organization', [null, { name: '2.12.5 Stabilization NGO', status: 'active' }]);
  await call('set_membership', [org, ids.ngo, 'ngo_admin', 'active']);

  const province = await call('save_geography', [null, null, 'province', 'Stabilization Province', 'S25P', 'Fixture', true]);
  const division = await call('save_geography', [null, province, 'division', 'Stabilization Division', 'S25D', 'Fixture', true]);
  const district = await call('save_geography', [null, division, 'district', 'Stabilization District', 'S25X', 'Fixture', true]);
  const taluka = await call('save_geography', [null, district, 'taluka', 'Stabilization Taluka', 'S25T', 'Fixture', true]);

  await db.exec('RESET ROLE');
  for (const [id, name] of [[ids.volA, 'Volunteer Alpha'], [ids.volB, 'Volunteer Beta']]) {
    await db.query(
      "update public.volunteer_profiles set status='verified',geography_id=$1,details=$2,version=version+1 where user_id=$3",
      [taluka, { full_name: name, skills: 'Data Collection', languages: 'Urdu', availability: 'Full time' }, id],
    );
  }

  const dates = (await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+10)::text finish,((now() at time zone 'UTC')::date)::text today,(now()+interval '30 days')::text expiry"))[0];

  await ok('volunteer verification survives non-identity CV edits but not identity-name changes', async () => {
    await as('volA');
    const verification = await call('request_independent_verification', [
      'volunteer',
      ids.volA,
      'Synthetic identity evidence VOL-A',
      'Review volunteer identity for stabilization test',
    ]);
    await as('super');
    await call('review_independent_verification', [verification, 'verified', 'in_person_check', 'Identity checked independently', dates.expiry, 1]);

    await db.exec('RESET ROLE');
    await db.query("update public.volunteer_profiles set details=jsonb_set(details,'{availability}',to_jsonb('Weekends'::text)),version=version+1 where user_id=$1", [ids.volA]);
    await as('volA');
    let item = (await call('list_independent_verifications', ['volunteer', 0, 25])).rows.find((v) => v.id === verification);
    assert.equal(item.effective_status, 'verified');

    await db.exec('RESET ROLE');
    await db.query("update public.volunteer_profiles set details=jsonb_set(details,'{full_name}',to_jsonb('Volunteer Alpha Corrected'::text)),version=version+1 where user_id=$1", [ids.volA]);
    await as('volA');
    item = (await call('list_independent_verifications', ['volunteer', 0, 25])).rows.find((v) => v.id === verification);
    assert.equal(item.effective_status, 'stale');
  });

  const template = await (async () => {
    await as('manager');
    return call('publish_survey_template', ['2.12.5 canonical fixture', [{ id: 'q', label: 'Question', type: 'text', required: true }]]);
  })();
  await as('manager');
  const projectA = await call('create_survey_project', [
    org,
    'Canonical Project A',
    template,
    district,
    20,
    dates.start,
    dates.finish,
    'Canonical stabilization A',
    's25-a',
    'Guardian consent notice for canonical stabilization project A.',
  ]);
  const projectB = await call('create_survey_project', [
    org,
    'Canonical Project B',
    template,
    district,
    20,
    dates.start,
    dates.finish,
    'Canonical stabilization B',
    's25-b',
    'Guardian consent notice for canonical stabilization project B.',
  ]);

  // These are legacy/direct assignments used only to create canonical test data.
  // Open recruitment opportunities do NOT require permanent profile sharing.
  await as('volA');
  await call('set_profile_sharing', [org, true]);
  await as('volB');
  await call('set_profile_sharing', [org, true]);

  await as('ngo');
  await call('set_survey_assignment', [projectA, ids.volA, true]);
  await call('set_survey_assignment', [projectB, ids.volB, true]);

  async function save(who, project, name) {
    await as(who);
    return call('save_survey_response', [
      null,
      project,
      null,
      null,
      name,
      '2012-01-01',
      `Household ${name}`,
      { q: 'Answer' },
      { agreed: true, method: 'verbal', representative: 'Guardian', relationship: 'Guardian' },
      true,
      0,
      crypto.randomUUID(),
    ]);
  }

  const responseA = await save('volA', projectA, 'Canonical Child');
  const responseB = await save('volB', projectB, 'Canonical Child');
  await as('ngo');
  await call('review_survey_response', [responseA, 'approved', 'Approved response A', 1]);
  await call('review_survey_response', [responseB, 'approved', 'Approved response B', 1]);
  await db.exec('RESET ROLE');
  const personA = (await rows('select * from public.registry_persons where project_id=$1', [projectA]))[0];
  const personB = (await rows('select * from public.registry_persons where project_id=$1', [projectB]))[0];

  await ok('canonical reconciliation refuses unresolved match decisions', async () => {
    await as('manager');
    await call('review_canonical_match', [personA.id, personB.id, 'needs_review', 'Evidence conflict requires operator review', personA.version, personB.version, 0]);
    let canonical = await call('canonical_person_summary', [personA.id]);
    await deny(
      () => call('reconcile_canonical_identity', [personA.id, personA.version, canonical.version, 'Choose source A before resolving pair']),
      /resolve unresolved|stale canonical match/i,
    );

    await call('review_canonical_match', [personA.id, personB.id, 'different_people', 'Source evidence confirms two different people', personA.version, personB.version, 1]);
    canonical = await call('canonical_person_summary', [personA.id]);
    await call('reconcile_canonical_identity', [personA.id, personA.version, canonical.version, 'Source A remains authoritative after pair review']);
    canonical = await call('canonical_person_summary', [personA.id]);
    assert.equal(canonical.review_required, false);
  });

  await ok('workforce component preserves Field Worker marketplace navigation and recruitment UX', async () => {
    const shell = readFileSync(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../src/features/workforce/WorkforceMarketplace.tsx', import.meta.url), 'utf8');

    for (const label of ['Available Opportunities', 'My Applications', 'My Assigned Surveys']) {
      assert(shell.includes(label), `missing Field Worker navigation label: ${label}`);
    }

    for (const marker of [
      'Available projects',
      'My applications',
      'My assigned surveys',
      '{mode === "personal" ? (',
      'automatic all-Field-Workers marketplace listing',
    ]) {
      assert(source.includes(marker), `missing marketplace UI marker: ${marker}`);
    }

    assert.equal(source.includes('// ...existing code...'), false);
    assert.equal((source.match(/<h3>Find Field Workers<\/h3>/g) || []).length, 1);
    assert.equal((source.match(/<h3>Recruitment listings<\/h3>/g) || []).length, 1);
  });

  await ok('every public application table retains RLS', async () => {
    await db.exec('RESET ROLE');
    const unprotected = await rows("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");
    assert.deepEqual(unprotected, []);
  });

  console.log(`\n${passed} POEM 2.12.5 current-state stabilization scenarios passed.`);
} finally {
  await db.close();
}
