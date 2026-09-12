> Current stabilization release: [2.3.1](STABILIZATION-2.3.1.md). For current validation and remaining limits, see [validation](VALIDATION-2.3.1.md). Older phase-specific statements below are historical; NGO Managers no longer assign memberships.

> Phase 2.3: [Needs Assessment & Assistance Follow-up](PHASE-2.3.md) adds approved-survey assessments, assistance links and a follow-up queue. See [upgrade instructions](UPGRADE-2.3.md). Earlier sections describe their original release scope.

> Phase 2.2: [Registry Review & Assistance Ledger](PHASE-2.2.md) adds identity corrections, project-scoped match decisions and recorded deliveries. See [upgrade instructions](UPGRADE-2.2.md). Earlier-phase sections retain their historical scope.

> Phase 2.1 update: see [Survey & Registry Pilot](PHASE-2.1.md) for the current survey model, permissions and acceptance checks, and [upgrade instructions](UPGRADE-2.1.md) for existing installations. Earlier-phase sections below describe their original scope.

Current Phase 1.4: see [experience/invitation workflow and permissions](PHASE-1.4.md) and [upgrade instructions](UPGRADE-1.4.md).

Current release: see [Phase 1.3 additions and boundaries](PHASE-1.3.md). The sections below document the inherited foundation.

# Architecture and release boundary

## Runtime

A Vite React SPA calls Supabase Auth and PostgREST over HTTP. PostgreSQL stores the durable records and enforces authorization. Supabase runs locally through its CLI-managed Docker services. The frontend runs directly in WSL; it does not require a separate frontend container.

The selected Phase 1.2 deliverable is local-only. There is no Sites hosting manifest, Cloudflare Worker, D1 database or ChatGPT-specific sign-in in this package.

## Data model

| Table | Purpose |
| --- | --- |
| auth.users | Supabase-owned identity and credentials |
| accounts | Display name, email, trusted platform role, account status |
| volunteer_profiles | One CV profile per account; draft/review state and optimistic version |
| organizations | NGO directory and operational status |
| organization_memberships | Many-to-many account/NGO relationship, NGO role and membership status |
| profile_shares | Explicit volunteer-to-NGO full-profile grant with notice version |
| audit_events | Transactional record of signup, edits, reviews and access changes |

The CV's evolving optional fields are stored in validated JSON. Authorization, organization relationships, verification state and version remain typed relational columns. Published surveys and central beneficiary identities must not be stored in this CV JSON in later phases.

## Modules

- `src/client.ts`: Supabase client and guarded RPC caller.
- `src/App.tsx`: Auth, role-aware workspace, profile editor, review, NGO and access management.
- `src/style.css`: Responsive navy/blue product theme.
- `supabase/migrations/`: Authoritative PostgreSQL schema and permissions.
- `scripts/test-database.mjs`: Embedded PostgreSQL migration/RLS tests.
- `scripts/test-local-auth.mjs`: Optional local Auth/PostgREST integration smoke test.

The Auth session uses the official Supabase client's browser session persistence. Product records are in PostgreSQL, not localStorage.

## Phase 1.2 additions

- `geographies`: immutable parent/kind, mutable sourced names/codes and activation. Active ancestors are required; submission requires district or deeper. This release fixes the level sequence; configurable levels are future work.
- `volunteer_profiles.geography_id` and `review_checks`: reviewed structured location and three explicit checks. Legacy profiles remain intact; new saves/reviews use the new contract.
- `volunteer_documents`: reserved random object paths, declared MIME/size, upload lifecycle and separate review version. `begin_document_upload` returns JSON for a stable client contract.
- `storage.buckets` / `storage.objects`: private bucket, 5 MiB maximum, PDF/JPEG/PNG allowlist, owner-only reserved uploads and deletion. No UPDATE policy means approved bytes cannot be overwritten.
- `notifications`: audit-triggered own-recipient inbox; latest 100, manual refresh, no background/push/email delivery.
- `src/Phase12.tsx`: geography, document and notification UI.
- `scripts/test-phase12.mjs`: applies the original migration, creates legacy data, upgrades, and tests PostgreSQL and Storage RLS policies.

Document flow: reserve → upload bytes → finalize metadata → POEM review. Interrupted uploads can be finalized if bytes exist, or removed and retried. Removal changes metadata first and invalidates approval, deletes bytes through Storage, then retains a deleted-history row. No direct deletion of Storage SQL rows in application code.

Approval requires active district-level geography, completed checklist, no unfinished uploads/removals and all current documents accepted. Documents remain optional: zero files does not block approval. This is a CV review, not an identity certification. Evidence finalization, review and removal increment profile versions and invalidate existing approval. Admins cannot review their own evidence.

Document downloads use authenticated Storage download, never public or signed sharing URLs. The application RPC audits download requests; it does not prove a completed download and does not intercept direct authenticated Storage reads. Comprehensive download logging requires Storage/API logging or a dedicated download gateway. Already downloaded files cannot be recalled.

Server MIME/size restrictions and client magic-byte checks are not malware scanning; a modified client can bypass the latter. No server quarantine/scanner, automated retention purge or consent capture for identity-document processing is included. Use synthetic evidence for local testing until those controls and policies are configured.

## Subsequent foundation work

Phase 1.3 delivers directory pagination, generated public-schema types and Volunteer Manager / NGO Manager / Auditor roles. Configurable geography levels/import, pagination of supporting lists, Registry Manager and project-specific consent/data policies remain open. Legacy POEM Admins retain broad access. Organization invitations may follow registered-account membership assignment.

## Survey/registry pilot after volunteer foundation

Versioned templates and projects, person/household schema, consent/versioned project policy, deterministic identity matching, field collection/review, then assistance tracking. Keep NGO/project-specific facts and case notes scoped separately from canonical identity.

## Before cloud rollout

Apply migrations to a dedicated cloud project, configure exact redirect URLs and production SMTP, and align password and confirmation settings in hosted Auth. Local config does not automatically configure hosted Auth. Set only the project public key and URL in the frontend environment. Choose a host with SPA fallback for `/auth/callback` and `/reset`. Rebuild after environment changes. Add monitoring, backups/recovery validation, rate-limiting/CAPTCHA appropriate to exposure, upload protection, retention/consent policy and production security review before onboarding real sensitive cases.
