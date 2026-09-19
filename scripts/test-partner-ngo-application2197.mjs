import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const read = (path) => readFileSync(path, 'utf8');
let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.19.7 release exposes the Partner NGO onboarding regression command and forward migration', async () => {
  const pkg = JSON.parse(read('package.json'));
  const [versionMajor, versionMinor, versionPatch] = pkg.version
    .split('-')[0]
    .split('.')
    .map(Number);

  assert.ok(
    versionMajor > 2 ||
      (versionMajor === 2 && versionMinor > 19) ||
      (versionMajor === 2 && versionMinor === 19 && versionPatch >= 7),
    `Expected FieldLance >= 2.19.7, received ${pkg.version}`,
  );
  assert.equal(pkg.scripts['test:ngo-application'], 'node scripts/test-partner-ngo-application2197.mjs');
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.ok(migrations.includes('20261009000600_partner_ngo_application_experience.sql'));
});

await ok('application UI is a five-step guided flow with structured registration designation programs and review', async () => {
  const source = read('src/features/organizations/PartnerNgoApplication.tsx');
  for (const marker of ['Organization', 'Operating Areas', 'Programs', 'Documents', 'Review']) assert.match(source, new RegExp(marker));
  assert.match(source, /Choose registration type/);
  assert.match(source, /Other \/ specify/);
  assert.match(source, /Choose designation/);
  assert.match(source, /Search program areas/);
  assert.match(source, /Add custom program/);
  assert.match(source, /Review & submit/);
  assert.match(source, /SUBMISSION READINESS/);
  assert.doesNotMatch(source, /Programs \(one per line\)/);
});

