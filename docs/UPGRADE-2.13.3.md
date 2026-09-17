# Upgrade to POEM 2.13.3

2.13.3 is a source/documentation consolidation release. It has **no database migration**.

## Apply and validate

From the POEM project root:

```bash
nvm use
npm ci --include=dev
npm run release:consistency
npm run preflight
```

For the local Supabase integration gates:

```bash
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

`npx supabase migration up --local` should report no new 2.13.3 migration to apply. The existing migration head remains `20261006000200_invitation_access_scope_fix.sql`.

## Browser regression

Confirm the 2.13.1/2.13.2 journeys still behave as before:

1. Volunteer, Partner NGO and POEM Staff destinations are visible.
2. A Partner NGO representative with an active membership reaches the NGO workspace.
3. A representative without active NGO membership reaches Partner NGO onboarding.
4. Volunteer signup remains available and keeps one personal POEM account model.
5. Password show/hide, forgot-password and reset-password behavior works.
6. Mobile authentication remains single-column with compact POEM branding.

## Cloud

There is no database push required specifically for 2.13.3. If your cloud database is already at the 2.13.2 migration head, keep it unchanged. Do not rename or replay historical migration files.
