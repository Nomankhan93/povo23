# Upgrade to FieldLance 2.19.7

2.19.7 is a forward application UX/storage release. Do not edit or replay historical migrations manually.

## Apply patch

Use the supplied patch installer with `--check`, then apply only when it reports no conflicts.

## Local validation

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
npx supabase migration list
```

For a local Supabase database, apply pending migrations before HTTP/local tests when needed:

```bash
npx supabase start
npx supabase migration up --local
```

## Cloud migration

After all local checks pass:

```bash
npx supabase db push
npx supabase migration list
```

The expected head is `20261009000600_partner_ngo_application_experience.sql` on both Local and Remote.

## Manual browser QA

Test a fresh applicant and a changes-requested applicant on desktop and mobile. Confirm structured registration/designation, multi-area selection, program chips/custom programs, logo upload/replace/remove, private documents, Review/Edit links, disabled readiness state, successful submission modal and read-only Under review state. Confirm a FieldLance reviewer can view the logo/documents and approval shows the logo on the active organization card.
