# Current architecture note — POEM 2.17.1

## 2.17.1 project-funding architecture

POEM keeps the two accounting layers introduced in 2.17.0: the existing worker-entitlement subledger and the immutable central double-entry finance ledger. 2.17.1 adds constrained business actions on top of the finance ledger rather than widening generic journal permissions.

`finance_funding_sources` stores immutable organization funding provenance. POEM finance authority records verified/opening receipts into standardized organization accounts. NGO Admin can then reserve verified available funds into own active projects or release unused reserved funds. The reserve/release RPCs call a private journal core after enforcing organization/project authorization, positive amounts, idempotency and available/reserved balance limits.

Standard account purposes are `organization_available`, `project_reserved`, `project_committed` and `project_spent`. Reservation and release use the first two today; committed/spent are established for the 2.17.2 payable bridge. All balances remain derived from `finance_postings`; no mutable balance column or second money ledger exists.

Generic `post_finance_journal` remains POEM finance-admin only. Project Manager and Area Focal operational roles do not inherit finance authority.

# Previous architecture note — POEM 2.17.0

## 2.17.0 finance-core architecture

POEM now has two intentionally separate accounting layers:

1. **Worker entitlement subledger** — existing `work_payable_units`, `work_payable_events`, receipts and contract amendments determine worker entitlement and payment history.
2. **Central double-entry finance ledger** — `finance_accounts`, `finance_journals` and `finance_postings` record money/accounting movement without recalculating worker entitlement.

A finance journal is immutable after posting and must balance (`debits = credits`) in one currency. Account balances are computed from postings using the account class normal side; no mutable organization/project balance column exists. Organization journals may use system clearing accounts plus accounts from that organization, but may not cross into another NGO or another project's scoped account. Corrections are new reversal journals linked to the original.

2.17.0 deliberately exposes only a POEM finance-administration generic write surface. 2.17.1 will add constrained project funding/reservation actions for NGO workflows; 2.17.2 will add the idempotent `work_payable_event → finance_journal` bridge.


2.16.1 extends the existing project/workforce/payable architecture rather than adding a parallel compensation subsystem. `survey_projects` now stores structured compensation defaults and optimistic `compensation_version`. These defaults describe **future work offers** only; they are not a cash balance or funding reservation.

`work_opportunities` carries a compensation snapshot for each newly created project opportunity. A later project-rate change creates a new version for future opportunities and does not mutate existing recruitment. Formal `work_assignments` copy the authoritative opportunity snapshot (or current project default for a direct selected-shortlist offer) into the existing immutable contract fields plus compensation provenance. Existing `protect_work_terms()` therefore protects the offered rate, currency, basis and source before acceptance; volunteer acceptance confirms the frozen terms rather than creating a mutable negotiation state.

The existing `work_payable_units` / `work_payable_events` subsystem remains authoritative. `sync_survey_payable()` continues to create `per_verified_survey` units from independently approved responses using unique `response_id`; 2.16.1 only enriches `payable_snapshot()` with compensation provenance. No second payable generator, balance table or provider-transfer model is introduced.

Authorization remains layered: NGO Admin / POEM survey-management authority can change project compensation defaults; Project Manager can read/use the defaults and manage recruitment/assignment offers but cannot change the project's compensation commitment; Area Focal receives no compensation-plan authority. 2.16.0 soft target/capacity/offline behavior remains unchanged.

# Previous architecture note — POEM 2.16.0

2.16.0 keeps `survey_projects` as the operational source of truth and adds project-level `required_volunteers`, `recruitment_status` and optimistic `recruitment_version`. Approved-response progress and committed-volunteer counts are derived from existing `survey_responses`, `work_assignments` and `survey_assignments`; no parallel counter ledger is introduced.

The recruitment gate is deliberately **soft for field collection**. Effective recruitment is open only while the project is active, the manual gate is open, approved responses remain below `target`, and configured volunteer capacity remains. The gate blocks new opportunity publication, invitations and new assignment/direct-assignment activation, but does not modify `save_survey_response()` or automatically close the project. Already-assigned/offline-queued submissions can synchronize and over-target approvals remain auditable.

Project Manager and NGO Admin can read/update the global recruitment plan through guarded RPCs. Area Focal Person remains geography-scoped for operational monitoring/review and does not receive project-wide recruitment-plan authority. Existing workforce opportunity/application/assignment tables and the existing payable subsystem remain authoritative; compensation defaults are deferred to 2.16.1.

# Previous architecture note — POEM 2.15.1

