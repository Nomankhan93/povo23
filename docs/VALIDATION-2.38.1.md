# FieldLance 2.38.1 validation

## Automated validation

Run:

```bash
npm run types:check
npm run metadata:check
npm run test:auto-marketplace-2381
npm run preflight
npm run test:local
```

The dedicated regression validates automatic project listing creation, all-Field-Workers discovery without permanent profile sharing, application-scoped consent, recruitment-state synchronization, compensation listing rollover and migration ordering.

## Manual multi-role validation

### Partner Organization

1. Create and publish a new project.
2. Do **not** create a recruitment opportunity manually.
3. Open Workforce → Recruitment listings and confirm the project has an **automatic all-Field-Workers listing**.
4. Close project recruitment through the project recruitment plan; confirm the project disappears from Field Worker discovery.
5. Reopen project recruitment; confirm it returns.
6. Change project compensation defaults before future recruitment and confirm a new current automatic listing is created while historical application/assignment records remain intact.

### Field Worker

1. Use an active/published Field Worker profile that has **not** granted permanent profile access to the Organization.
2. Open **Available projects**.
3. Confirm the newly published project is visible.
4. Apply and accept the application-scoped profile snapshot consent.
5. Confirm no permanent Organization profile share is created.
6. Confirm the Organization must still review/select the application and send a formal offer before survey assignment access is activated.

### Organization application review

1. Review the new application.
2. Shortlist/select it.
3. Send a formal assignment offer.
4. Confirm the Field Worker must accept the offer before the assignment becomes active.

### Optional direct recruitment

Confirm **Find Field Workers**, shortlists and invitations remain available but are clearly secondary/optional and are not needed for normal project discovery or application.
