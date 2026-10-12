# Current release checklist — FieldLance 2.43.0

- [ ] `npm ci` completed under Node 24.
- [ ] `npm run test:data-integrity-2430` passes.
- [ ] `correction_required` responses retain/repair an actionable survey-review task.
- [ ] Task Center authority is unchanged.
- [ ] Case `__due` reporting follows scheduled structured follow-ups and uses the legacy case date only as fallback.
- [ ] Direct-assignment work remains recorded (not completed) at `collection_closed` and becomes completed at operational completion.
- [ ] Closed-project historical response/case reporting remains readable to already-authorized users.
- [ ] Attendance/payable generation, finance reconciliation and project-closure transition RPCs are unchanged.
- [ ] Targeted Task Center, analytics, cases, project-lifecycle, attendance/payables and dashboard regressions pass.
- [ ] `npm run types:check`, `npm run check`, `npm run build`, `git diff --check` and `npm run release:consistency` pass.
- [ ] Migration lint / linked migration verification passes.
- [ ] Final certification: `npm run preflight` passes.
- [ ] Migration inventory is 88 with `20261013000590_data_integrity_reporting_consistency.sql` as head.

# Historical release checklist — FieldLance 2.42.11

- [ ] `npm ci` completed in the normal development environment.
- [ ] `npm run test:ui-consistency-24211` passes.
- [ ] Field Worker, Organization and Staff dashboard regressions pass with existing data sources/navigation/capability gates.
- [ ] Missing/malformed finance display is unavailable rather than fabricated zero; valid zero remains zero.
- [ ] Reports, Geography, Organization application review, Volunteer Directory and Memberships use desktop tables plus mobile record cards without changing RPC/filter/pagination contracts.
- [ ] Touched forms preserve field names and RPC argument shapes.
- [ ] Organization-review and membership confirmations use captured context and focus-managed shared dialogs.
- [ ] ActionDialog focus/Escape/reason/busy semantics remain intact with 44px desktop / 48px mobile actions.
- [ ] New feature modules use FieldLance tokens, >=12px operational type and only 1023px/639px breakpoints.
- [ ] Browser/mobile acceptance passes at 360/390/430px without horizontal overflow.
- [ ] `npm run check`, `npm run build`, `git diff --check`, `npm run release:consistency` and final `npm run preflight` pass.
- [ ] No database migration, RLS, grant, RPC, route, capability or unrelated workflow change is present.

# Historical release checklist — FieldLance 2.42.10

- [ ] `npm ci` completed in the normal development environment.
- [ ] `npm run test:offline-mobile-24210` passes.
- [ ] Device recovery, corrective/offline network, mobile-browser, survey collection and attendance regressions pass.
- [ ] Surveys / Attendance / Device navigation verified on desktop and deployed mobile browser.
- [ ] Survey queue retry preserves the original request identity and rejected-copy recovery semantics.
- [ ] Attendance offline queue/download behavior remains unchanged.
- [ ] Financial actions, case operations and basemaps remain unavailable offline.
- [ ] No background GPS or Background Sync dependency is introduced.
- [ ] Device erase requires exact `ERASE`, reports unsynchronized inventory and states that server records remain unchanged.
- [ ] Desktop controls are at least 44px; mobile controls at least 48px; feature CSS uses only 1023px/639px breakpoints and 2.42 tokens.
- [ ] `npm run release:consistency`, `npm run types:check`, `npm run check`, `npm run build` and `git diff --check` pass.
- [ ] Final certification: `npm run preflight` passes.
- [ ] No database migration, RLS, grant, RPC, capability, route, offline-store format or service-worker policy change is present.

# Historical release checklist — FieldLance 2.42.9

- [ ] `npm ci` completed in the normal development environment.
- [ ] `npm run test:beneficiary-cases-2429` passes.
- [ ] Case, distribution, assistance, follow-up and case-ownership regressions pass.
- [ ] Field-map explicit visit-location regression passes.
- [ ] Project Workspace, UI Foundation, accessibility and mobile-production regressions pass.
- [ ] Cases / Distribution / Follow-ups desktop tables and mobile cards verified in browser.
- [ ] Delegated case views do not expose assistance approval, delivery-recording, finance or organization-admin operations.
- [ ] Repeating an uncertain case/request/plan/follow-up create with the exact same payload reuses the same client-generated identifier.
- [ ] Changing a create payload starts a new intent identifier; successful creation clears the retained intent.
- [ ] Approved request, operational plan and delivered-assistance ledger semantics remain distinct.
- [ ] Duplicate-support protected-source privacy and override rules remain unchanged.
- [ ] Closure remains disabled until server `closure_eligibility.can_close` is true.
- [ ] Desktop/mobile target sizes and narrow-screen queue presentation verified.
- [ ] `npm run release:consistency`, `npm run types:check`, `npm run check`, `npm run build` and `git diff --check` pass.
- [ ] Final certification: `npm run preflight` passes.
- [ ] No database migration, RLS, grant, RPC, capability, route or Project Workspace integration change is present.
