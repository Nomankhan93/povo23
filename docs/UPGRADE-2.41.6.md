# FieldLance 2.41.6 upgrade

Frontend and regression-test patch only. There are no new migrations, backend RPC changes, generated database type changes or dependency upgrades. All 82 migrations remain unchanged, ending at 20261013000530_collection_project_date_guard.sql.

Work was performed on codex/fieldlance-2.41.6-workflow-reliability from committed 2.41.5 (e7a009d). No staging, commit, push, merge, hosted Supabase change or deployment is part of this work.

Use WSL Ubuntu:
```bash
cd /home/noman/projects/poem-phase1.1
source ~/.nvm/nvm.sh
nvm use
git status --short
git diff --check
npm run test:funding-retry-2416
npm run test:browser-workflow-2416
npm run test:local-workflow-2416
npm run release:consistency
```

The local HTTP integration refuses endpoints other than the poem-phase11 loopback API on port 55321. It creates uniquely tagged disposable accounts/records and removes them in finally; it does not reset the database. Finance retry assertions run against the complete migration schema in isolated PGlite, avoiding permanent immutable journal fixtures in the live development database.

No new database backup was required because persistent backend behavior did not change. The existing recovery archive remains outside the repository:
 /home/noman/fieldlance-backups/2.41.5/pre-hardening.dump

Resolve any uncertain funding operation through Retry same request before intentionally clearing browser storage. Do not treat a balance-validation error on a retry as proof that the original request failed.

Overall release remains HOLD for F03 and F14. These commands are validation instructions, not deployment approval.
