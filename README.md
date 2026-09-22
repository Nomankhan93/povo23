# Current release: FieldLance 2.36.0

URL Routing, Deep Links, Workspace Navigation & Mobile Field Worker IA. Canonical browser paths now restore authorized workspace/page/project context, browser history is draft-safe, project tabs and case/recruitment records support deep links, and the Field Worker mobile workspace has Home / Work / Field / Earnings / Profile primary navigation. No database migration is added. See docs/PHASE-2.36.0.md, docs/UPGRADE-2.36.0.md and docs/VALIDATION-2.36.0.md.

## Previous release

# Current release: FieldLance 2.31.0

Operational Analytics, Dashboard Accuracy & Reporting. Permission-scoped exact totals, paginated drill-downs, UTC filters, monthly current-state trends and audited CSV exports. See docs/PHASE-2.31.0.md and docs/UPGRADE-2.31.0.md.

## Previous release

# Current release: FieldLance 2.30.1

Project Workspace Stabilization: guarded document deletion, draft-safe project navigation,
correct pending application counts, effective lazy feature boundaries, and updated permission regression tests.

Apply the forward migration after 2.30.0; no reset is required.
See docs/PHASE-2.30.1.md, docs/UPGRADE-2.30.1.md and docs/VALIDATION-2.30.1.md.

## Previous release

# Current release: FieldLance 2.30.0

## Project Workspace Completion & UX Consolidation

FieldLance 2.30.0 turns the project workspace into a real project command center. Overview, Team, Recruitment, Field Work, Responses, Cases, Finance, Governance, Documents and Activity now have distinct project-scoped responsibilities. Finance and Governance remain locked to the current project context, Organization/authorized Staff users can open the full workspace from a project detail, and Project Manager/Area Focal visibility remains aligned with backend authority.

This release adds one forward migration: `20261012000100_project_workspace_completion.sql`. It introduces a private project-document registry/storage bucket and a guarded project activity-feed RPC; existing survey evidence, organization compliance files, finance ledgers and audit history remain authoritative. Destructive project actions use an in-app reason dialog instead of browser prompts, and new project UI uses production-readable typography and responsive tabs.

See docs/PHASE-2.30.0.md, docs/UPGRADE-2.30.0.md and docs/VALIDATION-2.30.0.md.

## Field Worker Reputation & Certificates

See docs/PHASE-2.29.0.md and docs/UPGRADE-2.29.0.md for this release.

## Organization Settings, Team & Compliance

See docs/PHASE-2.28.0.md and docs/UPGRADE-2.28.0.md for this release.

## 2.27 Project Workspace & Recruitment UX Consolidation

Desktop sidebar uses 280px expanded and 76px compact layouts with an optional persistent preference. Mobile uses the existing full-label drawer. Workspace-specific collapsible groups keep tasks/updates near Home and move optional impact modules into their own group. Navigation renders only the authorized page set from 2.25.1. Its active group expands on navigation, compact icons retain accessible names and native titles, and navigation scrolls separately from identity/sign-out controls.

Public navigation, onboarding and verification terminology now uses Organization and Field Worker. Unavailable Email/Push preference controls are hidden while stored preferences are preserved. Wallet Sandbox is excluded from the production frontend import/render path; existing backend finance permissions and mock-provider services are unchanged. Audit actors prefer authorized account names and expose UUIDs only in technical details.

This release consolidates project delivery and recruitment into one project-scoped workspace. See `docs/PHASE-2.27.md`, `docs/UPGRADE-2.27.md` and `docs/VALIDATION-2.27.md`.

## Previous release notes retained

Identity, Onboarding & Workspace Routing Stabilization. See [release notes](docs/PHASE-2.25.1.md), [upgrade](docs/UPGRADE-2.25.1.md), and [validation](docs/VALIDATION-2.25.1.md).

- One universal login; Worker / Organization choices at signup only.
- Persistent account onboarding intent, optional worker profile, server-derived workspace eligibility.
- Dedicated organization onboarding and preserved project-scoped staff access.
- Existing worker profiles retain explicitly labelled legacy compatibility access; no records are deleted.
- **One additive database migration:** `20261009000900_identity_workspace_stabilization.sql`. Apply it before the new frontend.
- 2.26 adds atomic paid-opportunity funding coverage, commitment expiry/release, and explicit project finance closure states.

## Previous 2.25.0 release (historical)

