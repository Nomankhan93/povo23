# Upgrade 2.30.1 → 2.31.0

Run the patch installer with --check against your project, then apply. It rejects modified source files and corrupt payloads and creates a backup before writing. Commit or back up current work first.

```bash
npm ci
npx supabase migration up --local
npm run preflight
npm run test:local
```

For a linked deployment, review the pending migrations before running `npx supabase db push`. Apply database migration before serving the new frontend. No database reset is required. Do not roll back the database by deleting applied migration history.

Smoke checks: Organization dashboard totals match report drill-down; switch organizations; project reports stay scoped; focal sees only assigned response geography; manager cannot view finance; CSV download reflects filters; dates include both boundary days; revoked membership loses access. Verify mobile layout and production-sized query latency.
