# FieldLance 2.19.7 validation

## Automated acceptance

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run metadata:generate
npm run test:ngo-application
npm run test:branding
npm run test:visual-system
npm run test:frontend-foundation
npm run preflight
npm run test:payments
npm run test:local
npm run test:operations
```

`test:ngo-application` checks the five-step application source contract, structured selectors/program chips, successful-submit modal, private logo bucket/RLS lifecycle, extended document categories, registration-type server validation, approval logo synchronization and organization presentation reuse.

## Migration checks

```bash
npx supabase migration list
```

Expected head: `20261009000600_partner_ngo_application_experience.sql`.

## Browser QA

- Start a Partner NGO application from a Field Worker account.
- Verify Organization → Operating Areas → Programs → Documents → Review flow.
- Select standard registration/designation values and test Other/custom values.
- Add/remove multiple operating areas.
- Select standard program chips and add a custom program.
- Upload/replace/remove JPG/PNG/WebP logo and confirm preview.
- Confirm an unrelated account cannot fetch the draft logo.
- Upload registration/legal proof and another supporting-document category.
- Verify review summary/edit links/readiness blockers.
- Submit and confirm the success modal appears only after successful server submission.
- Verify status becomes Under review and the applicant can no longer mutate the submitted form.
- As FieldLance reviewer, review all documents and approve.
- Verify the applicant becomes first NGO Admin and the active organization card uses the approved logo.
- Repeat core form interaction at narrow/mobile width; no main-form horizontal scroll should appear.
