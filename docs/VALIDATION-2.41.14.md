# FieldLance 2.41.14 validation

## Fast required checks

| Check | Required result |
| --- | --- |
| `npm run test:navigation-capability-24114` | PASS |
| `npm run test:staff-operations` | PASS |
| `npm run test:organization-workspace` | PASS |
| `npm run test:routing-domain-24111` | PASS |
| `npm run release:consistency` | PASS |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Full historical `npm run preflight` remains deferred to database/security-critical changes or final release certification.

## Dedicated regression

The 2.41.14 suite verifies:

- only the existing Staff roles can activate Staff workspace capability evaluation;
- volunteer-manager, NGO-manager, survey-manager, admin, super-admin and auditor capability boundaries remain distinct;
- Staff navigation contains only pages authorized by the centralized capability matrix;
- Organization and personal workspaces retain their curated boundaries;
- Project Manager and Area Focal Person navigation remains role-scoped;
- workspace project/team/finance/assignment action flags preserve existing semantics;
- `AppShell.tsx` consumes the central contract instead of rebuilding `standardNav`, `organizationNav` and `staffNav` arrays;
- no 2.41.14 database migration exists.

## Manual acceptance

1. Sign in as Super Admin and confirm Accounts, Memberships, Geography, survey-management and finance tools appear.
2. Sign in as Volunteer Manager and confirm Field Worker review tools appear without Organization, survey, finance or account administration.
3. Sign in as NGO Manager and confirm Organization review + Geography appear without Field Worker review or finance tools.
4. Sign in as Survey Manager and confirm survey/governance/impact tools appear without finance/account administration.
5. Open an Organization workspace and confirm its sidebar matches the previous Organization navigation.
6. Open a Field Worker personal workspace and confirm personal work/earnings/profile navigation remains unchanged.
7. Open a project as Project Manager and Area Focal Person and confirm their different project-scoped navigation remains intact.
8. Attempt privileged actions through direct URLs/API calls in normal testing; backend RLS/RPC authorization must remain authoritative regardless of UI visibility.
