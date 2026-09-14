# POEM 2.9 validation

Build-workspace result: `npm run preflight` passed, including all 16 new SQL scenarios. Eight guarded-installer scenarios passed: read-only/exact apply, reapply, custom notes/scripts/dependencies, local conflicts, migration drift, lock mismatch, symlink rejection and traversal rejection. The existing main-bundle >500 kB warning remains.

The new SQL test suite executes against the complete migration schema in PGlite. Its 16 scenarios cover:

1. NGO case isolation and independent reviewer permissions.
2. NGO evidence review separate from operational activation.
3. Volunteer verification and stale review versions.
4. Self-approval rejection and requester withdrawal.
5. Canonical merge approval is not beneficiary identity verification.
6. Independent beneficiary verification after canonical review.
7. POEM-only policy publication with version guards.
8. Policy-token rejection and response-to-policy provenance.
9. Collection pause with safe acknowledged request replay.
10. Verification revocation blocks governed collection without unpublishing a profile.
11. Discovery changes preserve policy revision history.
12. Volunteer source changes invalidate verification.
13. Reverting NGO identity edits cannot resurrect old verification.
14. Expiry without a scheduler.
15. Raw mutation, foreign policy and anonymous access denial.
16. Event history and RLS on every public table.

`npm run preflight` covers generated types, TypeScript, prior regression suites, this new suite and production build. Existing tests include both behavioral and structural checks; their total is not an end-to-end count.

PGlite is not a full Supabase Auth/PostgREST/Storage deployment. Local operations require Docker/Supabase; the build environment could not complete that gate. Real browser and field acceptance remain pending. No production deployment or hosted migration was performed.

## Operator acceptance in WSL

- Request NGO registration review from NGO A. NGO B cannot see it. A different authorized POEM reviewer inspects evidence and approves it with a method and expiry.
- Confirm the requester cannot self-approve, an affiliated NGO reviewer is rejected, and a stale reviewer form cannot overwrite a newer decision.
- Publish a volunteer profile without waiting for verification. Request separate identity verification. Inspect expiry, withdrawal, rejection, renewal and revocation behavior.
- Verify a beneficiary only after canonical source review; then correct/merge the identity and confirm the verification becomes stale.
- Edit a verified volunteer profile and confirm its conservative snapshot verification becomes stale. Edit and restore NGO name/registration and confirm old verification stays stale.
- Inspect a legacy project, then publish a policy requiring both NGO and volunteer verification. Verified collectors can save; an unverified/revoked/expired collector cannot.
- Pause collection and confirm new saves fail. Retry an already acknowledged payload and confirm it returns the original response without mutation.
- Queue a synthetic offline survey, change project policy, then reconnect. Recover the rejected item, reload the project, review the new policy, obtain consent again and save. Confirm the old source copy remains available until explicitly discarded.
- Restore a device draft created under an earlier policy and confirm consent is unchecked. New response and revision records should reference the accepted policy version.
- Verify policy/discovery history, NGO scope isolation, load/error states, keyboard navigation and narrow-screen layout.

Retention deletion, export enforcement tooling, external issuer checks, malware scanning and a verification document viewer are not implemented by this patch.
