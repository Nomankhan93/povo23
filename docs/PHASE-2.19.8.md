# FieldLance 2.19.8 — Workforce Marketplace UX

## Objective

Make the existing recruitment backend understandable as one shared marketplace lifecycle for Field Workers and Organizations without redesigning the validated recruitment, assignment, RLS, compensation or payment architecture.

## Shared lifecycle

**Organization publishes opportunity → Field Worker discovers opportunity → Field Worker applies → Organization reviews/shortlists/selects → Organization sends formal assignment offer → Field Worker accepts → assignment becomes active → assigned survey work is available.**

Selection alone does not activate survey access. Existing direct survey assignments remain supported and are shown separately from formal marketplace contracts.

## Field Worker UX

- Available Opportunities uses marketplace cards with organization identity/logo, project, work area, dates, compensation, positions, deadline, criteria and eligibility messaging.
- Filters retain existing organization, payment, skill, work-date, deadline and geographic-area behavior.
- Applying preserves application-scoped profile-snapshot consent; it does not create permanent/full organization profile sharing.
- My Applications presents the recruitment state as a visible progress pipeline and retains eligible withdrawal behavior.
- My Assigned Surveys distinguishes formal offers, active/completed assignments and legacy/direct operational survey assignments.
- Formal offers show frozen assignment terms and require explicit Accept/Decline before the normal assignment activation path.

## Organization UX

The previous vertically stacked workforce page becomes an operational recruitment hub with:

1. **Opportunities** — create/publish/close/reopen recruitment and view applicant counts.
2. **Applications** — pipeline filters, application-scoped snapshot review, shortlist/select/reject and formal-offer handoff.
3. **Find Field Workers** — project-scoped candidate search using the existing discovery RPC and selection-source rules.
4. **Assignments** — offered/active/completed/cancelled assignment oversight and completion feedback.

Summary cards show active opportunities, new applications, pending offers and active assignments.

## Organization identity

Worker-facing opportunity/application cards reuse the approved `organizations.logo_path` / `logo_updated_at` lifecycle introduced in 2.19.7. The existing private Storage authorization remains authoritative and initials are used as fallback.

## Backend invariants

No database migration is added. Existing RPCs remain authoritative, including:

- `available_work_opportunities`
- `apply_work_opportunity`
- `withdraw_work_application`
- `review_work_application`
- `project_workforce_candidates`
- `create_recruitment_opportunity`
- `set_work_opportunity_state`
- `create_work_assignment`
- `respond_work_assignment`
- `cancel_work_assignment`
- `complete_work_assignment`

Compensation continues to use existing opportunity/project snapshots and existing payable/finance bridges.

## Non-goals

- No new recruitment registry or assignment table.
- No permanent profile-sharing grant.
- No payment/payable/wallet/provider redesign.
- No change to Partner NGO approval/RLS/storage semantics.
- No new admin approval gate for published opportunities.
- No live chat, bidding, ratings marketplace or Fiverr/Upwork clone behavior.
