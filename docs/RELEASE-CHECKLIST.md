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
