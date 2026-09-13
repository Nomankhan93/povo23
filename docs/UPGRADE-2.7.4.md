# Upgrade to 2.7.4

1. Apply migration `20260923000100_profile_independence_photo.sql`.
2. Run `npm ci --include=dev && npm run preflight`.
3. Run local Supabase smoke tests before remote push.
4. Confirm the new private `poem-profile-photos` bucket exists.

No existing profile details, work-experience rows or private-document metadata are deleted.
