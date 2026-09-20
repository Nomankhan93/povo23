# Upgrade to FieldLance 2.24.0

1. Apply the patch with `--check`, apply, then repeat `--check`.
2. Run `npm ci --include=dev`.
3. Run `npm run types:generate` and `npm run metadata:generate`.
4. Start local Supabase and apply `20261009000800_notifications_communication_center.sql` locally.
5. Run the 2.24 regression suite plus preflight/local/operations validation.
6. Verify Communication Center filters, preferences, deep links and scoped broadcasts in the browser.
7. Only after local validation passes, run `npx supabase db push` and confirm Local/Remote migration head `20261009000800`.

Do not edit migration `20261009000700` or any earlier applied migration.
