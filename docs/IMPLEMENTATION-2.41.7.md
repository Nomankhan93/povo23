# FieldLance 2.41.7 implementation report

**Patch status: implementation and required validations complete.** Work remains uncommitted. No staging, commit, push, deploy, hosted database change, service start/stop or database reset was performed.

## Scope and outcome

The patch is limited to F03 production wallet capability, F14 offline browser harness reliability, required regressions/fixture adaptations, generated database types, version/release metadata and directly related documentation.

F03 now defaults sandbox enrollment and simulated provider operations off. A browser cannot forge the capability through session settings or call private routines directly. Production copy no longer suggests mock ownership checks are real verification. Existing wallet/history and already valid withdrawal/manual-settlement workflows remain intact.

F14 now distinguishes native Chromium connectivity from the application offline state, verifies actual fixture transport with a unique no-store request, and covers the blocked-transport/native-online condition explicitly. Production offline modules were not changed.

## Validation

See VALIDATION-2.41.7.md for command results and boundaries. The final uninterrupted npm test passed, including the full map regression over 2,605+ records. Generated types, TypeScript, production build, offline browser, map browser, release consistency, secret scan and diff checks passed. The build retains a non-fatal large-chunk warning.

## Migration and local database

Added one forward migration, 20261013000540_wallet_production_capability.sql, after 00530. It was first validated in isolated PGlite, then applied only to the existing local poem-phase11 project after verifying the backup. Catalog checks confirm the provider RPC returns JSONB, authenticated execute is granted, anon execute is denied, and the global sandbox flag is false. No local business data was seeded or edited by the validation tests.

Backup: /home/noman/fieldlance-backups/2.41.7/pre-capability.dump (outside the repository), SHA-256 8a41f5a3cabb9c5aa5f26e8b1a0b5e8edd15dff1ca50efd8a71a23dbb9474b94; pg_restore --list successfully read the archive. The archive existed before the migration attempt, was not overwritten, and was verified before migration application.

## Compatibility and test adaptations

The mock-provider wrapper retains the pre-existing JSONB API result. Generated database.types.ts now correctly maps it to Json. Existing 2.18 payment regressions continue to read the same status and idempotent fields.

The older earnings-wallet source test expected obsolete production copy claiming ownership verification was simulated. It now requires the server capability hook, UI enrollment guard and production-unavailable explanation, and prohibits that stale claim. Payment assertions remain. The 2.18, 2.18.1 and 2.18.3 regressions explicitly enable the sandbox only in their isolated databases. The 2.18.2 regression also checks that disabling the sandbox retains valid historical-wallet manual settlement while blocking simulated-provider settlement, then re-enables the capability to preserve the pre-existing mock/manual separation assertion. Existing API, accounting and security assertions remain.

## Environment and remaining boundary

All commands ran inside Ubuntu WSL on Node v24.21.0/npm 11.19.0. The local Supabase project was poem-phase11; migration 00540 is applied locally. The branch remains codex/fieldlance-2.41.7-production-offline-stabilization on the original 2.41.6 commit base with uncommitted changes. No release artifact was committed or deployed.