2.15.1 adds `survey_project_drafts` and append-only `survey_project_review_events` as approval/workflow state. These rows are not operational projects. Active NGO Admin membership is the organization ownership boundary; POEM review remains `can_manage_surveys()`.

Approval calls the existing `create_survey_project()` inside the review transaction and stores the resulting `approved_project_id`. Existing `survey_projects.status` remains strictly operational (`active`/`closed`), so collection, recruitment, governance, offline capture, work assignments and payables do not need draft-state branches. Direct POEM project creation is additionally hardened so a project may use only a POEM-owned template or a template owned by the same NGO.

# Previous architecture note — POEM 2.15.0
Template self-service extends `survey_template_drafts` with organization ownership and review state. `survey_templates` remains the immutable published artifact and now preserves optional NGO ownership plus `source_draft_id`. `survey_template_review_events` is append-only workflow history. NGO authorization is organization-scoped through active `ngo_admin` membership; POEM review remains `can_manage_surveys()`. Project staff roles from 2.14 receive no template authority.

The application-side starter library remains a source for creating drafts; it is not migrated into a parallel marketplace. Project self-service is deferred to 2.15.1 and must materialize approved requests into the existing `survey_projects` operational table rather than overloading current `active/closed` operational status.

# Previous architecture note — POEM 2.14.2

2.14.2 stabilizes the project-scoped operational workspace on the 2.14 authorization layer. Project dashboards, response queues, status filters and assignment-area coverage query only rows allowed by existing RLS. Project staff never become global NGO Admin by implication.

**Current 2.14.2:** Project Managers receive project-wide operational monitoring/review and existing assignment controls; Area Focal Persons receive geography-scoped monitoring/review without assignment-management UI. Direct project navigation and revoked-workspace fallback are browser-stabilized. No new database migration is added.

POEM remains a React/TypeScript modular monolith backed by Supabase/PostgreSQL. Current domains include authentication, organizations, volunteers, surveys, registry/canonical identity, assistance/needs, controlled sharing, verification/governance, offline field reliability, workforce recruitment and payable accounting. Historical phase notes below are retained for provenance; later migrations and release notes take precedence.

Public recruitment browsing is independent of permanent NGO full-profile sharing. Since 2.13.1 the user-facing permanent sharing control is retired: applications carry bounded recruitment snapshots, while live NGO access to a volunteer profile is tied to explicit invitation/assignment relationships. The historical `profile_shares` table/RPC is retained only as a compatibility surface and current rows are cleared by the 2.13.1 migration. Volunteer profile publication remains separate from independent identity verification.

POEM work experience is now derived from authoritative survey-project records instead of copied into a second platform-experience table. `work_experience_history()` combines survey assignments, workforce assignment state, project/template metadata and current survey-review outcomes. Manual/external `volunteer_experiences` remain separate. Authorized third-party profile readers receive only POEM work backed by approved surveys or completed assignments; recruitment snapshots include at most 10 bounded verified work summaries.

## Consolidated 2.13.3 baseline

- The frontend remains a React/TypeScript/Vite modular monolith backed by Supabase Auth, PostgreSQL, PostgREST and Storage.
- PostgreSQL/RLS/RPC authorization remains the security boundary; 2.13.3 contains no schema or permission migration.
- The ordered migration baseline contains 32 files and currently ends at `20261006000200_invitation_access_scope_fix.sql`. Existing migration filenames are historical ordering identifiers and must not be renamed. New forward migrations must sort after the existing head.
- Release metadata is generated/checked with `npm run metadata:generate`, `npm run metadata:check` and `npm run release:consistency`.
- The next planned feature phase is 2.14 Project Team & Area Governance. It should extend existing organization/project primitives rather than introduce a parallel role, recruitment, template or payable system.

> Current consolidated release: [2.13.3](PHASE-2.13.3.md). For current validation and remaining limits, see [2.13.3 validation](VALIDATION-2.13.3.md). The phase-specific sections below are historical provenance and may describe behavior superseded by later migrations.

> Phase 2.3: [Needs Assessment & Assistance Follow-up](PHASE-2.3.md) adds approved-survey assessments, assistance links and a follow-up queue. See [upgrade instructions](UPGRADE-2.3.md). Earlier sections describe their original release scope.

> Phase 2.2: [Registry Review & Assistance Ledger](PHASE-2.2.md) adds identity corrections, project-scoped match decisions and recorded deliveries. See [upgrade instructions](UPGRADE-2.2.md). Earlier-phase sections retain their historical scope.

