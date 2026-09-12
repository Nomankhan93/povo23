# Upgrade to POEM 2.4.0

Run from the project root in WSL/Ubuntu.

```bash
nvm use
npm ci --include=dev
npm run types:check
npm run check
npm test
npm run build
```

For local Supabase validation:

```bash
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

For the linked cloud project, first inspect the migration list and backup/confirm the target environment, then:

```bash
npx supabase db push
```

The new migration is:

```text
20260919000100_canonical_registry.sql
```

It backfills one canonical identity for each existing `registry_person`. It does **not** merge existing people automatically.

After applying, POEM survey-management staff should review cross-project candidate matches before any records are linked to one canonical identity.
