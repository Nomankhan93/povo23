# Current architecture note — POEM 2.14.1

2.14.1 wires dedicated project-team and project-staff workspaces onto the 2.14 authorization layer. Project staff never become global NGO Admin by implication. `collection_geography_id` remains the operational scope anchor, and database helpers/RLS—not client navigation—remain the authorization boundary.

**Current 2.14.1:** NGO Admins can assign/revoke Project Managers and Area Focal Persons from active organization members. Assigned staff get dedicated project workspace contexts. Broader finance/template/canonical/data-sharing authority remains excluded.

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
