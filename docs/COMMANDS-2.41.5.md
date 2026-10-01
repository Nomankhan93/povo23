# FieldLance 2.41.5 command record

All repository commands ran inside Ubuntu using wsl.exe -d Ubuntu -- bash -lc. Node/test commands used:
```bash
cd /home/noman/projects/poem-phase1.1
source ~/.nvm/nvm.sh
nvm use
```

## Baseline and recovery
```bash
pwd
git status --short
git branch --show-current
cat package.json
cat supabase/config.toml
ls supabase/migrations
docker ps --format "{{.Names}} {{.Ports}}"
git switch -c codex/fieldlance-2.41.5-recruitment-hardening
mkdir -p /home/noman/fieldlance-backups/2.41.5
docker exec supabase_db_poem-phase11 pg_dump -U postgres -d postgres -Fc > /home/noman/fieldlance-backups/2.41.5/pre-hardening.dump
docker exec supabase_db_poem-phase11 pg_dumpall -U postgres --globals-only > /home/noman/fieldlance-backups/2.41.5/pre-hardening-globals.sql
docker exec -i supabase_db_poem-phase11 pg_restore --list < /home/noman/fieldlance-backups/2.41.5/pre-hardening.dump
sha256sum /home/noman/fieldlance-backups/2.41.5/pre-hardening.dump
```

Catalog queries and migration application used docker exec -i supabase_db_poem-phase11 psql, with SQL supplied on stdin. Administrative execution used the container's POSTGRES_PASSWORD internally, without printing it. The migrations were tested against fieldlance_2415_validation first, then applied transactionally to postgres and recorded in supabase_migrations.schema_migrations. No hosted connection or service restart was used.

## Main regression chain
npm test was initially run twice; it stopped on obsolete fixture setup. After updating setup, remaining commands were executed individually in their original order so one failure would not hide later results. Failed commands were rerun after correction. This is not a claim of one uninterrupted green npm test invocation.

The expanded final test chain is:
```bash
node scripts/test-database.mjs
node scripts/test-phase12.mjs
node scripts/test-phase13.mjs
node scripts/test-phase14.mjs
node scripts/test-phase21.mjs
node scripts/test-phase22.mjs
node scripts/test-phase23.mjs
node scripts/test-stabilization.mjs
node scripts/test-phase24.mjs
node scripts/test-phase25.mjs
node scripts/test-phase26.mjs
node scripts/test-phase27.mjs
node scripts/test-geography-reference.mjs
node scripts/test-profile-structured-ui.mjs
node scripts/test-profile-independence-photo.mjs
node scripts/test-sidebar-profile-grouping.mjs
node scripts/test-correctness276.mjs
node scripts/test-offline-recovery276.mjs
node scripts/test-survey-save276.mjs
node scripts/test-phase28.mjs
node scripts/test-phase29.mjs
node scripts/test-phase210.mjs
node scripts/test-capture-client.mjs
node scripts/test-phase211.mjs
node scripts/test-field211.mjs
node scripts/test-field-storage211.mjs
node scripts/test-workflow-ui2111.mjs
node scripts/test-phase212.mjs
node scripts/test-area-picker.mjs
node scripts/test-area-operations.mjs
node scripts/test-template-library.mjs
node scripts/test-phase2124.mjs
node scripts/test-current-state-stabilization.mjs
node scripts/test-phase2126.mjs
node scripts/test-phase213.mjs
node scripts/test-phase2131.mjs
node scripts/test-phase2132.mjs
node scripts/test-phase214.mjs
node scripts/test-phase2141.mjs
node scripts/test-phase2142.mjs
node scripts/test-phase215.mjs
node scripts/test-phase2151.mjs
node scripts/test-phase216.mjs
node scripts/test-phase2161.mjs
node scripts/test-phase217.mjs
node scripts/test-phase2171.mjs
node scripts/test-phase2172.mjs
node scripts/test-phase218.mjs
node scripts/test-phase2181.mjs
node scripts/test-phase2182.mjs
node scripts/test-phase2183.mjs
node scripts/test-phase219.mjs
node scripts/test-phase2191.mjs
node scripts/test-phase2192.mjs
node scripts/test-phase2193.mjs
node scripts/test-phase226.mjs
node scripts/test-partner-ngo-application2197.mjs
node scripts/test-frontend-foundation2194.mjs
node scripts/test-branding2195.mjs
node scripts/test-visual-system2196.mjs
node scripts/test-workforce-marketplace2198.mjs
node scripts/test-field-worker-workspace2200.mjs
node scripts/test-organization-workspace2210.mjs
node scripts/test-staff-operations2220.mjs
node scripts/test-task-center2230.mjs
node scripts/test-notification-center2240.mjs
node scripts/generate-project-metadata.mjs --check
node scripts/test-release-consistency.mjs
node scripts/test-earnings-wallet2250.mjs
node scripts/test-identity-workspaces2251.mjs
node scripts/test-navigation2252.mjs
node scripts/test-phase228.mjs
node scripts/test-phase229.mjs
node scripts/test-phase230.mjs
node scripts/test-phase2301.mjs
node scripts/test-phase227.mjs
node scripts/test-phase231.mjs
node scripts/test-analytics-client231.mjs
node scripts/test-phase236.mjs
node scripts/test-phase2361.mjs
node scripts/test-phase237.mjs
node scripts/test-phase238.mjs
node scripts/test-phase2381.mjs
node scripts/test-phase239.mjs
node scripts/test-phase240.mjs
node scripts/test-map-client2411.mjs
node scripts/test-attendance-client2401.mjs
node scripts/check-release-secrets.mjs
node scripts/test-device241.mjs
node scripts/test-corrective2411.mjs
node scripts/test-notification-routing2413.mjs
node scripts/test-correctness2414.mjs
node scripts/test-notification-client2414.mjs
node scripts/test-recruitment-hardening2415.mjs
```

