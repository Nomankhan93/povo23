# Validation index — POEM 2.19.0

Current release validation: [VALIDATION-2.19.0.md](VALIDATION-2.19.0.md).

Previous payment release validation: [POEM 2.18.3](VALIDATION-2.18.3.md).

Previous manual settlement validation: [POEM 2.18.2](VALIDATION-2.18.2.md).

Previous e-wallet stabilization validation: [POEM 2.18.1](VALIDATION-2.18.1.md).

Previous e-wallet sandbox validation: [POEM 2.18.0](VALIDATION-2.18.0.md).

Previous payable-finance validation: [POEM 2.17.2](VALIDATION-2.17.2.md).

Previous project-funding validation: [POEM 2.17.1](VALIDATION-2.17.1.md).

Previous finance-core validation: [POEM 2.17.0](VALIDATION-2.17.0.md).

# Phase 2.3 validation

Passed: database-generated type drift check, TypeScript, Vite 8.0.16 production build and 163 SQL workflow/security checks (26 foundation, 19 geography/documents, 22 directory/roles, 28 experience/invitations, 20 survey/registry, 23 registry/assistance and 25 needs/follow-up).

Fresh schemas apply seven migrations. A populated Phase 2.2 upgrade fixture verifies unchanged existing responses and assistance and confirms that needs are not inferred during migration. All six previous SQL files and Supabase configuration remain byte-identical.

New checks cover approved-source provenance, idempotent creation and conflict detection, validation, no inferred needs, met/link constraints, person isolation, stale/no-op changes, link history, void-triggered re-review, unlink/reopen behavior, creation retries after edits, exact project/person counts and UTC due dates, preserved identity snapshots, direct-write/history denial, collector and cross-NGO isolation, account suspension, closed-project follow-up, active-NGO creation and anonymous RPC denial.

PGlite simulates Auth/Storage schemas and JWT subjects; these are not real Docker/Auth HTTP, mobile/browser or concurrent-session tests. The existing test:local script checks real local Auth/Storage services when run locally. See PHASE-2.3.md for new UI and concurrent-session manual checks.

The production build reports a non-blocking warning for the roughly 510 kB minified application chunk (roughly 140 kB gzip). Route-level loading/performance optimization remains future work; the threshold was not hidden or raised.

Packaging checks cover clean and repeated apply, README suffix preservation, custom scripts and a synthetic synchronized Vite change, local conflict refusal before writing, corruption rejection, traversal/symlink protection and ZIP integrity. The synthetic version fixture validates installer preservation only; it does not install or certify that alternate dependency version. No npm dependency additions or updates are required.

Installer source backups are not database backups. No database command is executed by the installer. ZIPs exclude local environment credentials, node_modules, build output and git data. This is an online operational pilot, not a completed production security or performance certification.
