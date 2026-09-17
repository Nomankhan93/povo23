# POEM 2.13.3 — Release Consolidation

POEM 2.13.3 establishes a clean 2.13.x baseline before Project Team & Area Governance work begins. It is deliberately feature-free.

## What changed

- Release metadata is synchronized to 2.13.3 across package files and current top-level documentation.
- `PROJECT_ANALYSIS_CONTEXT.txt` is replaced with a deterministic, current snapshot instead of the stale 2.3.1-era capture.
- `FILES.txt` and `project-tree.txt` are regenerated from the current source while excluding local secrets, build output, patch backups and Supabase temporary state.
- `scripts/generate-project-metadata.mjs` adds reproducible metadata generation/checking.
- `scripts/test-release-consistency.mjs` prevents package/current-doc/context version drift and verifies the 2.13.3 no-migration boundary.
- Core architecture and permission documents now distinguish the current consolidated baseline from historical phase notes.

## Intentionally unchanged

- No SQL migration.
- No RLS, RPC, Storage-policy or database-type change.
- No authentication provider or workspace-routing change.
- No survey, registry, sharing, workforce, payable, NGO onboarding or notification business-rule change.
- No 2.13.2 authentication design change.

## Current migration baseline

The project contains 32 ordered migration files. The current migration head is:

```text
20261006000200_invitation_access_scope_fix.sql
```

Several historical migration filenames sort after the calendar date on which this consolidation release was prepared. Do not rename already-applied migrations. Future forward migrations must use a filename that sorts after the existing migration head.

## Next phase boundary

2.14 should introduce project-scoped Project Manager / Area Focal Person authorization together with reliable operational geography needed for database-enforced area isolation. It should extend existing POEM organization/project/workforce primitives rather than create parallel systems.
