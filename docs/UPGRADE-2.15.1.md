# Upgrade to POEM 2.15.1

1. Start from a validated POEM 2.15.0 tree.
2. Run `npm ci --include=dev`.
3. Run `npm run preflight`.
4. Start local Supabase and run `npx supabase migration up --local`.
5. Run `npm run test:local`, `npm run test:operations`, `node scripts/test-phase215.mjs` and `node scripts/test-phase2151.mjs`.
6. Browser-test NGO draft → submit → changes requested → resubmit → POEM approve → operational project visibility.
7. Only after local gates pass, run `npx supabase db push`.

The forward migration is `20261008000200_ngo_project_self_service.sql`. Do not edit or rename prior migrations.