> Phase 2.1 update: see [Survey & Registry Pilot](PHASE-2.1.md) for the current survey model, permissions and acceptance checks, and [upgrade instructions](UPGRADE-2.1.md) for existing installations. Earlier-phase sections below describe their original scope.

Historical Phase 1.4: see [experience/invitation workflow and permissions](PHASE-1.4.md) and [upgrade instructions](UPGRADE-1.4.md).

Historical Phase 1.3: see [Phase 1.3 additions and boundaries](PHASE-1.3.md). The sections below document the inherited foundation.

# Architecture and release boundary

## Runtime

A Vite React SPA calls Supabase Auth and PostgREST over HTTP. PostgreSQL stores the durable records and enforces authorization. Supabase runs locally through its CLI-managed Docker services. The frontend runs directly in WSL; it does not require a separate frontend container.

The selected Phase 1.2 deliverable is local-only. There is no Sites hosting manifest, Cloudflare Worker, D1 database or ChatGPT-specific sign-in in this package.

## Data model

| Table | Purpose |
| --- | --- |
| auth.users | Supabase-owned identity and credentials |
| accounts | Display name, email, trusted platform role, account status |
| volunteer_profiles | One CV profile per account; draft/active publication state, private photo pointer and optimistic version |
| organizations | NGO directory and operational status |
| organization_memberships | Many-to-many account/NGO relationship, NGO role and membership status |
| profile_shares | Explicit volunteer-to-NGO full-profile grant with notice version |
| audit_events | Transactional record of signup, edits, reviews and access changes |

The CV's evolving optional fields are stored in validated JSON. Authorization, organization relationships, publication state and version remain typed relational columns. Published surveys and central beneficiary identities must not be stored in this CV JSON in later phases.

## Modules

- `src/client.ts`: Supabase client and guarded RPC caller.
- `src/App.tsx`: Auth, role-aware workspace, profile editor/photo, NGO and access management.
- `src/style.css`: Responsive navy/blue product theme.
- `supabase/migrations/`: Authoritative PostgreSQL schema and permissions.
- `scripts/test-database.mjs`: Embedded PostgreSQL migration/RLS tests.
- `scripts/test-local-auth.mjs`: Optional local Auth/PostgREST integration smoke test.

The Auth session uses the official Supabase client's browser session persistence. Product records are in PostgreSQL, not localStorage.

## Phase 1.2 additions

- `geographies`: immutable parent/kind, mutable sourced names/codes and activation. Active ancestors are required; submission requires district or deeper. This release fixes the level sequence; configurable levels are future work.
- `volunteer_profiles.geography_id`: structured volunteer location. Legacy review columns remain for compatibility, but current profile publishing does not require admin approval.
- `volunteer_documents`: reserved random object paths, declared MIME/size, upload lifecycle and separate review version. `begin_document_upload` returns JSON for a stable client contract.
- `storage.buckets` / `storage.objects`: private bucket, 5 MiB maximum, PDF/JPEG/PNG allowlist, owner-only reserved uploads and deletion. No UPDATE policy means approved bytes cannot be overwritten.
- `notifications`: audit-triggered own-recipient inbox; latest 100, manual refresh, no background/push/email delivery.
- `src/Phase12.tsx`: geography, document and notification UI.
- `scripts/test-phase12.mjs`: applies the original migration, creates legacy data, upgrades, and tests PostgreSQL and Storage RLS policies.

Document flow: reserve → upload bytes → finalize metadata → POEM review. Interrupted uploads can be finalized if bytes exist, or removed and retried. Removal changes metadata first, deletes bytes through Storage, then retains a deleted-history row. Document review is independent from profile publication. No direct deletion of Storage SQL rows in application code.

Current profile publishing requires the configured mandatory profile fields and Taluka / Tehsil / Subdivision, but it does not require admin approval or documents. Private documents have their own review status and never unpublish an active profile. Legacy profile-review RPCs remain only for backward compatibility.

Document downloads use authenticated Storage download, never public or signed sharing URLs. The application RPC audits download requests; it does not prove a completed download and does not intercept direct authenticated Storage reads. Comprehensive download logging requires Storage/API logging or a dedicated download gateway. Already downloaded files cannot be recalled.

Server MIME/size restrictions and client magic-byte checks are not malware scanning; a modified client can bypass the latter. No server quarantine/scanner, automated retention purge or consent capture for identity-document processing is included. Use synthetic evidence for local testing until those controls and policies are configured.

## Current profile publication (2.7.4)

