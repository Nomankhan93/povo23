# Upgrade to FieldLance 2.22.0

2.22.0 is a migration-free frontend/workspace release.

## Before applying

- Start from validated FieldLance 2.21.0.
- Keep migration head `20261009000600_partner_ngo_application_experience.sql`.
- Commit or back up unrelated local changes.

## After applying

Run:

```bash
npm run metadata:check
npm run check
npm run test:staff-operations
npm run test:organization-workspace
npm run test:field-worker-workspace
npm run test:workforce-marketplace
npm run test:ngo-application
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run preflight
```

No `supabase db push` is required because 2.22.0 adds no migration.
