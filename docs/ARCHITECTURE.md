# Current architecture note — FieldLance 2.25.1

## 2.25.1 Identity and workspace stabilization

The signup trigger persists onboarding choice but never accepts a privileged role from metadata. Organization-only accounts may have no worker profile. my_workspace_access derives eligible worker, organization-admin, dated project-staff, and platform-staff scopes. AppShell resolves only returned scopes, uses per-account preferences, permits missing worker profiles, and remounts content on scope changes. Existing business RPCs remain authoritative.

## Previous release behavior retained
## 2.25.0 Earnings, Wallet & Withdrawal UX

FieldLance 2.25.0 is a presentation/integration release over the frozen payment core. It adds a personal `EarningsWorkspace` that reads existing `my_withdrawal_summary`, personal paid `work_assignments` and withdrawal history, then embeds the existing payable ledger for claim/dispute detail. No new balance source or finance table is introduced.

`EWalletWithdrawalWorkspace` remains the authoritative personal payout-method/PIN/withdrawal UI and continues to call the existing wallet/withdrawal RPCs. `WithdrawalOperationsWorkspace` remains the FieldLance Finance control surface and continues to use guarded admin queue/reconciliation and settlement RPCs. Organization users still use `PayablesWorkspace` for contract/payable approval and accounting events.

The lifecycle is intentionally separated: verified paid work → payable entitlement → approved/available balance → withdrawal reservation → provider settlement. A provider settlement is not inferred from a payable approval, and a withdrawal request cannot edit payable or finance balances directly.

JazzCash/Easypaisa remain explicit manual/mock provider modes. Live provider transport, bank/IBAN payout and custodial balance architecture are outside 2.25.0.

## 2.22.0 FieldLance Staff Operations architecture

2.22.0 is a migration-free Staff workspace release. `FieldLanceStaffDashboard` reads existing authorized `organizations`, `partner_ngo_applications`, `volunteer_profiles`, `survey_projects`, `work_applications`, `work_assignments`, `survey_responses`, `beneficiary_cases` and `assistance_entries` data. Finance attention is read through the existing guarded `admin_e_wallet_operations_queue` and `admin_e_wallet_provider_reconciliation` RPCs rather than direct sensitive e-wallet table access.

The Staff Operations Home is read-only: organization approval, Field Worker review, survey verification, recruitment decisions, case operations, withdrawal settlement and reconciliation remain in their existing workspaces/RPCs. The dashboard only summarizes visible queues and navigates Staff to those authoritative modules.

AppShell now uses a curated Staff navigation list based on the already-existing platform-role capability checks. `src/app/navigation.ts` adds Staff-facing labels such as Operations home, Field Workers, Organization applications, Recruitment oversight, Withdrawals and Audit trail while preserving stable internal page keys and the historical `poem` scope identifier.

Field Worker 2.20.0 and Organization 2.21.0 dashboards remain separate. Project workspaces retain the existing generic WorkflowOverview fallback. No RLS policy, storage policy, role semantics, payment provider integration, reporting store or Supabase migration is added.


## 2.21.0 Organization Workspace architecture

2.21.0 is a frontend-only organization-workspace release. `OrganizationDashboard` reads the existing organization-scoped `survey_projects`, `work_opportunities`, `work_applications`, `work_assignments`, `beneficiary_cases`, `survey_responses`, `assistance_entries`, `work_payable_units`, `organization_programs` and `organization_areas` sources. It does not create cached dashboard tables or a parallel reporting database.

The organization Overview now acts as a daily operational home: project delivery, recruitment, Field Worker activation, survey review pressure, beneficiary follow-up, assistance delivery and payable visibility are summarized in one read-only surface. Every mutation remains in the existing project, marketplace, case, assistance, payable or finance workspace and continues through the existing RLS/RPC boundary.

`src/app/navigation.ts` adds organization-only presentation labels while preserving stable internal page keys. AppShell now uses a curated organization navigation list so personal profile/work-history/wallet pages are not mixed into the Organization sidebar. This navigation cleanup changes presentation only and does not alter server authorization.

Approved organization identity and logo remain sourced from the existing `organizations` row created/linked by Partner NGO onboarding. Field Worker marketplace, project assignments, payable accounting, controlled sharing and beneficiary/case sources remain authoritative.

