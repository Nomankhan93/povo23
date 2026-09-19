import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super', 'manager', 'applicant', 'outsider'].map((n, i) => [
    n,
    `93000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
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
const deny = (fn, re = /required|permission|access|application|submitted|document|review|active|complete/i) =>
  assert.rejects(fn, re);
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
  await call('set_account_access', [ids.manager, 'ngo_manager', 'active']);

  const province = await call('save_geography', [null, null, 'province', 'Partner Province', 'PNP', 'Fixture', true]);
  const division = await call('save_geography', [null, province, 'division', 'Partner Division', 'PND', 'Fixture', true]);
  const district = await call('save_geography', [null, division, 'district', 'Partner District', 'PNC', 'Fixture', true]);
  const taluka = await call('save_geography', [null, district, 'taluka', 'Partner Taluka', 'PNT', 'Fixture', true]);

  let application;
  await ok('representative starts an incomplete private NGO application from a personal account', async () => {
    await as('applicant');
    application = await call('save_partner_ngo_application', [
      null,
      {
        organization_name: 'Community Impact Foundation',
        representative_name: 'Applicant Account',
        email: 'ngo@example.test',
      },
      [],
      [],
      0,
    ]);
    assert(application);
    const mine = await rows('select * from public.partner_ngo_applications where id=$1', [application]);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'draft');
    assert.equal(mine[0].applicant_user_id, ids.applicant);
  });

  await ok('draft cannot submit until organization details, areas, programs and legal proof are complete', async () => {
    await as('applicant');
    const a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await deny(() => call('submit_partner_ngo_application', [application, a.version]), /complete|proof/i);
    await call('save_partner_ngo_application', [
      application,
      {
        organization_name: 'Community Impact Foundation',
        registration_number: 'CIF-2026-001',
        legal_type: 'Registered society',
        representative_name: 'Applicant Account',
        representative_title: 'Executive Director',
        email: 'ngo@example.test',
        phone: '03001234567',
        address: 'Main Road, Partner Taluka, Partner District',
        website: 'https://example.test',
      },
      [taluka],
      ['Education', 'Health'],
      a.version,
    ]);
    const updated = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await deny(() => call('submit_partner_ngo_application', [application, updated.version]), /proof/i);
  });

  let document;
  await ok('applicant uploads private registration evidence while unrelated users cannot read it', async () => {
    await as('applicant');
    document = await call('begin_partner_ngo_document_upload', [application, 'registration.pdf', 'application/pdf', 12, 'registration_proof']);
    assert.match(document.object_path, new RegExp(`^${ids.applicant}/${application}/`));
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('poem-ngo-applications',$1,$2)",
      [document.object_path, { size: 12, mimetype: 'application/pdf' }],
    );
    await call('finish_partner_ngo_document_upload', [document.id]);
    assert.equal((await rows('select state from public.partner_ngo_application_documents where id=$1', [document.id]))[0].state, 'ready');

    await as('outsider');
    assert.equal((await rows('select * from public.partner_ngo_applications where id=$1', [application])).length, 0);
    assert.equal((await rows('select * from public.partner_ngo_application_documents where id=$1', [document.id])).length, 0);
    assert.equal((await rows("select * from storage.objects where bucket_id='poem-ngo-applications' and name=$1", [document.object_path])).length, 0);
  });

  await ok('completed application submits to POEM and locks applicant editing', async () => {
    await as('applicant');
    let a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await call('submit_partner_ngo_application', [application, a.version]);
    a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    assert.equal(a.status, 'submitted');
    assert(a.submitted_at);
    await deny(() => call('save_partner_ngo_application', [application, { organization_name: 'Changed while submitted' }, [taluka], ['Education'], a.version]), /draft|changes/i);
  });

  await ok('POEM can request changes and applicant can edit then resubmit', async () => {
    await as('manager');
    let a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await call('review_partner_ngo_application', [application, 'changes_requested', 'Clarify the representative title before approval.', a.version]);
    await as('applicant');
    a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    assert.equal(a.status, 'changes_requested');
    await call('save_partner_ngo_application', [
      application,
      {
        organization_name: a.organization_name,
        registration_number: a.registration_number,
        legal_type: a.legal_type,
        representative_name: a.representative_name,
        representative_title: 'Chief Executive Officer',
        email: a.email,
        phone: a.phone,
        address: a.address,
        website: a.website,
      },
      a.operating_area_ids,
      a.program_names,
      a.version,
    ]);
    a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await call('submit_partner_ngo_application', [application, a.version]);
    assert.equal((await rows('select status from public.partner_ngo_applications where id=$1', [application]))[0].status, 'submitted');
  });

  await ok('approval is blocked until POEM accepts current application documents', async () => {
    await as('manager');
    let a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await deny(() => call('review_partner_ngo_application', [application, 'approved', 'Approve partner organization.', a.version]), /registration|document/i);
    const d = (await rows('select * from public.partner_ngo_application_documents where id=$1', [document.id]))[0];
    await call('review_partner_ngo_document', [document.id, 'accepted', 'Registration evidence accepted.', d.version]);
    a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    assert.equal(a.status, 'submitted');
  });

  let organization;
  await ok('POEM approval activates the Partner NGO and applicant as first NGO Admin', async () => {
    await as('manager');
    const a = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    organization = await call('review_partner_ngo_application', [application, 'approved', 'Organization and registration evidence approved.', a.version]);
    assert(organization);
    await db.exec('RESET ROLE');
    const org = (await rows('select * from public.organizations where id=$1', [organization]))[0];
    assert.equal(org.status, 'active');
    assert.equal(org.name, 'Community Impact Foundation');
    const membership = (await rows('select * from public.organization_memberships where organization_id=$1 and user_id=$2', [organization, ids.applicant]))[0];
    assert.equal(membership.role, 'ngo_admin');
    assert.equal(membership.status, 'active');
    assert.deepEqual((await rows('select name from public.organization_programs where organization_id=$1 order by name', [organization])).map((x) => x.name), ['Education', 'Health']);
    assert.equal((await rows('select count(*)::int c from public.organization_areas where organization_id=$1 and geography_id=$2', [organization, taluka]))[0].c, 1);
  });

  await ok('approved representative can see active NGO workspace membership but not mutate application tables directly', async () => {
    await as('applicant');
    assert.equal((await rows('select id from public.organizations where id=$1', [organization])).length, 1);
    assert.equal((await rows('select * from public.organization_memberships where organization_id=$1 and user_id=$2', [organization, ids.applicant])).length, 1);
    await assert.rejects(
      () => db.query("update public.partner_ngo_applications set status='approved' where id=$1", [application]),
      /permission|denied/i,
    );
  });

  await ok('front end exposes personal application and POEM review workspaces without a separate shared NGO login', async () => {
    const shell = readFileSync('src/app/AppShell.tsx', 'utf8');
    const auth = readFileSync('src/features/auth/Auth.tsx', 'utf8');
    const apply = readFileSync('src/features/organizations/PartnerNgoApplication.tsx', 'utf8');
    const review = readFileSync('src/features/organizations/PartnerNgoApplicationsReview.tsx', 'utf8');
    assert.match(shell, /Partner NGO application/);
    assert.match(shell, /NGO applications/);
    assert.match(auth, /Choose FieldLance workspace/i);
    assert.match(auth, /Create your FieldLance account/i);
    assert.match(auth, /FieldLance staff/i);
    assert.match(apply, /first Partner NGO Admin/i);
    assert.match(review, /Approve Partner NGO/);
  });

  await ok('new onboarding tables retain RLS and anonymous callers have no application access', async () => {
    await db.exec('RESET ROLE');
    const rls = await rows("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relname in ('partner_ngo_applications','partner_ngo_application_documents') order by relname");
    assert.equal(rls.length, 2);
    assert(rls.every((x) => x.relrowsecurity));
    await as(null);
    await assert.rejects(() => rows('select * from public.partner_ngo_applications'), /permission|denied/i);
    await deny(() => call('save_partner_ngo_application', [null, {}, [], [], 0]), /active|permission|denied/i);
  });

  console.log(`\n${passed} POEM 2.13 Partner NGO self-onboarding scenarios passed.`);
} finally {
  await db.close();
}
