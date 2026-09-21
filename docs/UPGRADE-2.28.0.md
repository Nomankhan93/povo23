# Upgrade to 2.28.0

Base: 2.27.0. Apply the source patch, run npm ci, then apply 20261010000200_organization_settings_team_compliance.sql using the normal Supabase migration workflow. Run npm run preflight.

For local Supabase: npx supabase migration up. For the linked cloud project, review pending migrations before npx supabase db push. The installer does not execute database commands. Do not roll back the schema by deleting tables containing membership or compliance history.

Smoke test with separate organization admin, invited member, unrelated account and FieldLance organization reviewer. Check accepting an invitation, a subsequent workspace refresh, role suspension, document upload/download and independent review.