No Supabase migration, RLS policy, storage policy, RPC authority, payment provider integration or backend role change is introduced in 2.21.0.

## 2.19.8 Workforce Marketplace architecture


2.19.8 is a frontend-only marketplace release. It keeps `work_opportunities`, `work_applications`, `work_assignments`, `survey_assignments` and the existing recruitment RPC/RLS model authoritative. No new registry, parallel assignment model or migration is introduced.

The Field Worker lifecycle is presented as discover → apply → selection → assigned. `available_work_opportunities` remains the server-side discovery boundary, `apply_work_opportunity` creates the application-scoped profile snapshot, `review_work_application` records organization decisions, `create_work_assignment` freezes formal assignment terms, and `respond_work_assignment` activates accepted offers. Existing direct survey assignments remain visible as an explicitly separate operational path.

Organization mode is reorganized into Opportunities, Applications, Find Field Workers and Assignments views. These are presentation views over existing scoped queries and RPCs; switching tabs does not expand authorization. Approved organization logo paths already introduced in 2.19.7 are reused for worker-facing marketplace identity.

## 2.19.7 Partner NGO application architecture

2.19.7 keeps the existing Partner NGO application, document-review and approval model and adds one forward migration. The browser now presents the same application as five guided steps rather than one long page; registration/designation/program controls normalize data before the existing `save_partner_ngo_application` RPC persists it. Program areas continue to use the existing `program_names text[]`, and operating areas continue to use `operating_area_ids uuid[]`.

Organization logos are stored separately from private legal documents in a dedicated private `fieldlance-organization-logos` bucket. The object path is deterministic (`<application>/logo`), write/delete access is limited to the application owner while the application is editable, and FieldLance NGO reviewers may read draft logos. Approval synchronizes the application logo path onto the newly created organization through a database trigger; active authenticated platform users can then read the approved organization logo for normal organization presentation.

The final submission contract now also requires `legal_type`. Document kinds expand to organization profile and financial document while registration/legal proof remains the required approval evidence. Existing approval continues to create exactly one organization and first NGO Admin membership; 2.19.7 does not create a parallel organization or document model.

The post-submit modal is presentation state only and is raised after the guarded submit RPC resolves successfully. Review/approval and logo authorization remain server-enforced.


## 2.19.6 visual-system / navigation architecture

2.19.6 is intentionally migration-free and keeps the existing modular React/Supabase architecture. `src/app/navigation.ts` centralizes navigation grouping and public workspace labels, but AppShell still computes the permitted page list from existing account, organization, project and platform-role state before grouping it. PostgreSQL RLS and guarded RPCs remain the authorization boundary.

The runtime brand lockup now uses the supplied FL icon plus live text. Canonical `--fieldlance-*` visual tokens are layered onto the existing stylesheet while historical `--poem-*` variables remain compatibility aliases so feature modules do not need a broad risky rewrite. Status presentation gains neutral/info/success/warning/danger foundations without changing stored database status values.

Public workspace terminology becomes Field Worker / Organization / FieldLance Staff while internal `volunteer` / `ngo` / `poem` entry and scope keys remain unchanged. This is a presentation abstraction, not a data-model rename. Partner NGO onboarding remains the currently implemented organization-onboarding workflow.

The sidebar/header/mobile drawer are refined in place rather than replaced with a new router. Existing focus trapping, Escape close, inert-main behavior, notification security, offline-field flow and sync controls remain intact. Screen-level marketplace, organization and staff workflow redesigns are intentionally deferred.

## 2.19.3 follow-up / outcomes / closure architecture

2.19.3 starts only after existing case/request/distribution/delivery architecture. `beneficiary_case_followups` is an RPC-only operational record for scheduled contact, completed outcome assessment or cancellation. It may point to an actively linked assessed need and/or a current recorded planned delivery, but it does not replace `beneficiary_needs` or `assistance_entries`.

Completion records a structured outcome (`resolved`, `partially_resolved`, `unresolved`, `further_assistance_required`, `referred`, `unable_to_verify`), observations, optional beneficiary feedback, next action and optional next follow-up. When a follow-up is linked to an assessed need, the operator may explicitly select an existing need status; the RPC validates outcome/status consistency and retains the existing `met` requirement for recorded linked assistance. No automatic eligibility or impact decision is inferred.

