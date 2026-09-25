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
