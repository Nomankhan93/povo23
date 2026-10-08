# Current release checklist — FieldLance 2.41.13

Workspace Bootstrap & Refresh Efficiency. No database migration is included.

- [ ] `npm run test:workspace-refresh-24113` passes.
- [ ] `npm run test:auth-session-24112` and `npm run test:routing-domain-24111` remain green.
- [ ] Returning to a visible tab refreshes access/notifications/project assignments without resetting the whole workspace.
- [ ] Geography-dependent pages populate reference data on demand; Overview does not block on geography pagination.
- [ ] Memberships/Accounts/Activity populate the account directory on demand.
- [ ] Activity upgrades from the four-row preview to the latest 100 authorized events.
- [ ] Geography Manager invalidates and reloads geography reference data after changes.
- [ ] `npm run release:consistency`, `npm run check`, `npm run build` and `git diff --check` pass.
- [ ] Full historical `npm run preflight` remains deferred to security/database changes or final certification.

See PHASE-2.41.13.md, UPGRADE-2.41.13.md, WORKSPACE-REFRESH-2.41.13.md and VALIDATION-2.41.13.md.

# Historical release checklist — FieldLance 2.41.12

Auth Recovery & Session Boundary Hardening. No database migration is included.

- [ ] `npm run test:auth-session-24112` passes.
- [ ] `npm run test:identity-workspaces` and `npm run test:routing-domain-24111` remain green.
- [ ] Manually opening `/reset` with a normal session never exposes the new-password form.
- [ ] A real recovery email produces `PASSWORD_RECOVERY`, enables the reset form and clears recovery state after password update.
- [ ] Invalid/expired recovery redirects show a useful error and fresh reset request without retaining transient auth fragments.
- [ ] `secure_password_change = true` remains in local Supabase config.
- [ ] Hosted production Auth enables secure password change, current-password enforcement for normal password changes, leaked-password protection and production callback/reset URLs.
- [ ] `npm run release:consistency`, `npm run check`, `npm run build` and `git diff --check` pass.

See PHASE-2.41.12.md, UPGRADE-2.41.12.md, AUTH-SESSION-2.41.12.md and VALIDATION-2.41.12.md.

# Historical release checklist — FieldLance 2.41.11

Canonical Routing & Production Domain Readiness. No database migration is included.

- [ ] `npm run test:routing-domain-24111` passes.
- [ ] `npm run test:routing-236` and `npm run test:notification-routing-2413` remain green.
- [ ] `/auth/callback` is recognized and successful sessions replace it with `/` before workspace routing.
- [ ] `/verify/:code` opens public certificate verification; legacy `?certificate=` links canonicalize without changing certificate visibility rules.
- [ ] Unknown `/app`, `/org`, `/staff` and `/projects` descendants return the existing Page not found surface instead of silently showing Overview.
- [ ] Vercel `filesystem` handling precedes the SPA `index.html` fallback.
- [ ] Existing `/project/:id/*` project-tool URLs remain compatible.
- [ ] `npm run release:consistency`, `npm run check`, `npm run preflight` and `git diff --check` pass.
- [ ] After custom-domain setup, hosted Supabase Auth allows the production callback/reset origins documented in DOMAIN-ROUTING-2.41.11.md.

See PHASE-2.41.11.md, UPGRADE-2.41.11.md, DOMAIN-ROUTING-2.41.11.md and VALIDATION-2.41.11.md.

# Historical release checklist — FieldLance 2.41.10

Security Advisor RPC Surface Hardening. One forward migration is included.

