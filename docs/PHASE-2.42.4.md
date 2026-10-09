# FieldLance 2.42.4 — Recruitment & Marketplace UX + Local UI Debt Retirement

## Scope

Presentation/UI-architecture redesign for the existing recruitment and marketplace workflow. Recruitment state, eligibility, consent, application-time profile snapshots, formal assignment offers, compensation snapshots, schedule conflict rules, invitation semantics, authorization and database behavior remain unchanged.

## Marketplace and applications

`WorkforceMarketplace.tsx` now presents available projects as operational cards with existing organization/project, area, dates, compensation, deadline, requirements, eligibility and match context. Desktop organization application review uses a compact master/detail workspace; mobile presentation uses list-to-detail at the approved 639px breakpoint without changing recruitment routes or exact-entity deep-link loading.

Application state remains distinct from formal-offer and assignment state. Applicant details render the immutable application-time recruitment snapshot as a readable summary while retaining the complete technical snapshot for audit fidelity.

## Formal offers and assignments

The existing assignment-offer fields, compensation source/snapshot, `check_work_assignment_conflicts` call, hard-conflict blocking, `create_work_assignment` payload, worker accept/decline callbacks and completion/cancellation behavior remain authoritative. The redesign changes hierarchy and readability only.

## Direct invitations

`InvitationsPanel.tsx` and `InviteVolunteer.tsx` now make the recruitment-interest nature of invitations explicit: invitation acceptance does not activate an assignment or field access. The previously unreachable standalone invitation-opportunity creator presentation was removed after source inspection confirmed this component had no reachable `setCreate(true)` trigger; historical invitation-only opportunities and their close/history behavior remain available.

## CSS architecture

`WorkforceMarketplace.module.css`, `InvitationsPanel.module.css` and `InviteVolunteer.module.css` own recruitment-specific layout only. They use existing `--fl-*` design tokens and the approved 1023px / 639px responsive strategy, with no hard-coded feature palette, `!important`, or operational typography below 12px. The obsolete global `.invite-inline` rule was removed after confirming there are no remaining source consumers.

## Backend boundary

No SQL, migration, schema, RLS, grant, RPC implementation or capability/route change is included. Migration count and head remain unchanged.
