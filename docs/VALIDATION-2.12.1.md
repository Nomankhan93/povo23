# Validation 2.12.1

Full npm run preflight passed: generated schema types, TypeScript, existing SQL/protocol/storage/UI regressions, nine new area helper/server-rendering scenarios, six new NGO operations SQL scenarios, production build and static-worker checks. No new dependencies. The inherited Vite main-chunk size warning remains; build succeeded.

Guarded installer scenarios cover read-only check, exact baseline apply, repeated apply, appended README/custom script preservation, local edit rejection, baseline migration drift, dependency-lock mismatch, symlink and path traversal protections (8 grouped scenarios).

Prior migrations are checked byte-for-byte against the supplied latest ZIP. One new forward migration expands NGO area levels; existing schema types are unchanged because the RPC signature is unchanged.

Real mobile/native dropdown interaction, browser layout, Supabase Auth/HTTP integration and hosted migration have not been exercised here. Follow PHASE-2.12.1.md and UPGRADE-2.12.1.md before rollout.
