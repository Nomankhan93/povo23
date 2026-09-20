# Validation — FieldLance 2.25.1

Run npm run preflight and npm run test:identity-workspaces. Identity tests apply the complete migration chain in PGlite, first seed a pre-migration legacy account, then verify signup, enrollment, permissions, role isolation, revocation and pure routing decisions. Existing suites cover approval transaction, project area permissions, recruitment, payments and offline behavior.

PGlite tests are not a live Supabase Auth/email or browser session test. Run npm run test:local and npm run test:operations against local Supabase, then manually check the flows in UPGRADE-2.25.1.md before cloud rollout.
