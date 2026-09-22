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
