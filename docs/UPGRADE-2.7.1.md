# Upgrade to POEM 2.7.1

1. Apply the patch to a validated POEM 2.7.0 working tree.
2. Run `npm ci --include=dev` and `npm run preflight`.
3. Apply `20260922000100_pakistan_geography_reference.sql` locally with `npx supabase migration up --local`.
4. Run `node scripts/test-geography-reference.mjs`, `npm run test:local`, and `npm run test:operations`.
5. Manually verify the volunteer profile cascading dropdowns, ICT division skip, optional UC, and mandatory address.
6. Only after local validation, run `npx supabase db push` for the linked cloud project.

The migration is additive and upserts deterministic `PKREF-*` codes. It does not delete existing geography rows.
