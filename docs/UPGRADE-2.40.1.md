# Upgrade to FieldLance 2.40.1

Apply to the supplied 2.40.0 baseline. The patch installer checks all changed files before writing and aborts on local conflicts. Commit or back up local work first; inspect the diff after applying. It does not modify local environment credentials or deploy anything.

```bash
nvm use
npm ci
npx supabase start
if [[ ! -f .env.local ]]; then
  npm run env:local
fi
npx supabase migration up --local
npm run metadata:generate
npm run preflight
npm run test:local
git diff --check
```

New migration: `20261013000450_field_evidence_attendance_stabilization.sql`. Apply the migration before serving the new client. Existing eight-argument clients remain supported. Do not edit or re-run historical migrations on an existing database. Cloud promotion requires your normal backup, staging and approval process; local checks do not deploy to production.

The prior archive contained privileged material in `.env.example`. Replace/rotate any real exposed credential through its owning environment and review repository/archive history. Sanitizing this patch does not revoke earlier copies. Do not place server secrets in any `VITE_` variable.

Before promotion, smoke-test explicit visit capture/retry/history; personal attendance refresh, start and checkout; offline start+checkout, reload and reconnect; assignment switching; denied GPS; unrelated-user denial; and malformed boundary rejection in a real browser against local Supabase.

If rollback is needed, restore the saved source backup or prior source revision. Keep the additive database migration; it preserves the old endpoint. Do not delete evidence or rewrite revision history to undo a client deployment.
