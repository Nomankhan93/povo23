# Upgrade to POEM 2.12.6

POEM 2.12.6 is a forward-only upgrade over the stabilized 2.12.5 source. It does not rewrite older migration files and does not copy or delete existing manual experience rows.

## WSL upgrade

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev
npx supabase start
npx supabase migration up --local
npm run preflight
npm run test:local
npm run test:operations
```

After local acceptance, push the new migration to the linked cloud project:

```bash
npx supabase db push
```

## Upgrade notes

- Existing `volunteer_experiences` records remain unchanged.
- Existing project/survey history becomes visible automatically; there is no backfill table because history is derived from authoritative records.
- Current active assignments can appear as `In progress` immediately.
- Completed assignments and approved surveys provide POEM verification evidence.
- Recruitment applications created after this migration can include bounded POEM-verified work summaries when the volunteer grants application-scoped profile snapshot consent.
- The migration replaces `app_private.recruitment_profile_snapshot()` with the same bounded CV fields plus verified POEM work and a blank-name fallback.

Do not edit or rename previously applied migrations, including any local 2.12.5 hotfix migration. The 2.12.6 function definition is the final authoritative version after all earlier migrations.