Volunteer profile lifecycle is now **Draft → Active** through the volunteer's own publish action. Published edits go live immediately after server validation. The historical database value `verified` is retained as the active/marketplace-ready state for compatibility with existing survey/workforce authorization; the UI labels it **Active** and it no longer means POEM approved the profile. Work experience confirmation and private-document review remain separate workflows. Profile photos use a private Storage bucket and inherit the same authorized profile-read scope.

## Subsequent foundation work

Phase 1.3 delivers directory pagination, generated public-schema types and Volunteer Manager / NGO Manager / Auditor roles. Configurable geography levels/import, pagination of supporting lists, Registry Manager and project-specific consent/data policies remain open. Legacy POEM Admins retain broad access. Organization invitations may follow registered-account membership assignment.

## Survey/registry pilot after volunteer foundation

Versioned templates and projects, person/household schema, consent/versioned project policy, deterministic identity matching, field collection/review, then assistance tracking. Keep NGO/project-specific facts and case notes scoped separately from canonical identity.

## Before cloud rollout

Apply migrations to a dedicated cloud project, configure exact redirect URLs and production SMTP, and align password and confirmation settings in hosted Auth. Local config does not automatically configure hosted Auth. Set only the project public key and URL in the frontend environment. Choose a host with SPA fallback for `/auth/callback` and `/reset`. Rebuild after environment changes. Add monitoring, backups/recovery validation, rate-limiting/CAPTCHA appropriate to exposure, upload protection, retention/consent policy and production security review before onboarding real sensitive cases.

## Phase 2.5 collaboration boundary

The canonical identity layer remains POEM-controlled. Partner organizations coordinate through three new relational records rather than receiving cross-project table permissions:

- `data_access_requests`: requesting NGO, source NGO, canonical person, purpose, requested field allowlist and two-step review state.
- `data_access_grants`: source-specific approved field allowlist, canonical version snapshot, validity window and revocation state.
- `data_access_events`: request/review/view/revocation trace.

`get_shared_beneficiary_summary` is the only partner-facing cross-NGO beneficiary read path. It rechecks the grantee membership, source/grantee organization status, grant expiry/revocation, requesting-person canonical link, source canonical link and canonical version on every call. It builds a new JSON summary from source-NGO records and omits fields outside the grant. Existing RLS on source survey, registry, need and assistance tables remains unchanged.

This is intentionally a modular-monolith collaboration layer. No external sharing service, data warehouse, message broker or payment subsystem is introduced.


## Phase 2.6 field-reliability boundary

The server remains authoritative. The browser now adds a local write-ahead layer for survey saves only. `save_survey_response` and `survey_save_receipts` remain unchanged; the client persists the exact RPC payload and request UUID before attempting the network call. A confirmed server success removes the device copy. Transient/unknown failures stay pending with backoff. Definitive SQL validation, permission and optimistic-version failures become `needs_attention` and are never auto-overwritten.

Sensitive draft/queue payloads are encrypted with AES-GCM before IndexedDB persistence. Queue metadata intentionally excludes person names, answers and consent content. Device encryption reduces accidental at-rest exposure but is not a security boundary against same-origin script execution or an unlocked endpoint.

This release does not cache the complete authenticated workspace, project/template snapshots or registry indexes for a cold offline boot. Full offline-first PWA behavior needs an explicit cache freshness/revocation model before service-worker caching is introduced.

## Phase 2.7 workforce boundary

The existing generic recruitment objects remain intact, but operational survey recruitment now has an explicit chain:

- `work_opportunities.survey_project_id` binds recruitment to a survey project.
- `work_applications` records volunteer-initiated interest and NGO review state.
- `work_assignments` stores the immutable accepted-work terms and lifecycle independently of a generic profile shortlist.
- `survey_assignments` remains the low-level survey authorization record. A formal work assignment activates/deactivates it; server collection checks also enforce the assignment date window when a workforce assignment exists.

A volunteer continues to use one account across organizations. Applications and assignments reference that global account plus the relevant organization/project. No duplicate NGO-specific volunteer account is created.

The workforce candidate RPC returns aggregate history only. It does not disclose which other NGO produced an approved survey or verified experience. Match labels are coarse discovery aids, not an employment ranking, and no automatic level promotion occurs in this phase.

## POEM 2.13 — Partner NGO onboarding

Partner NGO onboarding is a separate approval workflow rather than direct creation of an active `organizations` record. `partner_ngo_applications` holds the representative's draft/review lifecycle and structured programs/operating areas. `partner_ngo_application_documents` holds private evidence metadata; bytes live in the private `poem-ngo-applications` bucket.

Approval is the boundary that creates the active organization and first `ngo_admin` membership. A personal POEM account remains the human identity; POEM does not create or encourage shared NGO credentials.
