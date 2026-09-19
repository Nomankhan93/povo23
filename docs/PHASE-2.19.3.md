# POEM 2.19.3 — Follow-up, Outcomes & Case Closure

## Objective

Complete the beneficiary-assistance operational lifecycle after 2.19.2 delivered support:

`approved survey → assessed need → case → assistance request → distribution plan → assistance_entries → follow-up → outcome → controlled case closure/reopen`

This phase does not create another beneficiary registry or assistance ledger.

## New records

### `beneficiary_case_followups`

RPC-only operational follow-up records with:

- case / organization / project / beneficiary lineage;
- optional active assessed-need linkage;
- optional current recorded planned-delivery linkage;
- follow-up type and due date;
- scheduled / completed / cancelled lifecycle;
- structured outcome, observations, optional beneficiary feedback and next action;
- optional next follow-up date;
- optimistic version and immutable revision history.

If completion specifies a next follow-up date, the server creates a new scheduled child follow-up so future work appears in the queue.

### `beneficiary_case_lifecycle_events`

Immutable close/reopen history. Current closure fields on `beneficiary_cases` may be cleared by reopening, but the prior closure category/summary/reason remains in lifecycle history.

## Closure eligibility

Server-derived closure blockers include:

- draft assistance requests;
- submitted assistance requests;
- approved assistance requests without a current recorded delivery;
- non-cancelled distribution plans without a current recorded delivery;
- actively linked needs still `open`, `in_progress` or `needs_review`;
- scheduled follow-ups;
- current recorded planned deliveries without a completed follow-up linked to that delivery.

An approved request with a valid recorded delivery is not treated as permanently pending merely because the 2.19 request status remains `approved`. A planned delivered-assistance correction tied to a closed case requires explicit reopening first, so correction cannot silently return a need to review while the case remains closed.

## Outcome and need status

Outcome assessment is human-recorded. A follow-up linked to an assessed need may explicitly update that need using existing statuses. The RPC validates basic consistency and preserves the existing rule that `met` requires recorded linked assistance.

The platform does not automatically infer impact, eligibility or resolution from a delivery.

## Authorization

POEM survey authority, NGO Admin and Project Manager use existing project-management scope. Area Focal receives no automatic broad case/follow-up mutation authority.

Follow-up, revision and lifecycle tables are not directly exposed to authenticated browser roles. Case detail and queue RPCs return bounded operational views.

## Preserved boundaries

2.19.3 does not:

- replace canonical beneficiary identity;
- create or silently rewrite delivered facts in `assistance_entries`; the existing explicit void/correction path remains, with a reopen-first guard for planned assistance linked to a closed case;
- bypass 2.19.2 duplicate-support controls;
- add inventory or beneficiary cash-transfer execution;
- create worker payables;
- post finance journals;
- change JazzCash/Easypaisa wallets or withdrawal settlement.

Future work should be separately scoped rather than expanding case closure into finance, inventory or automated eligibility.