- [ ] `npx supabase migration up --local` applies `20261013000570_security_advisor_rpc_surface_hardening.sql` without reset.
- [ ] `npm run test:security-advisor-24110` passes.
- [ ] `npm run test:sql-authorization` and `npm run test:recruitment-hardening-2415` pass.
- [ ] `npm run test:collection-dates-2415` passes, proving the invoker eligibility wrapper preserves collection rules.
- [ ] `npm run types:check`, `npm run release:consistency`, `npm run check` and full `npm run preflight` pass.
- [ ] Supabase Security Advisor no longer reports the two retired review functions, `can_collect_project`, or `survey_assignment_candidates` as signed-in `SECURITY DEFINER` surfaces.
- [ ] `verify_field_worker_certificate(text)` remains the only intentional anonymous public `SECURITY DEFINER` RPC and public verification still returns only consented certificate fields.
- [ ] High-impact finance/funding/payable/admin RPCs retain their existing guarded `SECURITY DEFINER` contracts.
- [ ] Enable hosted Supabase Auth leaked-password protection separately where the project plan supports it; this is an Auth setting, not a database migration.
- [ ] `npx supabase db push --dry-run` shows only the intended pending forward migration before any separately authorized remote push.

See PHASE-2.41.10.md, SECURITY-ADVISOR-2.41.10.md and VALIDATION-2.41.10.md.

# Historical release checklist — FieldLance 2.41.9

Run full preflight/build, the 2.41.9 mobile suite, 2.41.8 routing regression and existing recruitment/workflow/offline/network/attendance/map browser suites. Verify metadata, secrets and diff hygiene. See VALIDATION-2.41.9.md for actual results. Physical mobile-browser verification follows a separately authorized deployment.

# Historical release checklist — FieldLance 2.41.8

Full preflight (including production build), the six existing browser suites, test:browser-recruitment-2418, release metadata/secrets checks and git diff --check passed. See VALIDATION-2.41.8.md for actual results. No migration, hosted change or deployment is part of this patch.

# Historical release checklist — FieldLance 2.41.7

F03 wallet capability, F14 offline browser harness, full test suite, full map regression, generated types, TypeScript, build, browser tests, release consistency and secret scan passed. The local migration was backed up and applied only to poem-phase11. See VALIDATION-2.41.7.md and IMPLEMENTATION-2.41.7.md. These checks do not authorize staging, commit, push or deployment.

# Historical release checklist — FieldLance 2.41.6

F02/F04/F05 targeted, browser, real local integration, type, build and complete npm test validations passed before versioning. Overall FieldLance release remained on hold for F03/F14 at that point. See VALIDATION-2.41.6.md and IMPLEMENTATION-2.41.6.md.

# Historical release checklist — FieldLance 2.41.5

F01/F10 patch validations passed before the 2.41.5 version update. The pre-commit date-guard correction (00530) subsequently passed targeted validation and the complete npm test chain; 00490-00520 were not rewritten. Overall release remains ON HOLD for unresolved audit P1s, including pre-existing F14. See VALIDATION-2.41.5.md and IMPLEMENTATION-2.41.5.md. Do not push or deploy as part of local validation.

# Historical release checklist — FieldLance 2.41.4

Run preflight, test:browser-241, test:browser-network-2412, test:browser-attendance-2414 and test:browser-map-2411. Apply forward migration 00480 locally before test:local. No deployment or remote migration is performed by the patch installer.

# Historical release checklist — FieldLance 2.41.3

## 2.41.3 release gate

- [ ] `nvm use`
- [ ] `npm ci`
- [ ] local Supabase running
- [ ] `npx supabase migration up --local`
- [ ] `npm run types:generate`
- [ ] `npm run types:check`
- [ ] `npm run test:notification-center`
- [ ] `npm run test:notification-routing-2413`
- [ ] `npm run test:browser-241`
- [ ] `npm run test:browser-network-2412`
- [ ] `npm run test:browser-map-2411`
- [ ] `npm run test:corrective-2411`
- [ ] `npm run test:local`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] manual revoked/deleted notification-target check

Notification links must never bypass current RLS/RPC authorization. Historical notifications without exact source context continue through legacy action-page fallback.

---

# Current release checklist — FieldLance 2.41.2

## 2.41.2 release gate

