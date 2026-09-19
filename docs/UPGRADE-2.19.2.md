# Upgrade to POEM 2.19.2

Prerequisite: validated POEM 2.19.1 with migration history synchronized through `20261009000200_assistance_distribution_planning.sql`.

1. Verify the patch ZIP SHA-256.
2. Run `apply_patch.py --check`; stop on any conflict.
3. Apply the patch.
4. Run `npm run types:generate` because 2.19.2 adds a table and RPCs.
5. Run `npx supabase start && npx supabase migration up --local`.
6. Run `npm run test:assistance`, `npm run test:distribution` and `npm run test:cases`.
7. Run `npm run preflight && npm run test:payments && npm run test:local && npm run test:operations`.
8. Run `npx supabase migration list` and confirm the expected local head.
9. Browser-test POEM survey authority, NGO Admin and Project Manager delivery/ledger flows; confirm Area Focal remains outside the management boundary.
10. Only after every local validation is green, run `npx supabase db push` and verify migration parity again.

New forward-only migration:

`20261009000300_assistance_ledger_duplicate_controls.sql`

Do not edit or rename already-applied `00100`, `00110` or `00200` migrations. `src/lib/supabase/database.types.ts` should be regenerated from the actual migration set with `npm run types:generate`.
