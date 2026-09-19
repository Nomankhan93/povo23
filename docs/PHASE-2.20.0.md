# FieldLance 2.20.0 — Field Worker Workspace UX

## Objective

Make the personal Field Worker workspace a coherent daily operating surface without replacing the stable recruitment, assignment, survey, payable or wallet backends.

## User journey

**Discover → Apply → Selection → Assigned → Complete → Earn**

The Home dashboard surfaces the next action but never performs privileged recruitment/payment mutations itself.

## Delivered UX

- Dedicated Field Worker Home on personal Overview.
- Summary metrics for open opportunities, applications in review, assignment offers, active assignments, completed work and available PKR earnings.
- Next-action hierarchy that prioritizes profile setup, offers, active work, recruitment progress and opportunity discovery.
- Current assignment/offer preview.
- Recent application pipeline.
- Existing earnings and wallet summary with navigation into the authoritative payables/withdrawal workspaces.
- FieldLance verified work-history preview from existing project evidence.
- Profile readiness and account-readiness actions.
- Offline field access from the daily workspace.
- Personal navigation presentation labels: Home, Verified work history, Invitations & offers, Earnings & payables, Wallet & withdrawals.

## Architecture rules

- No new Supabase migration.
- No new opportunity, application, assignment, work-history or earnings source of truth.
- Dashboard reads existing `work_applications`, `work_assignments`, `available_work_opportunities`, `my_withdrawal_summary` and `work_experience_history` sources.
- Existing internal page IDs and historical role/storage identifiers remain unchanged.
- Survey access still activates only through existing accepted assignment/direct-assignment rules.
- Profile readiness is a UI completeness hint, not identity verification, eligibility scoring or reputation.
- Wallet/provider architecture remains manual/mock; no live JazzCash/Easypaisa integration is introduced.

## Next boundary

The next screen-level phase is **FieldLance 2.21 — Organization Workspace UX**, using existing project, survey, recruitment, beneficiary, assistance and finance authorities rather than replacing them.
