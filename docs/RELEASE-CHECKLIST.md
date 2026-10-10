# Current release checklist — FieldLance 2.42.8

- [ ] `npm ci` completed in the normal development environment.
- [ ] `npm run test:finance-payables-2428` passes.
- [ ] Funding retry/assurance, payments, earnings-wallet and wallet-capability regressions pass.
- [ ] Attendance/payable integration regressions pass.
- [ ] Project Workspace, UI Foundation and accessibility regressions pass.
- [ ] Context switching cannot show stale/mixed project finance metrics or enable actions for an unverified context.
- [ ] Failed funding-source creation preserves entered form values.
- [ ] Double confirm cannot create a second financial request; uncertain retry reuses the exact retained request identity/payload.
- [ ] Payables preserve amendments, claims, survey recovery, receipts, journal event/reversal IDs and separate pagination.
- [ ] Valid signed amounts/overpayment balances remain visible; missing/invalid values are not displayed as zero.
- [ ] Desktop/mobile target sizes and mobile card presentation verified in browser.
- [ ] `npm run release:consistency`, `npm run types:check`, `npm run check`, `npm run build` and `git diff --check` pass.
- [ ] Final finance certification: `npm run preflight` passes.
- [ ] No database migration, RLS, grant, RPC, capability, route or Project Workspace integration change is present.