A requested next-follow-up date creates a new scheduled child follow-up linked to the completed parent. This makes future work visible in the scoped follow-up queue and keeps closure rules based on actual outstanding records instead of free-text dates.

`app_private.beneficiary_case_closure_blockers` derives closure eligibility. Closure is denied while the case has draft/submitted assistance requests, approved requests without a recorded current delivery, non-cancelled plans without delivery, linked needs still open/in-progress/needs-review, scheduled follow-ups, or recorded planned deliveries without at least one completed linked follow-up. Because assistance requests have no separate fulfilled status, an approved request with a valid recorded delivery is treated as operationally satisfied for closure rather than blocking forever.

`close_beneficiary_case` records a structured closure category/summary/reason. `reopen_beneficiary_case` reopens to `open` and clears only the current closure fields. `beneficiary_case_lifecycle_events` captures immutable close/reopen history so reopening never erases the prior decision. The older `update_beneficiary_case` signature remains compatible but now uses the same closure blockers; the 2.19.3 UI uses the dedicated lifecycle RPCs.

FieldLance survey authority, NGO Admin and Project Manager continue through existing `can_manage_project` scope. Area Focal remains outside broad case/follow-up mutation authority. Follow-up/revision/lifecycle tables are not directly granted to authenticated browser users. No follow-up or closure RPC posts finance journals, creates worker payables, changes wallets/withdrawals, or mutates delivered-assistance facts.

## 2.19.2 assistance ledger / duplicate-control architecture

2.19.2 connects a ready `assistance_distribution_plans` row to the existing `assistance_entries` delivered-support source of truth. `assistance_distribution_deliveries` is an RPC-only provenance/link table, not a second assistance ledger. It records plan/request/case/need lineage, duplicate-review snapshot and any authorized override while the actual delivered support remains in `assistance_entries`.

The controlled execution RPC locks the distribution plan, approved request, open case, active assessed need and canonical beneficiary before evaluating duplicate support and inserting the ledger row. Support kind/category/program and approved cash amount or goods/service quantity/unit are copied from the approved request. Browser input is limited to actual delivery description/date, funding source, evidence reference, optional next-eligibility date and—when authorized—an override reason.

Duplicate evaluation uses the canonical beneficiary identity. An unexpired same-category `next_eligible_on` or same-day same-kind same amount/quantity is blocking; nearby same-category assistance is advisory context. Existing `can_manage_project` authority controls which matching records are returned. Protected matches are counted only as a review requirement and their source details are not returned. Project Manager cannot override blockers; NGO Admin may override only fully visible blockers; protected blockers require FieldLance survey authority.

One active recorded delivery per plan and assistance request is enforced by partial unique indexes. Voiding `assistance_entries` marks the provenance link void, keeps historical evidence, triggers existing need re-review behavior and permits a corrected replacement. A plan with an active recorded delivery cannot be cancelled until that assistance row is voided. Legacy `record_assistance` remains for genuine unplanned/historical support, but it cannot bypass a ready plan or canonical same-day/eligibility duplicate blockers. A blocking exception must move through the case/request distribution workflow so override authority and provenance are explicit.

`assistance_ledger` is a scoped read RPC for FieldLance survey authority, NGO Admin and Project Manager. It returns authorized `assistance_entries` plus derived plan/request/case linkage while keeping internal duplicate snapshots RPC-private. Area Focal remains outside the case/delivery management boundary. No 2.19.2 path creates worker payables, posts finance journals, changes e-wallet balances or executes provider settlement.

## 2.19.1 assistance distribution planning architecture

2.19.1 adds a planning-only operational layer after 2.19.0 request approval: `approved survey → beneficiary_needs → beneficiary case → approved assistance request → assistance_distribution_plans → future delivery → assistance_entries`. It does not alter canonical beneficiary identity, assessed-needs ownership or the delivered-assistance ledger.

`assistance_distribution_plans` is anchored to exactly one approved `assistance_requests` row and snapshots that approved request version for audit. One non-cancelled plan is allowed per request. Cancelled plans remain immutable operational history and permit a replacement only while the request itself remains approved. The plan lifecycle is `draft`, `scheduled`, `ready`, `cancelled`; there is deliberately no `delivered` status in 2.19.1.

