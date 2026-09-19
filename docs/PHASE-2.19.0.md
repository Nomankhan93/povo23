# POEM 2.19.0 — Beneficiary Cases & Assistance Requests

## Objective

Add the missing operational layer between human-reviewed beneficiary needs and the existing delivered-assistance ledger without creating a second beneficiary registry or a second delivery ledger.

The authoritative chain is:

`approved survey → beneficiary_needs → beneficiary case → assistance request → future distribution planning → assistance_entries`

## What is new

- `beneficiary_cases` — project/person-scoped case file with source-survey provenance, priority, follow-up and controlled closure.
- `beneficiary_case_revisions` — immutable case history.
- `beneficiary_case_needs` + revision history — explicit assessed-need membership. One assessed need can belong to only one active case at a time.
- `assistance_requests` + revision history — draft/submitted/approved/rejected/cancelled planning requests for cash, goods or services.
- Case queue/intake/detail RPCs and guarded case/request mutation RPCs.
- `Beneficiary cases` workspace for POEM survey management, NGO Admin and Project Manager.
- `npm run test:cases` and `scripts/test-phase219.mjs`.

## Human-review rules

- A case requires an approved source survey for the project beneficiary.
- Assistance requests require a pending assessed need actively linked to the case.
- Project Manager may create/manage cases and submit requests, but cannot approve/reject requests.
- NGO Admin or POEM survey authority reviews submitted requests.
- Approval means **approved for planning**, not delivered assistance.
- Approval does not create `assistance_entries` and does not claim impact/outcome.
- A case cannot close while submitted/approved requests or pending linked needs remain.

## Preserved boundaries

- `registry_persons` / canonical registry remain the beneficiary identity layers.
- `beneficiary_needs` remains the assessed-needs source of truth.
- `assistance_entries` remains the actual delivered-assistance ledger.
- Existing historical needs/assistance are not inferred into cases/requests during migration.
- Cross-NGO duplicate-support coordination is not added here; that remains a later phase.
- Distribution planning, inventory/benefit-unit execution and request→delivery fulfillment are not added here; those belong to 2.19.1+.

## Validation stabilization

A forward-only follow-up migration, `20261009000110_beneficiary_case_request_stabilization.sql`, serializes new assistance-request creation with case closure / case-need membership changes. The UI also requires an explicit Approve or Reject submitter before calling the review RPC and filters case-intake needs to pending server-supported statuses. These are validation fixes only; the 2.19.0 architecture and authorization model are unchanged.
