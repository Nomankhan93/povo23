# POEM 2.3.1 validation

Executed on the uploaded 2.3.0 baseline in an isolated working copy:

- `npm run preflight`: passed. Generated database types match all eight migrations; TypeScript and production build pass.
- 163 existing database checks plus 14 stabilization checks: passed on PGlite with the project's Auth/Storage test stubs. The membership-policy assertion was updated to require denial for NGO Managers.
- Stabilization coverage: in-place upgrade preserves identity/approved surveys and pre-existing link revision history; identical save retries; changed-payload rejection; legacy RPC bypass denial; replay after review/closure; cross-project foreign keys; scoped assistance links and void follow-up; NGO isolation; membership grant denial; closed-project revocation; anonymous denial.
- Production bundle: entry 463.68 kB minified / 130.49 kB gzip, with survey projects 47.03 kB and templates 3.37 kB loaded separately. No large-chunk warning in this build. This is not a runtime performance benchmark.
- Guarded installer: clean delivered baseline, actual uploaded source, appended README, synchronized Vite/custom scripts, dry-run, repeated application, retired-file backups, modified-file refusal, corrupted payload, traversal and symlink checks passed. Both ZIP integrity checks passed.
- Source extraction preserves existing business forms; new assistance component owns its own queries and form state. Request-safe survey saving is the main frontend behavior change.

Not verified here:

- `npm run test:operations` was attempted and stopped at the local Supabase prerequisite: Docker/Supabase are unavailable in this environment. The shipped script uses real Auth/PostgREST and five concurrent identical requests when run against local POEM. It is syntax checked, but its operational assertions and fixture cleanup have not been executed here.
- `npm run test:local`, real browser/mobile interactions, external emails, production deployment, concurrent database transactions and production load tests were not executed here.
- The user's remote schema/migration history and installed local dependency updates were not inspected.

See the frontend acceptance checklist in `STABILIZATION-2.3.1.md`. Passing the isolated checks is not approval for a large public rollout.
