# Current release: POEM 2.15.0

NGO Template Self-Service & POEM Approval Workflow. See [release notes](docs/PHASE-2.15.0.md), [WSL upgrade](docs/UPGRADE-2.15.0.md) and [validation](docs/VALIDATION-2.15.0.md).

POEM 2.15.0 extends the existing survey-template draft engine instead of creating a parallel builder. Active NGO Admins can create organization-owned drafts, use starter templates, save/edit shared NGO drafts, submit them to POEM, respond to requested changes and see immutable approved versions. POEM survey managers review submissions and can request changes, reject or atomically approve+publish.

## 2.15.0 template-governance rules

- `survey_template_drafts.organization_id` is the NGO ownership boundary. `owner_id` remains creator/audit evidence, not the authorization anchor.
- NGO drafts can be edited only in `draft` or `changes_requested`; `submitted`, `approved` and `rejected` revisions are locked.
- POEM approval atomically creates one immutable `survey_templates` row, records `source_draft_id`, preserves NGO ownership and writes review/audit history.
- POEM-authored private drafts keep the existing direct-publish workflow for backward compatibility.
- Active NGO Admins can read POEM-owned published templates and their own NGO-approved templates, but not another NGO's private approved template unless later project authorization explicitly permits it.
- Project Manager and Area Focal Person roles do not gain template-authoring or approval authority.
- The application-side starter library remains a starter source; 2.15.0 does not introduce a second database template marketplace.

## Current product boundaries

- 2.15.0 covers template self-service only. NGO project draft/submission/approval and activation belong to 2.15.1.
- Target/recruitment-capacity and compensation rules remain 2.16.
- Internal financial ledger and payment providers remain 2.17/2.18.
- Full production hardening, retention, malware scanning, large-list paging and external notification delivery remain later roadmap work.

## Historical foundation notes

# POEM Phase 2.3

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
- POEM Super Admin / POEM Admin, NGO Admin memberships and volunteer workspaces.
- CV-style profile drafts, submissions, review feedback and L0/L1 verification display.
- Editing invalidates previous approval; optimistic version checks reject stale saves/reviews.
- Partner NGO self-onboarding, private registration evidence, POEM approval, operational status and assignment of registered accounts to organizations.
- One account can belong to multiple NGOs; explicit workspace switching.
- Recruitment/application snapshots plus project/assignment-scoped NGO profile access; the old permanent profile-sharing control is not exposed in the current UI.
- Database-enforced permissions, active-account checks, protected RPC mutations and audit events.
- Admin geography manager and cascading volunteer location selection.
- Private PDF/JPG/PNG volunteer documents with upload recovery, removal and POEM review.
- Verification checklist and document-review gates; evidence changes invalidate approval.
- In-app notifications with recipient-only read access.
- Local first-Super-Admin bootstrap helper, `.env.example`, locked npm dependencies and validation scripts.

## Important boundaries

- This is a development foundation. It is not the full POEM roadmap or a certified production release.
- App accounts are active after email confirmation. Volunteer profiles are self-published/active; independent verification is separate. NGO memberships are assigned through the current POEM/NGO administration rules. Account suspension is separate from profile publication and identity verification.
- Legacy database profile status `verified` means active/published profile in compatibility code; independent identity verification, completed training and performance are separate concepts.
- NGO “active” is operational approval. POEM 2.13 stores private onboarding evidence and records the application decision, while independent organization verification remains a separate governance concept.
- Volunteer recruitment access is application/assignment-scoped in the current UI. Beneficiary coordination remains a separate explicit source-NGO approval plus POEM authorization workflow with field allowlist, expiry and revocation. Past viewed/copied data cannot be recalled.
- Volunteer profiles now use the project-supplied Pakistan Province/Territory → Division → District → Taluka/Tehsil/Subdivision reference hierarchy. Islamabad skips Division. Union Council is manual/optional and full address is mandatory. Admin geography tools remain available for controlled maintenance; existing approvals survive upgrade until edited/reviewed.
- Survey builder and project-scoped provisional person/household registry are included. POEM survey managers also have a canonical cross-project identity foundation with explainable candidate review and reversible merges. Phase 2.5 adds controlled partner-NGO coordination summaries. Phase 2.6 adds encrypted device drafts and queued reconnect sync after a project/form has loaded; cold-start offline navigation, offline documents/photos and full PWA caching are still not included. Workforce payable accounting is included, but custodial account balances/payment-provider transfer, automatic performance scoring, bulk beneficiary export and SMS/email notifications beyond Auth are not included.
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

POEM 2.4.2 keeps `npm run test:operations` fixture teardown canonical-registry-aware. POEM 2.5 adds a dedicated embedded PostgreSQL sharing/RLS suite. POEM 2.6 adds structural regression checks for encrypted IndexedDB drafts/queue semantics and global field-sync wiring. POEM 2.7 adds an embedded PostgreSQL marketplace/assignment lifecycle suite. POEM 2.7.1 adds seeded Pakistan geography and profile-location regression checks. POEM 2.7.2 adds runtime profile/geography regression coverage and strict non-ICT district-parent validation.

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

