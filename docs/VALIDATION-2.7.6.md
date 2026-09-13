# POEM 2.7.6 validation

Validated in the build workspace on 13 September 2026 with Node 24.19.0. `npm run preflight` completed successfully. The 21 new regression scenarios and 8 installer scenarios passed.

## Automated checks

- `npm run preflight`: generated schema types, TypeScript, existing migration/role suites, new regressions and production build.
- `scripts/test-correctness276.mjs`: real SQL execution in PGlite against all migrations; 11 reported regression scenarios cover discovery policy, foreign probes, NGO isolation, source correction, fresh sharing authorization, repeated/legacy merge pointers, stale versions, chained reversal and RLS.
- `scripts/test-offline-recovery276.mjs`: 8 runtime scenarios using real Node WebCrypto and a serialized IndexedDB model. Covers concurrent first writes, immutable request payloads, owner checks, atomic draft recovery, retry IDs, unreadable copies, per-item discard and definitive rejection.
- `scripts/test-survey-save276.mjs`: 2 hook control-flow regressions using React ref/state stubs, covering callback failure after acknowledged and offline-durable saves.

PGlite is not the complete Supabase Auth/PostgREST/Storage stack. The IndexedDB model is not a real browser. Hook stubs do not replace rendered React testing. Older suites include structural checks; their total is not an end-to-end test count.

Installer checks covered read-only validation, exact clean apply, idempotent reapply, README/custom-script/dependency preservation, edited-code and migration-drift rejection, lockfile mismatch, symlinks and traversal.

## Checks to run in WSL

`npm run test:local` and `npm run test:operations` require running local Supabase/Docker. These were not completed in the patch build environment because Docker was unavailable. The operations command was attempted and stopped at that prerequisite.

Manual acceptance checklist:

1. Two browser tabs, same origin: first-use offline draft writes survive reload and decrypt in both tabs.
2. Queue an offline new survey, reopen/reconnect, and confirm one server response for its original request UUID.
3. Cause a validation rejection. Inspect answers, recover to a draft, reopen the indicated survey, correct it and save. Verify source copy remains and old-request retry is disabled. Discard only that copy.
4. With an existing draft, recovery refuses to overwrite it. Pending copies have no discard/edit action.
5. Sign out and switch accounts. Another account cannot inspect/recover/discard the original owner's copies. Original owner can recover after signing back in.
6. Edit name/DOB on a project record with a sharing grant. Old summary access ends; POEM sees review required. Select the authoritative source and submit a fresh request through both approvals.
7. Confirm discovery starts disabled. Enable it as POEM for the source project. NGO sees only its name for an already linked beneficiary, with no assistance/needs existence flags.
8. Repeat a canonical match review and reverse the merge using the existing authorized workflow; decisions and history remain consistent. Test a stale version and a chained merge reversal.
9. Publish a volunteer profile without mandatory admin approval. Workforce says active/profile location; verified experience labels still describe NGO-confirmed experience.
10. Submit a data sharing request and confirm form reset and success feedback without a post-submit error.

The build still reports a main JavaScript chunk above 500 kB. Bundle splitting is deferred; this patch does not claim performance or large-dataset certification. Full browser acceptance, hosted migration, real field networking and production rollout are separate gates.
