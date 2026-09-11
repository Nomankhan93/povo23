# Phase 1.4 validation

Executed: PostgreSQL-generated type drift check, TypeScript, Vite 8.0.16 production build and 95 SQL workflow/security checks: 26 foundation, 19 geography/documents, 22 directory/roles and 28 experience/invitations. All pass. Fresh schema creation applies all four migrations; the Phase 1.3 fixture suite runs against the current schema. Earlier migration files are unchanged.

Experience checks cover private drafts, explicit requests without CV grants, relevant NGO-only review, no self-review, invalid dates, rejected/stale review and badge reset after edits. Invitations cover grant plus shortlist requirements, immutable terms, duplicate prevention, recipient isolation, accept/decline, notifications, cancellation, expiry, closed opportunities, sharing revocation and organization/membership suspension.

The SQL tests use PGlite and simulated Auth/Storage metadata. Actual Docker/Auth/Storage HTTP tests and browser/mobile UI tests were not run here. The existing `test:local` smoke test remains available for local execution; it does not exercise the new experience/invitation HTTP workflows. Use the Phase 1.4 manual checklist for those.

Patch packaging checks cover clean baseline, idempotent reapply, README suffix preservation, synchronized Vite update preservation, local-edit refusal and payload integrity. No database commands are executed by the installer. Dependencies and environment secrets are excluded from ZIPs. Vite 8.0.16 includes the two previously reported Windows advisory fixes; this is not a claim that future audits will remain clean.
