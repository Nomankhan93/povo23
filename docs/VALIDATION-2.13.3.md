# POEM 2.13.3 validation

2.13.3 is complete only when metadata consistency, normal source tests, local database/auth checks and the current browser journeys are green.

## Fast consolidation checks

```bash
npm run metadata:check
npm run release:consistency
node scripts/test-phase2131.mjs
node scripts/test-phase2132.mjs
```

Expected release boundary:

- package and current docs resolve to 2.13.3;
- generated project metadata is reproducible;
- there is no 2.13.3 SQL migration;
- migration head is still `20261006000200_invitation_access_scope_fix.sql`.

## Full source gate

```bash
npm run preflight
```

This covers generated database type consistency, TypeScript, the historical regression suite and the production build.

## Local Supabase gates

```bash
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

## Browser acceptance

- Volunteer / Partner NGO / POEM Staff sign-in destinations render correctly.
- Role-specific auth storytelling and destination copy remain intact.
- Signup is available for Volunteer and Partner NGO entry paths, not POEM Staff.
- Approved Partner NGO representatives can enter their NGO workspace.
- Non-member representatives reach Partner NGO onboarding.
- Password show/hide does not submit the form.
- Forgot/reset password flows retain existing behavior.
- Internal release version remains absent from the public auth screen.
- Mobile auth remains compact and single-column.

## Git/release hygiene

```bash
git diff --check
git status --short
```

Do not commit `.env.local`, `node_modules/`, `dist/`, `supabase/.temp/` or `.poem-patch-backups/`.
