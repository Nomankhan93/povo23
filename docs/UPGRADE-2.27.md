# Upgrade notes — FieldLance 2.27

1. Deploy the validated 2.26 release first, including its paid-work funding assurance migration.
2. Apply this patch to the 2.26.0 source tree.
3. Run `npm ci`, `npm run test:project-workspace`, and `npm run preflight`.
4. No new Supabase migration is included. Existing project, recruitment, finance, and governance authorization remains unchanged.
