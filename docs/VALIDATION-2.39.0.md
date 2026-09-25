# FieldLance 2.39.0 validation

## Automated validation

```bash
npm run types:check
npm run metadata:check
npm run test:case-ownership-239
npm run preflight
npm run test:local
```

The dedicated regression validates:

- one active named case owner;
- Field Worker eligibility through active project/collection-area assignment;
- Area Focal eligibility through active project staff + focal geography;
- explicit delegation before delegated case access;
- bounded My Cases / My Follow-ups data;
- immutable reassignment history and optimistic concurrency;
- existing Task Center follow-up task reassignment;
- delegated follow-up scheduling/completion without broad case-management rights;
- automatic live-access removal after worker/focal authority revocation or case closure;
- cross-Organization denial and direct-write protection.

## Manual multi-role validation

### Project Manager / NGO Admin

1. Open an existing beneficiary case.
2. Confirm the case queue shows Assigned / Unassigned ownership totals.
3. Assign an eligible Field Worker.
4. Reassign to an eligible Area Focal and provide a reason.
5. Review immutable ownership history.
6. Remove the owner and confirm the reason is retained.

### Field Worker

1. Open **My Cases** and confirm only explicitly assigned cases appear.
2. Open a case and verify bounded beneficiary/need context.
3. Schedule or complete a structured follow-up.
4. Open **My Follow-ups** and confirm due/overdue work is visible.
5. Confirm Organization finance/assistance approval controls are absent.

### Area Focal

1. Confirm project geography alone does not show a case before delegation.
2. After explicit delegation, open the project Cases page.
3. Confirm only delegated cases inside the assigned focal geography appear.
4. Revoke the focal project assignment and confirm live case access disappears.

### Closure / revocation

1. Assign a case owner, then close an otherwise closure-eligible case.
2. Confirm delegated access ends while ownership history remains.
3. Deactivate a Field Worker project assignment and confirm owned-case access ends.
