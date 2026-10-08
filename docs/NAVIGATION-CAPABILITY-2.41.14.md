# Navigation & Capability Contract — 2.41.14

`src/app/capabilityContract.ts` is the single frontend source for role-derived capability flags and authorized page IDs.

## Platform role mapping

- `super_admin`: Field Worker review, Organization review, survey management, finance, memberships, accounts and geography.
- `admin`: Field Worker review, Organization review, survey management, finance, memberships and geography; no Super Admin account-role administration.
- `volunteer_manager`: Field Worker review only.
- `ngo_manager`: Organization review and geography only.
- `survey_manager`: survey/governance/impact management only.
- `auditor`: Staff workspace visibility without management capabilities.
- ordinary Field Worker/Organization/project roles: no FieldLance Staff workspace capability.

## Workspace-derived flags

The contract combines platform capability with active workspace context for project management, project-team, project-finance, assignment, case and assistance UI affordances. Existing behavior is intentionally preserved; the patch does not infer broader authority from navigation visibility.

## Rule

Navigation is presentation. Backend RLS and guarded RPCs remain the authority boundary. A page being visible must never be treated as permission to read or mutate data.