await ok('successful server submission produces the explicit FieldLance success modal and under-review state', async () => {
  const source = read('src/features/organizations/PartnerNgoApplication.tsx');
  assert.match(source, /Application submitted successfully/);
  assert.match(source, /ngo-modal-status/);
  assert.match(source, />Under review<\/strong>/);
  assert.match(source, /View application/);
  assert.match(source, /Back to dashboard/);
  assert.match(source, /setSubmitSuccess\(true\)/);
  assert.match(source, /await rpc\("submit_partner_ngo_application"/);
});

await ok('2.19.7 completion hotfix shows supporting documents on Review with edit and replacement controls', async () => {
  const source = read('src/features/organizations/PartnerNgoApplication.tsx');
  assert.match(source, /SUPPORTING DOCUMENTS/);
  assert.match(source, /documents=\{documents\}/);
  assert.match(source, />Edit documents<\/button>/);
  assert.match(source, /async function replaceDocument/);
  assert.match(source, />\s*Replace\s*/);
  assert.match(source, /p_kind: d\.kind/);
  assert.match(source, /Replacement uploaded, but the previous document still needs removal/);
});

await ok('2.19.7 completion hotfix consistently presents submitted applications as Under review to applicants', async () => {
  const source = read('src/features/organizations/PartnerNgoApplication.tsx');
  assert.match(source, /statusBadgeValue = application\?\.status === "submitted" \? "under_review"/);
  assert.match(source, /<Badge value=\{statusBadgeValue\} \/>/);
  assert.match(source, /FieldLance review in progress/);
  const styles = read('src/styles/design-system.css');
  assert.match(styles, /\.badge\.under_review/);
});

await ok('organization logo UI validates image types and reuses the approved logo in review and organization presentation', async () => {
  const logo = read('src/features/organizations/OrganizationLogo.tsx');
  const review = read('src/features/organizations/PartnerNgoApplicationsReview.tsx');
  const shell = read('src/app/AppShell.tsx');
  assert.match(logo, /fieldlance-organization-logos/);
  assert.match(logo, /image\/webp/);
  assert.match(logo, /2097152/);
  assert.match(logo, /set_partner_ngo_application_logo/);
  assert.match(review, /OrganizationLogoImage/);
  assert.match(shell, /OrganizationLogoImage/);
});

await ok('application shell copy is organization-specific rather than generic Field Worker guidance', async () => {
  const shell = read('src/app/AppShell.tsx');
  assert.match(shell, /ORGANIZATION ONBOARDING/);
  assert.match(shell, /Create and submit your organization profile for FieldLance review/);
  assert.match(shell, /Partner NGO application/);
});

const db = await schemaDb();
const ids = Object.fromEntries(
  ['super', 'manager', 'applicant', 'outsider'].map((name, index) => [
    name,
    `97000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  ]),
);
const rows = async (query, params = []) => (await db.query(query, params)).rows;
async function as(name) {
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] || '']);
  await db.exec(`SET ROLE ${name ? 'authenticated' : 'anon'}`);
}
async function call(name, args) {
  return (
    await rows(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)
  )[0].result;
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

  const province = await call('save_geography', [null, null, 'province', 'Logo Province', 'LGP', 'Fixture', true]);
  const division = await call('save_geography', [null, province, 'division', 'Logo Division', 'LGD', 'Fixture', true]);
  const district = await call('save_geography', [null, division, 'district', 'Logo District', 'LGC', 'Fixture', true]);

  let application;
  let logoPath;
  let registrationDoc;
  let profileDoc;

  await ok('private organization-logo storage accepts only the application owner while the draft is editable', async () => {
    await as('applicant');
    application = await call('save_partner_ngo_application', [
      null,
      {
        organization_name: 'Field Impact Foundation',
        representative_name: 'Applicant Account',
        email: 'field@example.test',
      },
      [],
      [],
      0,
    ]);
    logoPath = `${application}/logo`;

    await assert.rejects(
      () => call('set_partner_ngo_application_logo', [application, true]),
      /missing/i,
    );

    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('fieldlance-organization-logos',$1,$2)",
      [logoPath, { size: 5000, mimetype: 'image/png' }],
    );
    await call('set_partner_ngo_application_logo', [application, true]);
    const own = (await rows('select logo_path,logo_updated_at from public.partner_ngo_applications where id=$1', [application]))[0];
    assert.equal(own.logo_path, logoPath);
    assert(own.logo_updated_at);

    await as('outsider');
    assert.equal((await rows("select name from storage.objects where bucket_id='fieldlance-organization-logos' and name=$1", [logoPath])).length, 0);
  });

  await ok('expanded supporting-document taxonomy accepts organization profiles while retaining legal proof', async () => {
    await as('applicant');
    profileDoc = await call('begin_partner_ngo_document_upload', [application, 'profile.pdf', 'application/pdf', 100, 'organization_profile']);
    assert.equal(profileDoc.kind, 'organization_profile');
    registrationDoc = await call('begin_partner_ngo_document_upload', [application, 'registration.pdf', 'application/pdf', 120, 'registration_proof']);
    assert.equal(registrationDoc.kind, 'registration_proof');
  });

  await ok('final submission requires explicit registration type in addition to prior completeness rules', async () => {
    await as('applicant');
    let app = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await call('save_partner_ngo_application', [
      application,
      {
        organization_name: 'Field Impact Foundation',
        registration_number: 'FIF-2026-01',
        legal_type: '',
        representative_name: 'Applicant Account',
        representative_title: 'Executive Director',
        email: 'field@example.test',
        phone: '03001234567',
        address: 'Main Road, Logo District, Pakistan',
        website: 'https://example.test',
      },
      [district],
      ['Education'],
      app.version,
    ]);
    app = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await assert.rejects(() => call('submit_partner_ngo_application', [application, app.version]), /registration type|complete/i);
  });

  await ok('approval copies the private application logo to the active organization and makes it readable in authenticated organization presentation', async () => {
    await as('applicant');
    let app = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await call('save_partner_ngo_application', [
      application,
      {
        organization_name: 'Field Impact Foundation',
        registration_number: 'FIF-2026-01',
        legal_type: 'Society',
        representative_name: 'Applicant Account',
        representative_title: 'Executive Director',
        email: 'field@example.test',
        phone: '03001234567',
        address: 'Main Road, Logo District, Pakistan',
        website: 'https://example.test',
      },
      [district],
      ['Education', 'Health'],
      app.version,
    ]);

    for (const doc of [registrationDoc, profileDoc]) {
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('poem-ngo-applications',$1,$2)",
        [doc.object_path, { size: doc.byte_size, mimetype: doc.mime_type }],
      );
      await call('finish_partner_ngo_document_upload', [doc.id]);
    }

    app = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    await call('submit_partner_ngo_application', [application, app.version]);

    await as('manager');
    for (const id of [registrationDoc.id, profileDoc.id]) {
      const doc = (await rows('select * from public.partner_ngo_application_documents where id=$1', [id]))[0];
      await call('review_partner_ngo_document', [doc.id, 'accepted', 'Application evidence accepted.', doc.version]);
    }
    app = (await rows('select * from public.partner_ngo_applications where id=$1', [application]))[0];
    const organization = await call('review_partner_ngo_application', [application, 'approved', 'Organization application approved.', app.version]);

    await db.exec('RESET ROLE');
    const org = (await rows('select logo_path,logo_updated_at from public.organizations where id=$1', [organization]))[0];
    assert.equal(org.logo_path, logoPath);
    assert(org.logo_updated_at);

    await as('outsider');
    assert.equal((await rows("select name from storage.objects where bucket_id='fieldlance-organization-logos' and name=$1", [logoPath])).length, 1);
  });
} finally {
  await db.close();
}

console.log(`\n${passed} FieldLance 2.19.7 Partner NGO application experience scenarios passed.`);