Earnings, Wallet & Withdrawal UX. See [release notes](docs/PHASE-2.25.0.md), [WSL upgrade](docs/UPGRADE-2.25.0.md) and [validation](docs/VALIDATION-2.25.0.md).

FieldLance 2.25.0 turns the existing payable/e-wallet core into a coherent finance journey for Field Workers, Organizations and FieldLance Finance without creating a second ledger or pretending that live JazzCash/Easypaisa APIs are connected.

## 2.25.0 release rules

- **No database migration.** Local and remote migration head remains `20261009000800_notifications_communication_center.sql`.
- Field Worker **Earnings** summarizes approved, available, reserved-withdrawal and paid amounts from existing server-calculated sources.
- Detailed work claims/disputes remain in the existing payable ledger; Field Workers still cannot approve/pay their own work.
- **Wallet & withdrawals** continues to use verified JazzCash/Easypaisa wallet records, secure transaction PIN controls and reserved payable allocations.
- Organization finance continues to approve eligible Field Worker payable units through the existing guarded payable RPCs.
- FieldLance **Payout operations** continues to use existing guarded withdrawal/reconciliation RPCs; balances are never manually edited.
- JazzCash/Easypaisa remain **manual/mock development modes** until official live-provider credentials and integration work are explicitly approved.
- Existing finance journals, payable units, withdrawal allocations and reconciliation bridges remain authoritative.

## Current product boundaries

- PostgreSQL RLS, guarded RPCs and Storage policies remain the authorization boundary; finance dashboards/navigation are presentation only.
- Historical internal `volunteer`, `ngo` and `poem_*` identifiers remain compatible while public UX uses Field Worker / Organization / FieldLance Staff.
- No second payable ledger, wallet balance table, editable balance source, bank/IBAN integration or fake provider API is added.

## Historical foundation notes

# FieldLance Phase 2.3

Standalone React + TypeScript + Vite frontend with Supabase Auth and PostgreSQL. Designed for local WSL development with a local Supabase Docker stack. Independent of the earlier Sites-backed source snapshot.

**Start here:** [WSL setup](docs/SETUP-WSL.md).

**Existing Phase 2.2 users:** follow [safe upgrade instructions](docs/UPGRADE-2.3.md). Keep your existing project folder and database.

**Phase 2.3:** [Needs Assessment & Assistance Follow-up](docs/PHASE-2.3.md).

**Inherited Phase 2.2:** [Registry Review & Assistance Ledger](docs/PHASE-2.2.md).

**Inherited Phase 2.1:** [Survey & Registry Pilot](docs/PHASE-2.1.md).

**Inherited Phase 1.4:** [Verified experience, NGO opportunities and invitations](docs/PHASE-1.4.md).

**Inherited Phase 1.3:** [Phase 1.3 scope, permissions and checklist](docs/PHASE-1.3.md). Search/filter volunteers in 50-record pages, manage NGO operating areas/programs, maintain private shortlists and assign separate staff roles.

## Included

- Email/password signup, confirmation, login, logout and password recovery.
- Safe signup defaults: new accounts are volunteers; client metadata cannot grant admin access.
- FieldLance Super Admin / FieldLance Admin, NGO Admin memberships and volunteer workspaces.
- CV-style profile drafts, submissions, review feedback and L0/L1 verification display.
- Editing invalidates previous approval; optimistic version checks reject stale saves/reviews.
- Partner NGO self-onboarding, private registration evidence, FieldLance approval, operational status and assignment of registered accounts to organizations.
- One account can belong to multiple NGOs; explicit workspace switching.
- Recruitment/application snapshots plus project/assignment-scoped NGO profile access; the old permanent profile-sharing control is not exposed in the current UI.
- Database-enforced permissions, active-account checks, protected RPC mutations and audit events.
- Admin geography manager and cascading volunteer location selection.
- Private PDF/JPG/PNG volunteer documents with upload recovery, removal and FieldLance review.
- Verification checklist and document-review gates; evidence changes invalidate approval.
- Actionable in-app Communication Center with recipient-only access, categories, deep links, archive/history and stored delivery preferences.
- Local first-Super-Admin bootstrap helper, `.env.example`, locked npm dependencies and validation scripts.

## Important boundaries

