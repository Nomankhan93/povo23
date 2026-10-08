# FieldLance 2.41.15 project lifecycle contract

## Authoritative sequence

1. An active published project owns the canonical automatic marketplace opportunity.
2. A Field Worker applies with an application-scoped recruitment snapshot/consent.
3. Authorized project management reviews and selects the application.
4. Authorized project management creates a formal immutable assignment offer.
5. Worker acceptance activates the work assignment and survey assignment atomically.
6. Collection requires the accepted active contract, active survey assignment, active project/organization and current project/contract dates.
7. Attendance starts only against an accepted active assignment; approved daily-rate attendance feeds the existing day-payable engine.
8. Submitted survey responses require independent review; self-review is denied.
9. Approved per-verified-survey responses feed the existing unique response-payable engine.
10. Authorized project management may complete/cancel the assignment; forward collection is revoked and history is retained.

## Permission invariant

Project recruitment and assignment finalization share `app_private.can_manage_project(project_id)`. UI capability checks are presentation only; PostgreSQL remains authoritative.

## Non-goals

No new payout engine, no automatic financial approval, no Area Focal recruitment expansion, no rewrite of historical assignments/payables and no relaxation of collection consent/governance rules.
