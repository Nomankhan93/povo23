# Upgrade to FieldLance 2.41.1

This corrected package applies directly to **2.41.0**. Do not install the earlier 2.41.1 ZIP first. If that earlier migration was already applied, stop and use a forward correction instead of rewriting its history.

## Before upgrade

1. Start from a clean, validated 2.41.0 working tree.
2. Close active development servers before replacing source files.
3. Preserve local `.env.local` and other secrets; they are not part of the patch.

## Apply

Use the supplied conflict-checking patch installer. It verifies baseline and payload hashes before writing files and stores source backups under `.fieldlance-patch-backups/`.

## Database

2.41.1 adds one forward migration:

`20261013000460_map_completeness_evidence_review.sql`

Apply it locally before serving the 2.41.1 client. After all local validation passes, push the same migration to the intended linked Supabase project.

Do not edit or replace earlier map/location migrations. The previous `field_operations_map(...)` RPC remains supported for compatibility.

## Validation

```bash
npm ci
npx supabase start
npx supabase migration up --local
npm run types:check
npm run metadata:generate
npm run metadata:check
npm run test:map-review-2411
npm run preflight
npx playwright install chromium
npm run test:browser-map-2411
npm run test:local
git diff --check
```

Before remote migration deployment:

```bash
npx supabase db push --dry-run
```

The dry run should list only the intended pending forward migration(s). Then run `npx supabase db push`.

## Rollback guidance

Prefer a forward 2.41.x correction rather than rewriting migration history. The new client depends on the paged RPC; rolling the client back to 2.41.0 leaves the additional RPC harmless, but do not delete migration history from a deployed database.