Guarded RPCs enforce project scope, active-NGO state, open-case state for create/edit/schedule/readiness, optimistic versions and plan/request cancellation ordering. Project Manager uses the same least-privilege `can_manage_project` boundary as 2.19.0 cases. NGO Admin and FieldLance survey authority retain their existing broader project authority. Area Focal receives no case/distribution-plan table or RPC access in this phase.

The planning row stores mode, venue/location label, responsible-party label, instructions and schedule. `responsible_party` is descriptive operational metadata only; it is not an authorization assignment and does not bypass project membership/RLS. The case geography is stamped into the plan to preserve operational provenance.

Request cancellation is forward-hardened so an approved request cannot be cancelled while a non-cancelled plan exists. The plan must be cancelled first. No 2.19.1 RPC inserts `assistance_entries`, creates worker payables, posts finance journals, changes wallet balances or settles withdrawals. Actual assistance execution/ledger linkage and duplicate-support controls remain 2.19.2+.

## 2.19.0 beneficiary case / assistance-request architecture

2.19.0 introduced the operational case/request layer without changing the identity, needs or delivery sources of truth. `beneficiary_cases` remains anchored to a project-scoped beneficiary and approved survey provenance; `assistance_requests` remains the human-reviewed authorization record consumed by 2.19.1 planning.

## 2.18.3 payments release consolidation

2.18.3 is intentionally migration-free. The database contract remains the 2.18.2 stack ending at `20261008000930_withdrawal_operations_manual_settlement.sql`. The release consolidates runtime-discovered regression fixes and adds release-level QA rather than introducing another payment state model.

The authoritative chain remains: project compensation snapshot → `work_payable_units/events` → 2.17.2 finance bridge → immutable finance journals → e-wallet withdrawal orchestration. Mock and manual provider execution both terminate in the same payable/finance settlement boundary. Sensitive wallet, PIN, withdrawal, allocation, provider-event and manual-operation tables remain RPC-only to authenticated browser users.

`npm run test:payments` is the canonical payment regression command. Future live JazzCash/Easypaisa adapters must plug into the existing provider boundary and may not bypass exact payable allocation, idempotency, dual-control or reconciliation rules.


## 2.18.2 withdrawal operations architecture

2.18.2 adds an operational layer above the stabilized 2.18.1 wallet/withdrawal contract. A withdrawal remains backed by exact approved-payable allocations. Manual provider execution never edits balances directly: a successful manual payout creates the existing payable payment events for those allocations, and the 2.17.2 finance bridge posts the corresponding project movement from Committed to Spent. Failure creates no payment event; reversal creates the paired payment-reversal events.

The withdrawal lifecycle now includes `approved`. Reservations remain active for `requested`, `approved` and `processing`. `e_wallet_manual_operations` stores immutable approval/processing/settlement/failure/reversal history with idempotent request IDs and provider-scoped external transaction references. A singleton payout policy supplies server-enforced minimum, maximum, daily and dual-control thresholds.

The FieldLance finance workspace reads through guarded queue/reconciliation RPCs. Reconciliation checks allocation totals, payment and reversal events, `finance_payable_event_links`, and manual provider references. This is provider readiness, not a fake API integration: the operator still executes the real transfer outside FieldLance until an official JazzCash/Easypaisa adapter is connected.

## 2.18.1 e-wallet / withdrawal stabilization architecture

2.18.1 preserves the 2.18.0 payout orchestration layer and hardens its trust boundaries. Active wallet identity is unique by `(provider, normalized account number)`, verification/activation events are replay-safe, verified wallet details are immutable, transaction PIN attempts are persisted/locked, and exact allocation request IDs authorize settlement/reversal across the payable reservation guard.

## 2.18.0 e-wallet / mock-withdrawal architecture

2.18.0 adds a payout orchestration layer **above** the existing worker-payable and finance ledgers. `e_wallets` stores JazzCash/Easypaisa binding state; `e_wallet_withdrawals` stores the withdrawal lifecycle; `e_wallet_withdrawal_allocations` reserves exact unpaid payable units; and `e_wallet_provider_events` stores idempotent mock provider outcomes. Authenticated clients receive masked wallet data only through guarded RPCs; the sensitive tables are not directly granted to browser roles.

