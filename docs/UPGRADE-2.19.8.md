# Upgrade to FieldLance 2.19.8

2.19.8 is a frontend/test/documentation release and adds **no Supabase migration**. Migration head remains `20261009000600_partner_ngo_application_experience.sql`.

## Apply patch

Use the supplied installer with `--check`, apply only when there are no conflicts, then repeat `--check` and expect `already-patched`.

## Local validation

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev

npm run metadata:check
npm run check
npm run test:workforce-marketplace
npm run test:ngo-application
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run preflight

npx supabase migration list
```

No `npx supabase db push` is required for 2.19.8 because this release has no new migration.

## Manual browser QA

Test both Field Worker and Organization workspaces:

- Field Worker: Available Opportunities → Apply → My Applications → formal offer → Accept → My Assigned Surveys active state.
- Organization: create/publish opportunity → Applications → shortlist/select → send offer → Assignments.
- Confirm draft/closed opportunities do not appear as open Field Worker work.
- Confirm application consent is scoped to the application snapshot.
- Confirm organization logos/fallback initials render correctly.
- Confirm direct survey assignments remain separately labelled.
- Test desktop and mobile widths, especially metrics, tab strip, filters, cards, actions and recruitment progress.
