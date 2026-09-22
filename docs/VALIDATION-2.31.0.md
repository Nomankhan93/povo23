# FieldLance 2.31.0 validation

Automated database coverage exercises focal geography restrictions, manager restrictions, worker/anonymous denial, cross-organization denial, exact counts above 500, pagination, UTC boundaries, status drill-down, audited exports, 5,000-record export limit, currency grouping, and membership revocation. Client tests verify CSV formula neutralization, quoting and the explicit field allowlist.

The delivery includes preflight.log with the complete release-check result. Database tests use PGlite with project migrations and real role/RLS fixtures. Type generation, TypeScript, existing regression suites, production build and offline-shell checks are included in preflight.

Not exercised here: a running local Supabase Auth service, linked cloud database migration, browser/mobile interaction and production-volume query latency. Run npm run test:local and the smoke checks in UPGRADE-2.31.0.md in your installation. CSV auditing records the export request; it does not prove that the browser saved the download.
