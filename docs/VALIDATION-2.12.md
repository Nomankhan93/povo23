# POEM 2.12 validation

Completed in this build environment:

- Full `npm run preflight`: generated types match schema, TypeScript, all existing database/protocol/storage/UI tests, 32 new payable SQL scenarios, production build, static offline-worker checks.
- After a fixed-completion work-date refinement and explicit UTC date calculations: 32 payable SQL scenarios and production build/TypeScript/worker checks passed again.
- 20 baseline migrations remain byte-identical; one forward migration added. Generated database types included. No dependency version upgrades.
- Guarded installer checked separately; results in evidence ZIP.

Coverage includes submitted versus accepted work, per-response/day/fixed uniqueness, NGO isolation, staff finance restriction, self-approval prohibition, exact decimal partial payment, stale version, request replay, external reference uniqueness, missing/private receipts, dispute/payment block, reversal and survey withdrawal adjustments, immutable snapshots/journal, future amendments, stable pagination and suspended/anonymous access.

PGlite tests execute the schema and SQL policies, but emulate Auth and Storage catalog tables. They do not validate a real Storage HTTP upload, signed download, actual PostgREST transaction race or browser behavior. Real Auth/Storage, multi-session concurrency, mobile/keyboard and offline acceptance are pending; see ACCEPTANCE-2.12.md.

The inherited main JavaScript bundle remains about 539 kB minified and produces Vite's size warning. The new payables workspace is lazy-loaded; build succeeds. Bundle optimization remains a follow-up, not a claim of completed performance hardening.
