# Upgrade to POEM 2.14.1

Apply this patch only after the 2.14.0 foundation and its local regression fixes are green.

```bash
nvm use
npm ci --include=dev
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
node scripts/test-phase214.mjs
node scripts/test-phase2141.mjs
```

The new forward migration is `20261007000300_project_team_workspace_ui.sql`. Do not rename historical migrations. Push to cloud only after all local gates pass.
