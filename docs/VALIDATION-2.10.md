# POEM 2.10 validation and acceptance

Build-workspace result: `npm run preflight` passed, and all eight guarded installer scenarios passed.

Automated build checks: generated database types, TypeScript, previous regression suites, 17 new SQL scenarios, two client behavior groups and the production build. SQL scenarios use the complete migration chain in PGlite, including synthetic Storage rows/RLS. They do not exercise HTTP upload bytes or actual Supabase Storage service behavior.

New coverage: immutable template publication; invalid forward/cyclic conditions and ranges; cascading hidden answers; draft versus submission rules; phone/identity/multiple choice; date comparisons; repeated-member validation and guardian consent; GPS bounds/reasons; upload consent/authority; reservations without storage objects; evidence immutability; foreign collector/NGO denial; reviewer access; policy pause; anonymous denial; RLS/audit history. Client behavior tests exercise visibility cleanup and validation before queueing.

Guarded installer checks: read-only dry run/exact clean apply, idempotent reapply, appended README/custom scripts/synchronized dependencies, changed source refusal, immutable migration refusal, lock mismatch, symlink refusal and traversal refusal.

The existing main bundle warning above 500 kB remains. No production or hosted database migration was performed. Real Supabase Auth/PostgREST/Storage, browser rendering and mobile camera/GPS acceptance remain pending in WSL. A passing PGlite test is not a substitute for these gates.

## Required pilot acceptance

1. Apply on 2.9.0 with `--check`, migrate locally without reset, run preflight and local/operations tests.
2. As survey manager, publish every new field type. Clone and publish v2; confirm the original project's template/version is unchanged. Invalid/deleted condition parent must refuse publication.
3. As assigned collector, select a condition, fill a dependent field, then change its parent. Verify the dependent value is absent from the review and saved response, including after draft restore.
4. Save a draft missing a required question; submission must reject the missing answer. Invalid ranges, dates, identity numbers and incomplete member rows must be corrected before queueing.
5. Enter an adult respondent with a minor member. Missing representative details must reject save. Confirm repeated members do not automatically appear as new registry identities.
6. Obtain consent and choose attachment authority. Upload a small JPG, PNG and PDF on a real local Supabase instance. A PDF must not be accepted as a photo. Wrong MIME/size/header files must fail appropriately. Ensure uploaded evidence is accepted by the response save; inspect real Storage metadata if the service shape differs from the test fixture.
7. Deny location access, record a reason and save. Allow location access, check accuracy/time and save. Check rendering and controls on a narrow mobile screen.
8. Review structured member/GPS/multiple-choice answers as the authorized supervisor. Prepare/open the private file link. Confirm no attachment row/object is visible to NGO B or a different collector. Confirm the link expires.
9. Pause the policy or revoke an assignment after reservation; new uploads/saves must fail. A previously acknowledged survey retry must still use the existing receipt without creating a duplicate.
10. Disconnect the network. JSON drafts and existing uploaded references use the existing device recovery workflow. A new attachment must explain that online upload is required. Do not assume file bytes are protected by the JSON draft queue.
11. Request a correction, edit and resubmit, then approve. Confirm response revisions, policy version and evidence references remain inspectable.
12. Confirm volunteer self-publication, existing NGO isolation and canonical registry workbench still work.

Keep synthetic data for acceptance. Record real browser/device, Supabase versions, upload results and outstanding failures before a wider pilot.
