# Upgrade to POEM 2.16.0

## Prerequisite

Start from a validated POEM 2.15.1 checkout with no unresolved local changes in patch-managed source files.

## Apply

The release adds one forward migration:

```text
20261008000300_project_targets_recruitment_capacity.sql
```

After applying the patch, regenerate database-derived TypeScript types **before** preflight because this release adds project columns and RPCs:

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run preflight

npx supabase start
npx supabase migration up --local
npm run types:generate
npm run types:check
npm run test:local
npm run test:operations
node scripts/test-phase216.mjs
```

For a fresh/rebuilt local schema, it is also safe to run the migration before `types:generate`; the generator applies the migration chain through embedded PostgreSQL and does not depend on the running local Docker database.

## Cloud

Only after local validation is green:

```bash
npx supabase db push
```

## Compatibility

- Existing project rows default to manual recruitment `open` with no configured project volunteer capacity (`required_volunteers = null`).
- Existing survey targets are unchanged.
- Existing assignments, applications, invitations and responses are preserved.
- No compensation/payable schema is replaced.
- Existing/offline survey synchronization is intentionally not hard-blocked at target reach.
