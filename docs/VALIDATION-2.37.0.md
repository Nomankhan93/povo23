# Validation — FieldLance 2.37.0

## Automated

Run:

```bash
npm run types:check
npm run test:workforce-scheduling-237
npm run test
npm run check
npm run release:consistency
npm run preflight
```

The dedicated regression applies the full migration chain in the schema test database and verifies private availability RLS, manager-safe conflict summaries, cross-Organization privacy, hard-capacity enforcement, cancelled-assignment exclusion and the new Field Worker routes/UI contract.

## Manual acceptance

### Field Worker

1. Open **My Availability**.
2. Save weekdays/hours, preferred shift, travel willingness, maximum parallel projects and maximum workdays/week.
3. Add an unavailable date range.
4. Refresh and confirm settings remain visible.
5. Open **My Schedule** and confirm offered/active assignments and unavailable periods are shown.
6. Confirm another user cannot directly query the worker's private availability tables.

### Partner Organization / Project Manager

1. Open recruitment and choose an eligible candidate.
2. Open **Offer assignment**.
3. Enter target/start/end dates.
4. Confirm Assignment Safety shows Clear/Warning/Hard conflict without revealing other Organization/project names.
5. Confirm a hard conflict disables the offer button and the database rejects a direct attempted offered/active assignment mutation too.
6. Confirm warning-only conditions still allow a deliberate offer.

### Scheduling semantics

- Declined/cancelled/completed assignments do not consume current parallel-project capacity.
- Offered/active overlapping assignments do consume capacity.
- A date exception creates a warning unless the worker has no configured available day in the assignment range.
- Maximum parallel projects is a hard worker preference enforced server-side.
- Existing legacy profile availability text remains a recruitment summary, not the authoritative conflict engine.

### Routing/mobile

- `/app/work/schedule` survives refresh/back-forward.
- `/app/work/availability` survives refresh/back-forward.
- Mobile **Work** remains active on both pages.
