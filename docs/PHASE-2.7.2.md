# POEM 2.7.2 — Geography & Regression Stabilization

## Purpose

This stabilization release keeps the 2.7.1 Pakistan reference hierarchy and volunteer-location UX intact while closing regression gaps discovered by the full historical test suite.

## Included

- Historical Phase 1.3 volunteer fixtures now submit a mandatory full address and a Taluka/Tehsil-level geography.
- `save_geography(...)` now requires new Districts to sit under a Division, except for the seeded Islamabad Capital Territory root (`PKREF-ICT`) where the supplied reference structure has no Division.
- Existing legacy geography rows are not moved or deleted. An existing unchanged District row can still be edited even if it predates the stricter parent rule.
- The Pakistan geography regression suite now exercises real RPC behavior instead of only checking migration source text:
  - missing full address is rejected;
  - District-only volunteer submission is rejected;
  - Taluka/Tehsil + address submission succeeds;
  - Union Council is optional;
  - supplied Union Council is persisted;
  - non-ICT Province → District creation is rejected;
  - ICT direct District creation remains allowed.

## Not included

- No changes to the supplied Pakistan reference names/counts.
- No automatic migration or re-parenting of legacy custom geography rows.
- No workforce scoring, payment accounting or unrelated UI redesign.
