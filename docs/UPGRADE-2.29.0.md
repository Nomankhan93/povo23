# Upgrade to 2.29.0

Apply 2.28.0 first, including its migration. Then apply this patch, npm ci, and forward migration 20261011000100_field_worker_reputation_certificates.sql. Run npm run preflight.

Local database: npx supabase migration up. Review linked cloud migrations before npx supabase db push. No migration is executed by the patch installer.

Smoke test separate organization-admin, FieldLance worker-manager and worker sessions: completed-assignment review, worker summary, certificate issuance, owner sharing, logged-out verification, print/Save as PDF, expiry and revocation. Public verification URLs require hosting to serve the application at its root (same hosting assumption as the existing app).