- Run `npm run preflight`.
- Run `npm run test:browser-241`, `npm run test:browser-network-2412` and `npm run test:browser-map-2411` with Chromium installed.
- Keep diagnostic backups out of the release; run `npm run metadata:generate` and `git diff --check`.
- Record the local Supabase result separately with `npm run test:local`; simulated browser transport is not a live backend acceptance test.
- No new migration; retain the corrected 2.41.1 migration history through `20261013000461_daily_payable_timezone_consistency.sql`.

Validate exact generated types, full preflight, map browser acceptance and real deployment checks before release.

# Current release checklist — FieldLance 2.41.0

Offline Routing & Device Recovery. Supported app routes reopen the static offline shell; downloaded survey and attendance data stay owner-scoped. Unified inventory, explicit owner erase, attendance receipts/retry states and expiring attendance downloads complete the field device lifecycle. Backend authorization remains authoritative at sync. See docs/PHASE-2.41.0.md, docs/UPGRADE-2.41.0.md and docs/VALIDATION-2.41.0.md.

# Current release checklist — FieldLance 2.40.1

Field Evidence, Attendance & Release Stabilization. Versioned case-visit capture preserves revisions and authorized exact retries; delegated detail includes location evidence. Attendance policy refresh and encrypted device writes are stabilized. Invalid boundary geometry fails closed to unknown quality. See docs/PHASE-2.40.1.md, docs/UPGRADE-2.40.1.md and docs/VALIDATION-2.40.1.md. Existing permission boundaries remain in force.

# Current release checklist — FieldLance 2.40.0

## 2.40 release checks

- [ ] `20261013000440_field_operations_map_geographic_quality.sql` applies after 2.39 migrations.
- [ ] `npm run types:generate` and `npm run types:check` pass after migration.
- [ ] `npm run metadata:generate` and `npm run metadata:check` pass.
- [ ] `npm run test:field-map-240` passes.
- [ ] `npm run test:attendance-238` and `npm run test:case-ownership-239` remain green.
- [ ] `npm run preflight` and `npm run test:local` pass.
- [ ] Personal map cannot query another worker; cross-Organization project-map access is denied.
- [ ] Area Focal only receives assigned-geography evidence.
- [ ] Missing boundary returns `unable_to_determine`; poor/missing GPS remains reviewable.
- [ ] No continuous/background location watcher or public coordinate endpoint was introduced.
- [ ] MapLibre/OpenFreeMap loads successfully in the intended deployment environment.
- [ ] Only after all local checks pass: `npx supabase db push`, inspect `git diff --check`, commit and push.

# Current release checklist — FieldLance 2.39.0

Automatic Project Marketplace Publishing. One forward migration is included on top of the validated 2.38.0 attendance release and its 00410 permission hotfix.

## 2.38.1 release checks

- [ ] Patch `--check` passes against the validated FieldLance 2.38.0 source baseline.
- [ ] `npm ci` completes.
- [ ] `npx supabase migration up --local` applies `20261013000420_automatic_project_marketplace_publishing.sql` without reset.
- [ ] `npm run types:generate && npm run types:check` passes.
- [ ] `npm run test:auto-marketplace-2381` passes.
- [ ] Publishing an active project creates exactly one current `project_auto` marketplace listing with all-Field-Worker visibility.
- [ ] A Field Worker with no permanent Organization profile share can discover the published project and submit an application-scoped recruitment snapshot.
- [ ] Project recruitment close/reopen and platform moderation block/restore forward discovery without deleting history.
- [ ] Project compensation changes roll the automatic listing forward while preserving historical applications/assignment terms and preventing duplicate active project applications.
- [ ] Manual targeted/invite campaigns and direct worker search remain optional secondary workflows.
- [ ] Actual survey access still requires selection, formal offer and Field Worker acceptance.
- [ ] Full `npm run test`, `npm run check`, `npm run release:consistency`, `npm run preflight` and `npm run test:local` pass.