Withdrawal availability is derived from existing approved entitlement minus recorded payments and active withdrawal allocations. A request therefore does not create a new balance column. Pending/processing allocations reserve exact units, preventing concurrent requests or NGO payable adjustments from consuming the same entitlement.

Mock settlement is intentionally integrated through existing accounting primitives: success inserts `work_payable_events(kind='payment')` for the reserved allocations, and the 2.17.2 payable-finance trigger moves project committed funding to spent. Failure/cancel inserts no payment event. Reversal inserts existing payment-reversal events, restoring the payable balance and finance commitment. The provider layer does not recalculate entitlement or post an independent project-spend journal.

Transaction PINs are separate from login credentials. Only a bcrypt-style verifier produced by the database cryptographic extension is stored; browser users cannot read the security table. The PGlite test suite uses a test-only crypt API shim to exercise workflow semantics, while local/cloud Supabase must provide the real cryptographic extension.

Provider mode is `mock` only. JazzCash/Easypaisa live API requests, provider-issued credentials, callback signatures, provider clearing and production reconciliation remain future adapters. Bank/IBAN payout methods are explicitly outside 2.18.0.

## 2.17.2 payable → finance bridge architecture

FieldLance keeps two intentionally separate accounting layers. `work_payable_*` is the worker-entitlement subledger; `finance_accounts` / `finance_journals` / `finance_postings` is the immutable central double-entry ledger. 2.17.2 links them without recalculating worker entitlement.

The bridge is event-sourced and append-only:

`work_payable_event` → immutable `finance_payable_event_links` → one balanced `payable_finance_bridge` journal when money movement is required.

Project funding buckets remain aggregate controls. Approval moves reserved funding to committed, payment moves committed to spent, reversals restore the prior bucket, and entitlement reduction releases only unused commitment. `reserved + committed + spent` therefore remains the funded project envelope for the currency.

Historical monetary payable events are not silently rewritten. Authorized NGO Admin / FieldLance finance users can replay missing bridge links through reconciliation RPCs. New monetary events bridge automatically in the same database transaction, so an unfunded approval rolls back rather than creating an unrepresented financial obligation.

Provider settlement remains outside this phase. 2.18 may add JazzCash/provider clearing on top of the same finance journal system; it must not mutate historical bridge journals or replace worker payables.

## 2.17.0 finance-core architecture

FieldLance now has two intentionally separate accounting layers:

1. **Worker entitlement subledger** — existing `work_payable_units`, `work_payable_events`, receipts and contract amendments determine worker entitlement and payment history.
2. **Central double-entry finance ledger** — `finance_accounts`, `finance_journals` and `finance_postings` record money/accounting movement without recalculating worker entitlement.

A finance journal is immutable after posting and must balance (`debits = credits`) in one currency. Account balances are computed from postings using the account class normal side; no mutable organization/project balance column exists. Organization journals may use system clearing accounts plus accounts from that organization, but may not cross into another NGO or another project's scoped account. Corrections are new reversal journals linked to the original.

2.17.0 deliberately exposes only a FieldLance finance-administration generic write surface. 2.17.1 will add constrained project funding/reservation actions for NGO workflows; 2.17.2 will add the idempotent `work_payable_event → finance_journal` bridge.


2.16.1 extends the existing project/workforce/payable architecture rather than adding a parallel compensation subsystem. `survey_projects` now stores structured compensation defaults and optimistic `compensation_version`. These defaults describe **future work offers** only; they are not a cash balance or funding reservation.

`work_opportunities` carries a compensation snapshot for each newly created project opportunity. A later project-rate change creates a new version for future opportunities and does not mutate existing recruitment. Formal `work_assignments` copy the authoritative opportunity snapshot (or current project default for a direct selected-shortlist offer) into the existing immutable contract fields plus compensation provenance. Existing `protect_work_terms()` therefore protects the offered rate, currency, basis and source before acceptance; volunteer acceptance confirms the frozen terms rather than creating a mutable negotiation state.

