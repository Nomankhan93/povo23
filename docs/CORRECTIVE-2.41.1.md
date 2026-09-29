# FieldLance 2.41.1 — Corrective Stabilization

This corrective patch is applied on top of the current 2.41.1 source. It does not change the application version.

## Fixes

- Browser acceptance transport now implements the Supabase query-builder terminals used by the current AppShell (`single`, `maybeSingle`, `range`, and Promise-like execution) and returns the personal workspace bootstrap required by the device-recovery test.
- Daily-rate payable recovery now treats an approved attendance session's project-timezone `work_date` as authoritative. It no longer rejects a legitimate approved local workday merely because UTC is still on the previous calendar date.
- Fixed-assignment payable date rules remain unchanged.
- Daily-rate claims without approved attendance remain rejected and recovery stays idempotent.

## Database

Apply the new forward migration:

`20261013000461_daily_payable_timezone_consistency.sql`

Do not edit migration `00460` or any earlier migration.

## Validation

Run:

```bash
npm run test:corrective-2411
npm run test:browser-241
npm run test:browser-map-2411
npm run test:map-review-2411
npm run preflight
npm run test:local
git diff --check
```

The browser fixture uses a simulated transport. Real Supabase/browser/device validation remains a separate acceptance step.
