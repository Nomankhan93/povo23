# FieldLance 2.21.0 — Organization Workspace UX

## Objective

Give approved organizations a professional daily operating home without redesigning stable backend architecture.

## Delivered

- Dedicated `OrganizationDashboard` for Organization Overview.
- Organization identity/logo header with registration, contact, program and operating-area context.
- Read-only metrics for active projects, open opportunities, new applications, active Field Workers, submitted surveys and active beneficiary cases.
- Priority next-action card for recruitment review, offer creation, due case follow-up, recruitment gaps and project startup.
- Project-delivery and recent-application summaries.
- Beneficiary/case/assistance and workforce/payable operational cards.
- Quick access to Recruitment, Team & access, Projects & surveys, Cases, Controlled sharing and Updates.
- Curated Organization navigation with public labels while stable internal page identifiers remain unchanged.
- Personal-only profile/work-history/wallet pages are no longer mixed into the Organization sidebar.

## Architecture boundary

This release is frontend-only. It reads existing organization-authorized tables and routes actions back to existing feature workspaces. It does not add a reporting store, duplicate registry, mutation RPC, payment integration or Supabase migration.

## Recruitment lifecycle preserved

Organization publishes opportunity → Field Worker discovers → applies → Organization reviews/selects → formal assignment offer → Field Worker accepts → active survey assignment.

The dashboard never activates survey access itself.