The existing `work_payable_units` / `work_payable_events` subsystem remains authoritative. `sync_survey_payable()` continues to create `per_verified_survey` units from independently approved responses using unique `response_id`; 2.16.1 only enriches `payable_snapshot()` with compensation provenance. No second payable generator, balance table or provider-transfer model is introduced.

Authorization remains layered: NGO Admin / FieldLance survey-management authority can change project compensation defaults; Project Manager can read/use the defaults and manage recruitment/assignment offers but cannot change the project's compensation commitment; Area Focal receives no compensation-plan authority. 2.16.0 soft target/capacity/offline behavior remains unchanged.

# Previous architecture note — FieldLance 2.16.0

2.16.0 keeps `survey_projects` as the operational source of truth and adds project-level `required_volunteers`, `recruitment_status` and optimistic `recruitment_version`. Approved-response progress and committed-volunteer counts are derived from existing `survey_responses`, `work_assignments` and `survey_assignments`; no parallel counter ledger is introduced.

The recruitment gate is deliberately **soft for field collection**. Effective recruitment is open only while the project is active, the manual gate is open, approved responses remain below `target`, and configured volunteer capacity remains. The gate blocks new opportunity publication, invitations and new assignment/direct-assignment activation, but does not modify `save_survey_response()` or automatically close the project. Already-assigned/offline-queued submissions can synchronize and over-target approvals remain auditable.

Project Manager and NGO Admin can read/update the global recruitment plan through guarded RPCs. Area Focal Person remains geography-scoped for operational monitoring/review and does not receive project-wide recruitment-plan authority. Existing workforce opportunity/application/assignment tables and the existing payable subsystem remain authoritative; compensation defaults are deferred to 2.16.1.

# Previous architecture note — FieldLance 2.15.1

2.15.1 adds `survey_project_drafts` and append-only `survey_project_review_events` as approval/workflow state. These rows are not operational projects. Active NGO Admin membership is the organization ownership boundary; FieldLance review remains `can_manage_surveys()`.

Approval calls the existing `create_survey_project()` inside the review transaction and stores the resulting `approved_project_id`. Existing `survey_projects.status` remains strictly operational (`active`/`closed`), so collection, recruitment, governance, offline capture, work assignments and payables do not need draft-state branches. Direct FieldLance project creation is additionally hardened so a project may use only a FieldLance-owned template or a template owned by the same NGO.

# Previous architecture note — FieldLance 2.15.0
Template self-service extends `survey_template_drafts` with organization ownership and review state. `survey_templates` remains the immutable published artifact and now preserves optional NGO ownership plus `source_draft_id`. `survey_template_review_events` is append-only workflow history. NGO authorization is organization-scoped through active `ngo_admin` membership; FieldLance review remains `can_manage_surveys()`. Project staff roles from 2.14 receive no template authority.

The application-side starter library remains a source for creating drafts; it is not migrated into a parallel marketplace. Project self-service is deferred to 2.15.1 and must materialize approved requests into the existing `survey_projects` operational table rather than overloading current `active/closed` operational status.

# Previous architecture note — FieldLance 2.14.2

2.14.2 stabilizes the project-scoped operational workspace on the 2.14 authorization layer. Project dashboards, response queues, status filters and assignment-area coverage query only rows allowed by existing RLS. Project staff never become global NGO Admin by implication.

**Current 2.14.2:** Project Managers receive project-wide operational monitoring/review and existing assignment controls; Area Focal Persons receive geography-scoped monitoring/review without assignment-management UI. Direct project navigation and revoked-workspace fallback are browser-stabilized. No new database migration is added.

FieldLance remains a React/TypeScript modular monolith backed by Supabase/PostgreSQL. Current domains include authentication, organizations, volunteers, surveys, registry/canonical identity, assistance/needs, controlled sharing, verification/governance, offline field reliability, workforce recruitment and payable accounting. Historical phase notes below are retained for provenance; later migrations and release notes take precedence.

Public recruitment browsing is independent of permanent NGO full-profile sharing. Since 2.13.1 the user-facing permanent sharing control is retired: applications carry bounded recruitment snapshots, while live NGO access to a volunteer profile is tied to explicit invitation/assignment relationships. The historical `profile_shares` table/RPC is retained only as a compatibility surface and current rows are cleared by the 2.13.1 migration. Volunteer profile publication remains separate from independent identity verification.

