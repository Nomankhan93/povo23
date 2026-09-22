# Upgrade FieldLance 2.31.0 → 2.36.0

2.36.0 is a frontend/navigation release. It requires no Supabase migration.

## Apply

1. Apply the patch only to the validated 2.31.0 baseline.
2. Run `npm ci`.
3. Run `npm run test:routing-236`.
4. Run `npm run check`.
5. Run `npm run preflight`.
6. Start the application and run the manual browser/mobile smoke checks below.

## Browser smoke checks

- Sign in to a Field Worker account and confirm the URL becomes `/app/home`.
- Open Work, Applications, Field, Earnings and Profile; refresh each page and confirm the same destination restores.
- Use browser Back and Forward between those destinations.
- Open an Organization workspace and confirm `/org/:organizationId/...` routes cannot switch to another Organization without authorized workspace access.
- Open a project workspace, switch Overview → Recruitment → Cases → Finance and confirm the project/tab path changes.
- Open a beneficiary case, refresh, and confirm the selected case is restored.
- Test a project staff account with `/projects/:projectId/...` and confirm an unrelated project route is denied/canonicalized by existing access rules.
- While a field draft has pending persistence, attempt browser Back. A failed draft save must keep the previous URL and surface an error.

## Mobile smoke checks

At <=800px in the personal Field Worker workspace:

- Home / Work / Field / Earnings / Profile bottom navigation is visible.
- Active destination is indicated.
- Content is not hidden behind the fixed navigation bar.
- Sidebar drawer remains available for secondary tools.
- Buttons remain keyboard/focus accessible.

## Rollback

The patch installer creates a timestamped `.fieldlance-patch-backups/2.36.0-*` backup for replaced files. No database rollback is required because this release adds no migration.
