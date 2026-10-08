# Upgrade to FieldLance 2.41.16

1. Apply the source patch; there is no new Supabase migration.
2. Run the FAST validation commands in `VALIDATION-2.41.16.md`.
3. In Vercel Production set `VITE_PUBLIC_APP_ORIGIN=https://app.fieldlance.app` (or the actual chosen HTTPS app origin).
4. In hosted Supabase Auth set the same app origin as Site URL and allow the exact `/auth/callback` and `/reset` URLs.
5. Verify hosted password/email/SMTP/attack-protection settings before public launch.
6. Attach and verify the custom app domain in Vercel; do not redirect the old production host until the custom host passes direct-open/refresh/auth tests.

Existing local and preview behavior remains compatible when `VITE_PUBLIC_APP_ORIGIN` is unset because the active browser origin is used as fallback.
