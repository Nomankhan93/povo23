# POEM 2.17.1 — Project Funding & Reservation

## Objective

Add controlled project funding actions on top of the immutable 2.17.0 double-entry ledger without giving NGO Admins arbitrary journal authority and without replacing worker payables.

## What changed

- Added immutable `finance_funding_sources` for verified/opening organization funding provenance.
- Added POEM-finance-only source registration and organization funding receipt RPCs.
- Added standardized organization/project finance accounts by organization, project and currency.
- Added NGO Admin / POEM finance controlled project reserve and release RPCs.
- Added derived project funding summary: organization available, project reserved, committed and spent.
- Added project funding history and a `Project funding` workspace.
- Refactored generic journal creation behind a private core helper; the public generic posting RPC remains POEM finance-admin only.

## Accounting model

Verified organization funding increases an organization available-funds asset against a funding income/opening-equity counter account. Project reservation reclassifies available funds into a project reserved asset with a balanced journal. Releasing unused funds posts the opposite balanced reclassification.

Balances remain derived from immutable `finance_postings`. No `organization.balance` or `project.balance` column is introduced.

`project_committed` and `project_spent` account buckets are standardized now so 2.17.2 can bridge payable events without redesigning the funding model. They remain zero until that bridge posts controlled commitment/spend entries.

## Security boundary

- POEM Admin/Super Admin: register funding sources, record verified organization funding, reserve/release project funds, read finance.
- NGO Admin: read own organization finance and reserve/release verified available funds for own projects.
- Project Manager / Area Focal / Volunteer: no finance-ledger or project-funding access in this release.
- Generic `post_finance_journal` remains unavailable to NGO Admin.

## Deferred

- `work_payable_event → finance_journal` bridge: 2.17.2.
- JazzCash/provider deposits, callbacks, withdrawals and settlement: 2.18.
