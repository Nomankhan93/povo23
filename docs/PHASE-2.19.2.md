# POEM 2.19.2 — Assistance Ledger & Duplicate-Support Controls

## Objective

Connect a **ready 2.19.1 distribution plan** to the existing authoritative delivered-assistance ledger while preventing accidental or unauthorized duplicate support.

Authoritative chain:

`approved survey → beneficiary_need → beneficiary case → approved assistance request → distribution plan → duplicate-support review → assistance_entries`

`assistance_entries` remains the delivered-support source of truth. 2.19.2 does not introduce a second beneficiary ledger.

## What is new

- `assistance_distribution_deliveries` — RPC-only provenance link between a distribution plan/request/case/need and the existing `assistance_entries` row.
- One active recorded delivery per plan and per assistance request; voided delivery links remain historical and allow a corrected replacement.
- `assistance_duplicate_support_preview` — canonical-identity duplicate review before delivery.
- Blocking controls for:
  - same-category assistance whose recorded `next_eligible_on` has not yet been reached;
  - same-day same-kind same amount/quantity support for the canonical beneficiary.
- Thirty-day same-category history is surfaced as advisory context, not an automatic blocker.
- Protected assistance outside the caller's project authority is not disclosed to the caller. A protected blocker requires POEM survey authority.
- Project Manager cannot override a blocking duplicate signal.
- NGO Admin may override only when all blockers are within the NGO Admin's existing project authority and must provide a documented reason.
- POEM survey authority may resolve protected duplicate blockers with an auditable override reason.
- `record_assistance_distribution_delivery` derives kind/category/program/amount or quantity/unit from the approved assistance request rather than trusting browser-supplied financial/support terms.
- Planned delivery automatically links the created `assistance_entries` row to the assessed need.
- Existing `void_assistance` now marks the plan-delivery provenance link void while preserving history and permitting a corrected replacement.
- A distribution plan with an active recorded delivery cannot be cancelled until the assistance ledger entry is voided.
- Existing `record_assistance` remains available for genuine unplanned/historical support but cannot bypass a ready controlled plan and cannot bypass canonical same-day/eligibility duplicate blockers; reviewed duplicate support must use the case/request distribution workflow.
- `assistance_ledger` provides a project/organization-scoped delivered-support view and distinguishes controlled planned deliveries from historical/unplanned records.
- Beneficiary case detail exposes sanitized delivery status without exposing internal cross-NGO duplicate snapshots.
- New Assistance ledger workspace and `npm run test:assistance` regression suite.

## Authorization

The existing `app_private.can_manage_project()` boundary remains authoritative:

- POEM survey/data authority: scoped delivery, ledger and full duplicate review.
- NGO Admin: own-organization project delivery and ledger; may override only fully visible blockers.
- Project Manager: assigned-project delivery and ledger; cannot override blocking duplicate signals.
- Area Focal Person: no automatic case, plan, delivery or assistance-ledger management access.

Cross-NGO assistance detail is not surfaced through 2.19.2. Existing controlled data-sharing workflows remain the place for explicitly authorized cross-NGO summaries. The duplicate guard may require POEM review without disclosing the protected source record.

## Integrity rules

- Plan must be `ready`.
- Assistance request must remain `approved`.
- Beneficiary case must remain `open`.
- Assessed need must remain actively linked and not `closed`.
- Organization must remain active.
- Canonical beneficiary identity must be active before planned delivery.
- Ledger values are copied from the approved request; delivery date, actual description, funding source, evidence reference and optional next-eligibility date are supplied at execution.
- Duplicate review and insert are serialized on the canonical beneficiary row to reduce cross-project race conditions.
- Delivery uses optimistic plan version checks.
- One active recorded delivery per plan/request is enforced with partial unique indexes.
- Internal duplicate snapshots are stored in an RPC-only provenance table and are not returned by ordinary case detail/ledger RPCs.
- Voiding delivered assistance preserves both the original `assistance_entries` row and its distribution provenance history.

## Explicit non-goals

2.19.2 does **not**:

- create beneficiary cash wallets or balances;
- treat beneficiary assistance as worker compensation;
- create `work_payable_*` events;
- reserve or post project finance journals automatically;
- send JazzCash/Easypaisa transfers to beneficiaries;
- implement inventory/warehouse stock accounting;
- auto-close beneficiary needs or cases;
- infer impact/outcomes from delivery;
- expose protected cross-NGO assistance details outside existing sharing authority.

Follow-up, outcomes and case closure remain Phase 2.19.3.
