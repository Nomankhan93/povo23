# Upgrade to POEM 2.19.1

Prerequisite: validated POEM 2.19.0 with local/cloud migration history synchronized through `20261009000110_beneficiary_case_request_stabilization.sql`.

1. Verify the patch ZIP SHA-256.
2. Run `apply_patch.py --check` and stop on any conflict.
3. Apply the patch.
4. Run `npm run types:generate` because 2.19.1 adds tables/RPCs.
5. Run `npx supabase start && npx supabase migration up --local`.
6. Run `npm run test:distribution` and `npm run test:cases`.
7. Run `npm run preflight && npm run test:payments && npm run test:local && npm run test:operations`.
8. Run `npx supabase migration list` and confirm the expected local head.
9. Browser-test POEM survey, NGO Admin and Project Manager distribution planning; confirm Area Focal cannot enter the planning boundary.
10. Only after every local validation is green, run `npx supabase db push` and verify migration parity again.

New forward-only migration:

`20261009000200_assistance_distribution_planning.sql`

Do not edit or rename the already-applied 2.19.0 migrations (`00100`, `00110`). `src/lib/supabase/database.types.ts` should be regenerated from the actual database migration set rather than blindly copied from this patch.
