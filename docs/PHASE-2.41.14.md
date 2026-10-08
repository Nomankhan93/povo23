# FieldLance 2.41.14 — Navigation & Capability Contract

Baseline: FieldLance 2.41.13. This is a frontend authorization-presentation consolidation patch. No database migration, RLS change, RPC grant change or hosted configuration change is included.

| Surface | Before 2.41.14 | 2.41.14 |
| --- | --- | --- |
| Staff role capabilities | repeated role arrays inside `AppShell.tsx` | one typed `capabilityContract.ts` matrix |
| Staff / Organization / personal navigation | separate inline navigation arrays | one authorized-page builder driven by workspace kind + capabilities |
| Project role navigation | repeated `project_manager` / `area_focal_person` checks | centralized project-role navigation contract |
| Workspace action flags | derived independently from role/workspace checks | derived once from the same capability contract |
| Sidebar presentation | authorization and icon tuples were intertwined | authorized page IDs are produced first; icons remain presentation-only |
| Historical UX tests | asserted old inline source layout | assert the centralized contract instead |

## Authorization boundary

The capability contract controls only frontend visibility and UI affordances. It does not grant access. PostgreSQL RLS, guarded RPCs, current membership/project relationships and server-side authorization remain authoritative for all reads and mutations.

## Preserved behavior

- FieldLance Staff roles keep their existing review/survey/finance/account boundaries.
- Organization workspace navigation keeps the existing curated Organization tool set.
- Field Worker personal navigation remains unchanged.
- Project Managers keep Recruitment + Beneficiary cases + Assistance ledger navigation.
- Area Focal Persons keep Beneficiary cases only within the project-scoped operational navigation.
- `E-Wallet sandbox` remains development-only.
- Project Manager team/finance permissions are not broadened by this consolidation.

## Non-goals

No RBAC redesign, new role, RLS change, database capability table, project-workflow change, route rename, or production domain change is included.
