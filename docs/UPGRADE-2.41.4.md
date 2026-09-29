# Upgrade to FieldLance 2.41.4

Baseline: the supplied 2.41.3 analysis ZIP, with migration history through 00470. Apply the hashed patch outside the project. Conflicting affected files stop the installer before any project writes; do not force an overwrite.

```bash
cd /home/noman/projects/poem-phase1.1
bash /path/to/extracted-patch/apply.sh "$PWD"
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run preflight
npx playwright install chromium
npm run test:browser-241
npm run test:browser-network-2412
npm run test:browser-attendance-2414
npm run test:browser-map-2411
npm run test:local
git diff --check
git status --short
```

Run browser suites sequentially. The patch includes generated types; `types:check` verifies them during preflight. No new environment variables or dependency upgrades are required.

Apply migration 00480 before publishing the matching frontend to an environment. Remote migration, deployment, commit and push are separate actions; the installer performs none of them. Retain all historical migrations. For rollback planning, the additive detail RPCs are backward compatible with 2.41.3; new exact-workday notifications require the matching frontend.