FieldLance work experience is now derived from authoritative survey-project records instead of copied into a second platform-experience table. `work_experience_history()` combines survey assignments, workforce assignment state, project/template metadata and current survey-review outcomes. Manual/external `volunteer_experiences` remain separate. Authorized third-party profile readers receive only FieldLance work backed by approved surveys or completed assignments; recruitment snapshots include at most 10 bounded verified work summaries.

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
- `notifications`: own-recipient actionable inbox with category/priority/deep-link/archive metadata; Communication Center pages 50 at a time. External provider delivery is still deferred.
- `src/Phase12.tsx`: geography, document and notification UI.
- `scripts/test-phase12.mjs`: applies the original migration, creates legacy data, upgrades, and tests PostgreSQL and Storage RLS policies.

Document flow: reserve → upload bytes → finalize metadata → FieldLance review. Interrupted uploads can be finalized if bytes exist, or removed and retried. Removal changes metadata first, deletes bytes through Storage, then retains a deleted-history row. Document review is independent from profile publication. No direct deletion of Storage SQL rows in application code.

Current profile publishing requires the configured mandatory profile fields and Taluka / Tehsil / Subdivision, but it does not require admin approval or documents. Private documents have their own review status and never unpublish an active profile. Legacy profile-review RPCs remain only for backward compatibility.

Document downloads use authenticated Storage download, never public or signed sharing URLs. The application RPC audits download requests; it does not prove a completed download and does not intercept direct authenticated Storage reads. Comprehensive download logging requires Storage/API logging or a dedicated download gateway. Already downloaded files cannot be recalled.

Server MIME/size restrictions and client magic-byte checks are not malware scanning; a modified client can bypass the latter. No server quarantine/scanner, automated retention purge or consent capture for identity-document processing is included. Use synthetic evidence for local testing until those controls and policies are configured.

## Current profile publication (2.7.4)

Volunteer profile lifecycle is now **Draft → Active** through the volunteer's own publish action. Published edits go live immediately after server validation. The historical database value `verified` is retained as the active/marketplace-ready state for compatibility with existing survey/workforce authorization; the UI labels it **Active** and it no longer means FieldLance approved the profile. Work experience confirmation and private-document review remain separate workflows. Profile photos use a private Storage bucket and inherit the same authorized profile-read scope.

## Subsequent foundation work

Phase 1.3 delivers directory pagination, generated public-schema types and Volunteer Manager / NGO Manager / Auditor roles. Configurable geography levels/import, pagination of supporting lists, Registry Manager and project-specific consent/data policies remain open. Legacy FieldLance Admins retain broad access. Organization invitations may follow registered-account membership assignment.

## Survey/registry pilot after volunteer foundation

Versioned templates and projects, person/household schema, consent/versioned project policy, deterministic identity matching, field collection/review, then assistance tracking. Keep NGO/project-specific facts and case notes scoped separately from canonical identity.

## Before cloud rollout

Apply migrations to a dedicated cloud project, configure exact redirect URLs and production SMTP, and align password and confirmation settings in hosted Auth. Local config does not automatically configure hosted Auth. Set only the project public key and URL in the frontend environment. Choose a host with SPA fallback for `/auth/callback` and `/reset`. Rebuild after environment changes. Add monitoring, backups/recovery validation, rate-limiting/CAPTCHA appropriate to exposure, upload protection, retention/consent policy and production security review before onboarding real sensitive cases.

## Phase 2.5 collaboration boundary

The canonical identity layer remains FieldLance-controlled. Partner organizations coordinate through three new relational records rather than receiving cross-project table permissions:

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

## FieldLance 2.13 — Partner NGO onboarding

Partner NGO onboarding is a separate approval workflow rather than direct creation of an active `organizations` record. `partner_ngo_applications` holds the representative's draft/review lifecycle and structured programs/operating areas. `partner_ngo_application_documents` holds private evidence metadata; bytes live in the private `poem-ngo-applications` bucket.

Approval is the boundary that creates the active organization and first `ngo_admin` membership. A personal FieldLance account remains the human identity; FieldLance does not create or encourage shared NGO credentials.
