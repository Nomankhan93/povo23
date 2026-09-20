# Upgrade to FieldLance 2.25.1

Apply the checksummed patch to 2.25.0. Install dependencies with npm ci. Apply the new migration to local Supabase with npx supabase migration up, then run npm run preflight, npm run test:local and npm run test:operations. For an already linked cloud project use npx supabase db push after local validation. Apply the database migration before serving the new frontend. No reset or reseed is required.

The migration adds accounts.onboarding_intent and accounts.worker_enrollment plus two guarded RPCs and replaces only the signup trigger function. Existing profiles are marked legacy; no data is deleted. New organization accounts can have no worker profile, so an old frontend must not be redeployed after such accounts exist. Roll forward if deployment must be corrected; file backups do not roll back database changes.

Manual acceptance: new Worker signup; new Organization signup and email confirmation on another device; draft/submitted/changes requested/rejected/withdrawn application; approval to organization; explicit dual-role enrollment; two organizations; project manager and area focal person; suspended/revoked access; password reset; browser refresh; offline draft preservation; shared-device sign-out and second-account sign-in.
