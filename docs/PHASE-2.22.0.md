# FieldLance 2.22.0 — FieldLance Staff Operations UX

## Objective

Give authorized FieldLance Staff a role-aware daily Operations Home without redesigning stable backend authority.

## Delivered

- Dedicated `FieldLanceStaffDashboard` for the FieldLance Staff Overview.
- Network metrics for active organizations/projects, recruitment, survey review, cases and finance attention.
- Priority next-action routing for organization review, Field Worker review, survey verification, recruitment oversight, withdrawals/reconciliation and case follow-up.
- Governance, delivery-network and operations-pressure cards.
- Role-aware quick access to existing operational workspaces.
- Curated Staff navigation with public FieldLance labels while stable internal page identifiers remain unchanged.
- Personal-only Field Worker pages removed from the Staff sidebar.
- Guarded finance summary through existing admin withdrawal/reconciliation RPCs.

## Architecture boundary

This release is frontend/workspace-only. It does not add a dashboard store, permission layer, finance balance source, payment provider integration or Supabase migration. All decisions and mutations remain in existing guarded workspaces/RPCs.