## Previous release — FieldLance 2.38.0

Assignment Attendance, Work Sessions, Timesheets, Explicit Location Evidence & Daily-Payable Integration.

## 2.38 release checks

- [ ] Patch `--check` passes against the validated 2.37.0 source baseline.
- [ ] `npm ci` completes.
- [ ] `npx supabase migration up --local` applies `20261013000400_assignment_attendance_timesheets_location.sql` without reset.
- [ ] `npm run types:check` passes.
- [ ] `npm run test:attendance-238` passes.
- [ ] Full `npm run test`, `npm run check`, `npm run release:consistency`, `npm run preflight` and `npm run test:local` pass.
- [ ] Field Worker explicitly checks in/out only against an active accepted assignment.
- [ ] Required/preferred/not-required location policy behaves correctly and no background tracking is performed.
- [ ] Captured vs received timestamps expose delayed/offline sync instead of rewriting evidence time.
- [ ] Organization Admin / active Project Manager can review; FieldLance staff are oversight-only for routine attendance and Area Focal does not gain broad approval authority.
- [ ] Reviewer corrections preserve raw evidence and append adjustment history.
- [ ] Approved daily-rate attendance creates/reuses exactly one day payable unit; financial approval/payment stays separate.
- [ ] Fixed-assignment and per-verified-survey payable semantics remain unchanged.
- [ ] Cross-Organization attendance/location RLS tests pass.

## Previous release

# Current release checklist — FieldLance 2.37.0

Workforce Scheduling, Availability, Capacity & Assignment Safety. One forward migration is included.

## 2.37 release checks

- [ ] Patch `--check` passes against the validated 2.36.1 source baseline.
- [ ] `npm ci` completes.
- [ ] `npx supabase migration up --local` applies `20261013000300_workforce_scheduling_assignment_safety.sql` without reset.
- [ ] `npm run types:check` passes.
- [ ] `npm run test:workforce-scheduling-237` passes.
- [ ] Full `npm run test`, `npm run check`, `npm run release:consistency` and `npm run preflight` pass.
- [ ] Field Worker can save weekly availability, capacity preferences and unavailable dates.
- [ ] `/app/work/schedule` and `/app/work/availability` survive hard refresh/back-forward.
- [ ] Organization offer flow shows Clear/Warning/Hard conflict without exposing foreign commitment identity.
- [ ] Hard conflict disables offer submission and is rejected by the database guard.
- [ ] Cancelled/declined/completed assignments do not consume current capacity.
- [ ] Cross-Organization RLS/privacy tests pass.

## Previous release

# Current release checklist — FieldLance 2.36.1

Partner Self-Publishing & Platform Moderation. Partner Organizations directly publish their own survey templates/projects; FieldLance applies post-publication moderation instead of pre-approval. One forward migration is included.

## 2.36.1 release checks

- [ ] Patch `--check` passes against the validated 2.36.0 source baseline.
- [ ] `npm ci` completes.
- [ ] `npx supabase migration up --local` applies `20261013000200_partner_self_publish_platform_moderation.sql` without reset.
- [ ] `npm run types:check` passes.
- [ ] `npm run test:self-publish-2361` passes.
- [ ] Updated 2.15 and 2.15.1 database regressions pass.
- [ ] Full `npm run test`, `npm run check`, `npm run release:consistency` and `npm run preflight` pass.
- [ ] Organization Admin can publish a template directly with no FieldLance approval queue.
- [ ] Organization Admin can publish a project directly and immediately see the operational project.
- [ ] Cross-Organization drafts/private templates remain inaccessible.
- [ ] FieldLance can Block / Remove from operation / Restore published project/template content with a reason.
- [ ] Temporary Block pauses effective recruitment/new assignments/new collection without destructively rewriting existing commitment state.
- [ ] Remove from operation closes/cancels forward recruitment and assignment state without deleting historical records.
- [ ] Restoring removed content does not silently reopen recruitment/recreate cancelled assignments.

