# Current release checklist — FieldLance 2.42.9

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
