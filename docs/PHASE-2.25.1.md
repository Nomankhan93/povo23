# FieldLance 2.25.1 — Identity, Onboarding & Workspace Routing Stabilization

Universal sign-in replaces persona login tabs. Signup records Worker or Organization onboarding intent in the account through the auth trigger; metadata never grants a privileged role. New organization signups have no worker profile. An explicit Join as Field Worker action creates a draft profile without changing staff or organization permissions.

The authenticated my_workspace_access RPC derives eligible workspaces from active account status, worker enrollment, organization-admin memberships, dated project staff assignments, and platform roles. Normal organization members do not gain organization-wide administration. Organization applicants use a dedicated application shell. Existing application statuses and approval transaction are retained. The loader tolerates an absent worker profile. Browser preference is per user and never authorizes access. Missing/revoked scopes resolve to an eligible workspace or access status. Scope changes flush active drafts and remount workspace content; account changes remount the entire shell. Access refreshes on focus and visibility return and is checked when switching.

## Legacy migration policy
All existing profiles, documents, assignments and money records are retained. Existing profile holders receive worker_enrollment=legacy (compatibility access, NOT asserted explicit consent). They see a confirmation action. No heuristic silently revokes old worker access. Existing organization applicants/admins get organization onboarding intent; operational memberships retain priority. Operators should review ambiguous legacy identities with the owner. New accounts follow explicit enrollment immediately. Metadata without a recognized organization intent retains worker signup compatibility for existing clients and fixtures.

## Permission boundaries
Authenticated accounts have SELECT-only table grants. New account fields can be changed only through the guarded onboarding RPC for the caller. Choosing organization starts onboarding; it does not grant organization administration. Existing backend/RLS enforcement remains in place. Suspended profiles cannot be reactivated by enrollment. Worker discovery remains independent of permanent NGO profile sharing. Local offline draft encryption/ownership behavior is retained.

## Scope
Includes targeted authentication/onboarding labels. Full navigation collapse, organization self-service settings/team management and finance changes remain later phases. No historical migrations are edited.
