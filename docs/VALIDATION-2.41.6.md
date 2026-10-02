# FieldLance 2.41.6 validation

## New coverage

- test:funding-retry-2416: actual complete migration schema plus the production retry helper; normal receipt, identical replay, changed-payload rejection, committed/lost reservation, exhausted balance reconciliation, same-key release retry, definitive rejection, persistence and cross-organization denial.
- test:browser-workflow-2416: real React components/AppShell in Chromium with a simulated Supabase transport. It covers authoring navigation, native unload cancellation, keyboard focus, saved/reverted baselines, existing draft-flush failure restoration, pending funding/reload/rejection, and exact recruitment resolution with 201 assignments and 501 applications. Mobile widths: 360/390/430. Browser mocks are not claimed as live backend evidence.
- test:local-workflow-2416: actual local Auth/PostgREST/RPCs, exact application/offer reads under RLS, cross-organization/nonexistent records, real timestamp/UUID keyset cursor boundaries, formal recruitment, acceptance, project-date boundaries, immutable contract and revocation. All tagged records are cleaned up.

Existing test-phase236 source assertions now inspect the shared history guard instead of the removed inline popstate implementation; route restoration/flush/focus assertions remain. No accounting or authorization assertion was removed.

## Required commands

```bash
npm run test:funding-retry-2416
npm run test:browser-workflow-2416
npm run test:local-workflow-2416
npm run test:recruitment-hardening-2415
npm run test:collection-dates-2415
npm run test:grants-2415
npm run test:browser-recruitment-2415
npm run test:payments
npm run test:notification-routing-2413
npm run types:check
npm run check
npm test
npm run build
npm run release:consistency
npm run check:release-secrets
git diff --check
```

See IMPLEMENTATION-2.41.6.md for execution results, final version status and commit-readiness review.

## Existing failures kept separate

F14 remains the previously reproduced offline browser deep-link failure in scripts/test-browser241.mjs. That harness is unchanged and was not rerun or repaired for this patch.

An initial full npm test run stopped in unchanged test-offline-recovery276.mjs at its simultaneous enqueue ordering assertion (the second encryption completed first). Both the test and offlineSurveyStore.ts match HEAD byte-for-byte. Five isolated runs of the committed baseline passed. This intermittent existing runtime-test failure is separate from F14 and is recorded rather than hidden or fixed in this patch. The final uninterrupted 96-command npm test sequence passed, including this unchanged test. A second preliminary run stopped on a double-quote-sensitive source assertion; the original query spelling was restored without changing that test.

Validation logs remain outside the repository at /home/noman/fieldlance-backups/2.41.6/validation-logs/.
