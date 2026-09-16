# Upgrade to POEM 2.13

From the project root:

```bash
nvm use
npm ci --include=dev
npx supabase start
npx supabase migration up --local
node scripts/test-phase213.mjs
npm run preflight
npm run test:local
npm run test:operations
```

Only after all local gates are green:

```bash
npx supabase db push
```

## Migrations

- `20261005000000_work_experience_target_ambiguity_fix.sql`
- `20261005000100_partner_ngo_self_onboarding.sql`

If a local one-off 2.12.6 target-variable hotfix was already applied under an earlier filename, keep its migration history unchanged. The 2.13 forward compatibility migration safely re-applies the corrected function definition.

## Manual acceptance

Create a new ordinary account, open **Partner NGO application**, save a draft, upload registration proof, submit, then sign in as a POEM NGO Manager/Admin and review the evidence/application. After approval, refresh the applicant workspace and confirm the new NGO appears in the workspace selector.
