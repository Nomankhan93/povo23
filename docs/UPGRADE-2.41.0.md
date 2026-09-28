# Upgrade to FieldLance 2.41.0

Apply the incremental patch to the delivered 2.40.1 baseline. The installer checks modified file hashes and aborts before writing when a local conflict exists. Commit/back up local changes and inspect the diff. No SQL migration is added; preserve the 2.40.1 migration and all historical files.

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
npm run metadata:generate
npm run preflight
npx playwright install chromium
npm run test:browser-241
npx supabase start
npx supabase migration up --local
npm run test:local
git diff --check
```

`npm run check:release-secrets` is now an explicit script alias. Browser acceptance uses real Chromium/storage/service workers and a simulated transport. It does not replace local Supabase Auth/Storage testing or a phone pilot. On Linux, Playwright may require its documented browser system dependencies; an existing compatible Chromium may be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

## Device upgrade and rollback

Sync what can be synchronized, then close all FieldLance tabs before opening the new version. Do not delete browser data to resolve a blocked upgrade. First use adds the attendance receipts store (IndexedDB version 2) without replacing existing queues/keys. Missing/expired downloads require an online refresh before capture. App files and project downloads are separate.

Important rollback limit: 2.40.1 opens attendance DB version 1 and cannot open a device already upgraded to version 2. Prefer a forward client fix. Do not downgrade an upgraded field device to 2.40.1 or erase its unsynced data as a rollback shortcut. The source backup restores files, not IndexedDB. Server schema is unchanged by 2.41.0.

## Actual environment acceptance

Verify sign-in/account switch/logout/lock on local Supabase; survey attachments interrupted during upload; attendance required/preferred GPS policies; offline download/reload/expiry; server-side assignment revocation; quota/eviction behavior; and waiting app updates with unsynced work on intended mobile devices. Run critical paths with the actual hosted configuration before promotion. Previously exposed credential rotation remains an environment responsibility.
