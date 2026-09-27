# FieldLance 2.40.1 validation

Automated release validation includes TypeScript, schema-derived type consistency, release metadata consistency, production build, the full existing test chain, and new stabilization regressions.

New SQL regressions run within `npm run test:field-map-240` against PGlite with all migrations: first-capture revision history, delegated DTO evidence, optimistic version checks, immutable capture, exact replay, actor/payload mismatch, unrelated and anonymous denial, retry after finalization, malformed GeoJSON, polygon holes and legacy malformed quality.

`npm run test:field-stabilization-2401` executes the actual transpiled client using fake-indexeddb/WebCrypto and React's test renderer: first/existing encryption key, persistence across module reload, queued checkout, stable request IDs, owner isolation, concurrent checkout retention, visible decryption failures, refresh/start/checkout late policy responses and unchanged case-capture retry payloads. It also scans release sources for privileged credentials with redacted reporting.

These are Node/PGlite tests, not real browser, hosted Postgres or Supabase Auth integration tests. Local Supabase and browser smoke tests in UPGRADE-2.40.1.md remain required before promotion. PGlite's test schema includes mocked platform/crypto functions. No production deployment or credential rotation is performed by this patch.

Executed on 2026-09-27 with Node 24.19.0: the final `npm run preflight` exited 0 (926 PASS result lines, including grouped regression and build checks). Installer conflict/application/reapply checks also passed. Local Supabase and browser smoke tests were not run in this environment.
