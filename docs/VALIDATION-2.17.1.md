# POEM 2.17.1 validation

Required gates:

- `npm run types:generate`
- `npm run preflight`
- `npx supabase migration up --local`
- `node scripts/test-phase217.mjs`
- `node scripts/test-phase2171.mjs`
- `npm run test:local`
- `npm run test:operations`
- `git diff --check`

The 2.17.1 embedded PostgreSQL suite covers finance-source authority/isolation, verified funding intake, idempotent funding receipts, standardized account creation, NGO project reservation/release, insufficient-funds protection, finance denial for Project Manager/Area Focal/other NGO, append-only funding history and preservation of the existing worker-payable boundary.

Provider APIs and payable-event finance posting are intentionally outside this release.