- This is a development foundation. It is not the full FieldLance roadmap or a certified production release.
- App accounts are active after email confirmation. Volunteer profiles are self-published/active; independent verification is separate. NGO memberships are assigned through the current FieldLance/NGO administration rules. Account suspension is separate from profile publication and identity verification.
- Legacy database profile status `verified` means active/published profile in compatibility code; independent identity verification, completed training and performance are separate concepts.
- NGO “active” is operational approval. FieldLance 2.13 stores private onboarding evidence and records the application decision, while independent organization verification remains a separate governance concept.
- Volunteer recruitment access is application/assignment-scoped in the current UI. Beneficiary coordination remains a separate explicit source-NGO approval plus FieldLance authorization workflow with field allowlist, expiry and revocation. Past viewed/copied data cannot be recalled.
- Volunteer profiles now use the project-supplied Pakistan Province/Territory → Division → District → Taluka/Tehsil/Subdivision reference hierarchy. Islamabad skips Division. Union Council is manual/optional and full address is mandatory. Admin geography tools remain available for controlled maintenance; existing approvals survive upgrade until edited/reviewed.
- Survey builder and project-scoped provisional person/household registry are included. FieldLance survey managers also have a canonical cross-project identity foundation with explainable candidate review and reversible merges. Phase 2.5 adds controlled partner-NGO coordination summaries. Phase 2.6 adds encrypted device drafts and queued reconnect sync after a project/form has loaded; cold-start offline navigation, offline documents/photos and full PWA caching are still not included. Workforce payable accounting is included, but custodial account balances/payment-provider transfer, automatic performance scoring, bulk beneficiary export and SMS/email notifications beyond Auth are not included.
- No migration/import from the older Cloudflare/Sites database is included.
- Volunteer directory uses server-side filters and 50-record pages with authorized counts. Supporting UI lists still cap at 500 accounts/organizations, 1,000 memberships and 100 events; keep the operational pilot within those supporting-list caps.
- Database revocation takes effect on the next request; already rendered data is not remotely erased. Refresh the UI after account, membership, organization or grant changes.
- Never put service-role keys or server secrets into any `VITE_*` variable. The build includes a check for common secret-key mistakes.

## Commands

```bash
npm ci
npx supabase start
npx supabase migration up --local
npm run env:local
npm run dev
```

Requires Node 24 (see `.nvmrc`) and Docker for local Supabase. Frontend runs directly in WSL. No extra Dockerfile is required for this phase.

## Checks

```bash
npm run check
npm test
npm run build
npm run test:local
```

FieldLance 2.4.2 keeps `npm run test:operations` fixture teardown canonical-registry-aware. FieldLance 2.5 adds a dedicated embedded PostgreSQL sharing/RLS suite. FieldLance 2.6 adds structural regression checks for encrypted IndexedDB drafts/queue semantics and global field-sync wiring. FieldLance 2.7 adds an embedded PostgreSQL marketplace/assignment lifecycle suite. FieldLance 2.7.1 adds seeded Pakistan geography and profile-location regression checks. FieldLance 2.7.2 adds runtime profile/geography regression coverage and strict non-ICT district-parent validation.

The first three were run in the build environment. `npm test` runs the real SQL migration and RLS workflows using embedded PostgreSQL (PGlite) with a simulated Auth schema and JWT subject. The 26 foundation tests, 19 document/geography regression tests 22 Phase 1.3 tests 28 Phase 1.4 tests 20 Phase 2.1 tests 23 Phase 2.2 tests and 25 Phase 2.3 tests simulate Auth and Storage metadata; they do not verify actual Auth or Storage HTTP services. `test:local` verifies real local Auth/API and private Storage upload/download/removal once Docker is running; it is supplied for local execution and was not run in this environment.

## Documentation

- [WSL setup and first admin](docs/SETUP-WSL.md)
- [Permission matrix](docs/PERMISSIONS.md)
- [Data model and next phases](docs/ARCHITECTURE.md)
- [Release files and manual checks](docs/RELEASE-CHECKLIST.md)

## Official implementation references

- [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)

These references informed the local CLI setup, database access controls and Auth recovery flow. Browser UI testing, external email delivery and production deployment remain separate verification steps.

Document controls and release limits: [Phase 1.2 architecture](docs/ARCHITECTURE.md). No server-side malware scanner is included. Public rollout needs a scanning/quarantine workflow and a retention policy.

[Supabase Storage access controls](https://supabase.com/docs/guides/storage/security/access-control) and [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets) informed the private upload workflow.
# povo23
