# Upgrade to POEM 2.7.3

1. Apply the patch to a clean POEM 2.7.2 working tree.
2. Run `npm ci --include=dev`.
3. Run `npm run preflight`.
4. Run `node scripts/test-profile-structured-ui.mjs` if you want the focused UI contract separately.
5. Run the local Supabase smoke/integration suites before deployment.

There is no new database migration in 2.7.3 and no `supabase db push` is required specifically for this UI patch.

Manual QA should cover desktop and mobile volunteer profile editing, legacy profile loading, adding/removing multi-select values, multiple preferred areas, reference-card editing, and work-experience role `Other` handling.
