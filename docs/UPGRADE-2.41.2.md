# Upgrade to FieldLance 2.41.2

Apply the patch to the latest 2.41.1 project. The installer accepts the original date assertion or the verified `work_date::text` correction already applied during diagnosis. Other conflicts stop before writes.

No new SQL migration is included. Do not replay, rename or edit 00460/00461 migrations. This patch creates a private source backup and does not deploy or commit.

```bash
nvm use
npm ci
npm run metadata:generate
npm run preflight
npx playwright install chromium
npm run test:browser-241
npm run test:browser-network-2412
npm run test:browser-map-2411
npm run test:local
git diff --check
git status --short
```

`test:local` requires your running local Supabase stack. The old diagnostic/backup scripts remain on disk but are ignored by Git; do not include them in the release commit.

On browser failure, share the automatic `BROWSER FAILURE DIAGNOSTICS` output. It contains synthetic fixture data. Do not clear real unsynced device data to repair a test.