## Additional validation
```bash
npm run types:generate
npm run types:check
npm run check
npm run build
npm run metadata:generate
npm run release:consistency
node scripts/test-grants2415.mjs
FIELDLANCE_GRANTS_DATABASE=postgres node scripts/test-grants2415.mjs
node scripts/test-local-recruitment2415.mjs
node scripts/test-browser-recruitment2415.mjs
node scripts/test-browser-attendance2414.mjs
node scripts/test-browser-map2411.mjs
node scripts/test-browser241.mjs
node scripts/test-browser-network2412.mjs
git diff --check
git diff --stat
git status --short
```

A read-only live-schema comparison additionally compared all 467 public/app_private function bodies, identity arguments, return types, security-definer flags and configured search paths with a fresh migration-built database. It passed.

Machine execution logs were written to /tmp/fieldlance-2415-*.log. Main remaining-command results are in /tmp/fieldlance-2415-results.json; initial failures in that file are superseded only by explicitly recorded successful reruns, not erased.

The disposable validation database was removed with docker exec supabase_db_poem-phase11 dropdb using the administrative role after all validation. Durable copies of the execution logs are preserved at /home/noman/fieldlance-backups/2.41.5/validation-logs/.

## Pre-commit project-date correction

Version stayed 2.41.5 on the existing branch. No prior migration was rewritten. The old predicate was re-inspected in 20261013000200 and the governance/save/capture/offline call paths traced. Only 00530 changes production behavior in this correction.

Validation commands (WSL Ubuntu with nvm use):

    npm run test:collection-dates-2415
    FIELDLANCE_DATE_DATABASE=fieldlance_2415_validation npm run test:collection-dates-2415
    npm run test:recruitment-hardening-2415
    npm run test:grants-2415
    npm run test:local-recruitment-2415
    npm run test:case-ownership-239
    npm run test:field-map-240
    npm run test:browser-recruitment-2415
    npm run test:browser-map-2411
    npm run test:browser-attendance-2414
    npm test
    npm run types:check
    npm run check
    npm run build
    npm run release:consistency
    npm run check:release-secrets
    npm run metadata:generate
    npm run metadata:check
    git status --short
    git diff --check
    git diff --stat
    git diff --name-status

The disposable PostgreSQL database was created in supabase_db_poem-phase11 with minimal Auth/Storage scaffolding from schema-test-db.mjs, followed by all 82 sorted migration files in one transaction. The date fixture was rolled back. A negative control installed only the old helper there, verified the future-date test failed, then restored 00530 and reran successfully. Only after this validation was 00530 applied transactionally to local postgres and registered in supabase_migrations.schema_migrations. Existing local data was not reset. The disposable database was dropped after checks.

The initially ambiguous legacy-test date parameter was corrected to an explicit integer cast; the focused recruitment rerun passed and the later full npm test passed uninterrupted. The correction expands the main chain to 95 commands. Logs and result manifests, including the initial fixture failure, are outside the repository at /home/noman/fieldlance-backups/2.41.5/validation-logs/date-correction/. F14 was not rerun during this correction.
