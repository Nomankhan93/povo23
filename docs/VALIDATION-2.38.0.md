# FieldLance 2.38.0 validation

## Automated release checks

Run:

```bash
npm run metadata:check
npm run release:consistency
npm run types:check
npm run test:attendance-238
npm run test
npm run check
npm run preflight
npm run test:local
```

The dedicated 2.38 regression verifies the forward migration contract, RLS/guarded RPC boundaries, required-location failure, explicit check-in/out evidence, delayed-capture timestamps, immutable adjustments, platform-staff read-only oversight, daily-rate payable idempotency, and personal/project attendance reporting.

## Manual multi-role checks

### Field Worker

1. Open `/app/field/attendance` and an active assignment.
2. Confirm the page explicitly says no 24/7/background tracking occurs.
3. Start work with location permission granted; verify accuracy is shown.
4. End the workday with a work note; confirm the session becomes submitted.
5. Open `/app/field/timesheets`; confirm duration/status/history are readable.
6. Verify another worker's attendance is inaccessible.

### Location policy

1. Set a project to **required** location and deny browser permission; check-in must fail closed.
2. Set policy to **preferred**; unavailable location requires a reason but may proceed.
3. Set policy to **not required**; no location should be silently requested.
4. Confirm coordinates are captured only on explicit check-in/out actions.

### Organization Admin / Project Manager

1. Open Project → Field Work → Attendance.
2. Configure valid project timezone/location policy.
3. Review a submitted session; request correction and confirm worker can resubmit.
4. Adjust effective timestamps before approval with a mandatory reason; verify raw capture times remain unchanged and adjustment history is appended.
5. Approve a `daily_rate` session and confirm exactly one `work_payable_units` day record exists.
6. Confirm approval does not mark the payable financially approved/paid.

### FieldLance Staff / Area Focal

1. Authorized FieldLance survey/admin staff may inspect project attendance through existing project oversight authority but cannot perform routine attendance approval solely because of the platform role.
2. Area Focal Person does not receive broad attendance-management controls.

### Offline/reconnect

1. Load attendance while online, disconnect, capture start/end, reconnect and sync.
2. Confirm original `captured_at` differs from server `received_at` when delayed.
3. Confirm duplicate sync/request IDs do not create duplicate sessions/location events/payable units.

## Financial regression

- `daily_rate`: approved attendance is required and creates/reuses one day payable unit.
- `fixed_assignment`: existing completed-assignment claim behavior remains unchanged.
- `per_verified_survey`: approved survey response reconciliation remains authoritative.
- No `hourly_rate` compensation type or automatic hour-based payout is introduced.