## Previous release

# Current release checklist — FieldLance 2.36.0

URL Routing, Deep Links, Workspace Navigation & Mobile Field Worker IA. Canonical browser paths now restore authorized workspace/page/project context, browser history is draft-safe, project tabs and case/recruitment records support deep links, and the Field Worker mobile workspace has Home / Work / Field / Earnings / Profile primary navigation. No database migration is added. See docs/PHASE-2.36.0.md, docs/UPGRADE-2.36.0.md and docs/VALIDATION-2.36.0.md.

## 2.36 release checks

- [ ] Patch `--check` passes against an unchanged 2.31.0 baseline.
- [ ] `npm ci` completes.
- [ ] `npm run test:routing-236` passes.
- [ ] `npm run check` passes.
- [ ] `npm run release:consistency` passes.
- [ ] `npm run preflight` passes.
- [ ] Field Worker / Organization / Staff routes survive hard refresh.
- [ ] Browser Back/Forward restores authorized destinations.
- [ ] Project tabs and case deep links restore correctly.
- [ ] Pending field-draft persistence blocks unsafe browser-history navigation.
- [ ] Mobile Field Worker bottom navigation is usable at <=800px and does not hide content.
- [ ] Hosting is configured for SPA fallback on deep URLs.

## Previous release

# Current release checklist — FieldLance 2.31.0

Operational Analytics, Dashboard Accuracy & Reporting. Permission-scoped exact totals, paginated drill-downs, UTC filters, monthly current-state trends and audited CSV exports. See docs/PHASE-2.31.0.md and docs/UPGRADE-2.31.0.md.

## Previous release

# Current release checklist — FieldLance 2.30.1

- [ ] Installer source check and backup verified.
- [ ] Forward migration applied after 2.30.0; no reset.
- [ ] Full preflight passes.
- [ ] Real authenticated document upload/download/delete and retry verified.
- [ ] Survey draft preserved across project tab/back navigation; failed saves block leaving.
- [ ] Authorized Organization Admin/Staff can manage team; project-only roles cannot.
- [ ] Production lazy feature loading and mobile layout verified.

See docs/UPGRADE-2.30.1.md and docs/VALIDATION-2.30.1.md.

## 2.38.1 automatic marketplace
- [ ] New published project creates exactly one current `project_auto` marketplace listing.
- [ ] Active Field Worker can discover the project without any permanent `profile_shares` row.
- [ ] Application uses application-scoped snapshot consent and does not create permanent profile access.
- [ ] Recruitment close/moderation hides the automatic listing; reopen/restore re-enables it when project rules allow.
- [ ] Compensation changes roll forward a new current listing while old application/assignment terms remain historical.
- [ ] Organization-first worker search remains optional, not a prerequisite.

## 2.39 release checks

- Apply `20261013000430_case_ownership_delegated_operations.sql` locally before cloud push.
- Generate database types and project metadata.
- Run `npm run test:case-ownership-239`, `npm run preflight` and `npm run test:local`.
- Manually validate Field Worker and Area Focal delegated-case visibility, reassignment, Task Center handoff and access removal after authority revocation.

## 2.41.1 release gate

- `20261013000460_map_completeness_evidence_review.sql` is the only new schema migration for this patch.
- `npm run test:map-review-2411` passes with the >2,500-row pagination fixture.
- Worker, Area Focal and unrelated-organization negative map paths remain denied.
- Matched totals, loaded counts and partial-result state are visibly distinct.
- Basemap failure leaves the evidence review list usable.
- `npx supabase db push --dry-run` shows only intended pending migrations before remote deployment.


- Corrected 2.41.1 gate: revoked survey source access hides the source action; map return restores filters/selection/page depth with fresh authorization; delegated-case links retain their case ID. Run `npm run test:browser-map-2411`.
