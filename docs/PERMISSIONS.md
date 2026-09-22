# Current permissions note — FieldLance 2.37.0

Field Worker scheduling data is private by default. Organizations receive only the minimum aggregate signal needed to prepare a safe formal assignment.

## 2.37 permissions

- **Field Worker:** read/update own structured availability through guarded RPCs; read own upcoming offered/active assignment schedule; add/remove own unavailable periods.
- **Organization Admin / authorized Project Manager / FieldLance survey authority:** call the conflict-preview RPC only for a project they already have workforce-management authority over. The result contains status/counts/capacity, not other Organization/project names or assignment IDs.
- **Unrelated Organization/user:** cannot read private availability rows and cannot request another project's workforce conflict preview.
- **Database guard:** hard scheduling conflicts are rejected on offered/active `work_assignments` even if a client bypasses the offer UI.
- **No new broad authority:** scheduling does not widen survey, finance, project-team, verification or moderation permissions.

## Previous release

# Current permissions note — FieldLance 2.36.1

Partner Self-Publishing & Platform Moderation. Active Organization Admins may publish their own saved survey-template and project drafts directly. FieldLance survey-management roles no longer approve those drafts before publication; they govern published content through audited post-publication moderation.

## 2.36.1 permissions

- **Organization Admin:** create/edit private own-Organization template/project drafts and publish them directly; use allowed FieldLance templates or allowed own-Organization templates for own projects; read moderation reason/history for own published content.
- **FieldLance Survey Manager/Admin:** retain direct FieldLance template/project creation and may block, remove from operation, or restore any published survey template/project with a mandatory reason. They do not need to pre-approve Partner Organization publication.
- **Project Manager / Area Focal Person:** receive no new template/project publication authority and no platform-moderation authority. Existing project/area operations remain scoped by current RLS/RPC rules.
- **Other Organization / ordinary member / Field Worker:** cannot read another Organization's private drafts or private Organization-owned templates unless an existing authorized project relationship permits historical template access.
- **Moderation effects:** both blocked and removed content reject new recruitment/assignment/collection actions. A temporary block preserves existing commitment state so it can resume after restore; Remove from operation closes/cancels forward recruitment and assignment state. Historical authorized records are preserved, and restoring removed content does not silently recreate cancelled work.
- **Hard delete is not the moderation default:** `removed` is an operational moderation state so project/template provenance, finance, survey, case and audit history remain intact.
- **Independent Verification:** Organization/Field Worker/beneficiary verification remains separate and unchanged; publishing a project/template does not imply verification, and verification does not pre-approve project/template content.

## Previous release

# Current permissions note — FieldLance 2.36.0

URL Routing, Deep Links, Workspace Navigation & Mobile Field Worker IA. Canonical browser paths now restore authorized workspace/page/project context, browser history is draft-safe, project tabs and case/recruitment records support deep links, and the Field Worker mobile workspace has Home / Work / Field / Earnings / Profile primary navigation. No database migration is added. See docs/PHASE-2.36.0.md, docs/UPGRADE-2.36.0.md and docs/VALIDATION-2.36.0.md.

## 2.36 permissions

- URLs are never trusted as authorization. Explicit workspace routes are resolved only against `my_workspace_access`.
- A manually entered Organization, Staff or project path cannot create membership, project assignment or platform authority.
- Project/case/recruitment record restoration still depends on the existing RLS/RPC result.
- Unauthorized or stale workspace/page routes are canonicalized to an authorized workspace home.
- Mobile bottom navigation is presentation only and exposes only destinations already present in the personal Field Worker navigation set.

## Previous release

# Current permissions note — FieldLance 2.31.0

Operational Analytics, Dashboard Accuracy & Reporting. Permission-scoped exact totals, paginated drill-downs, UTC filters, monthly current-state trends and audited CSV exports. See docs/PHASE-2.31.0.md and docs/UPGRADE-2.31.0.md.

## Previous release

# Current permissions note — FieldLance 2.30.1

2.30.1: project navigation awaits device drafts; storage SELECT permits deleting objects only for active project managers so guarded deletion can finish. Existing database role authority remains unchanged.


## Project Workspace Completion & UX Consolidation

Frontend controls now follow the existing backend split more closely: NGO Admin / FieldLance survey authority can manage project staff; Project Manager can manage recruitment and project/case operations where existing RPCs permit; Area Focal Person retains scoped operational visibility without broad project-management, finance, case or activity authority. FieldLance finance authority and NGO Admin retain project-funding access; Project Manager does not inherit finance authority.

Project documents are readable by active project staff and project managers through server-side membership checks. Upload/delete requires `app_private.can_manage_project(project_id)`. Storage is private and object policies validate the corresponding document reservation state. Project activity is deliberately manager-only because audit details can contain management context beyond an Area Focal Person's field scope.

## Field Worker Reputation & Certificates

See docs/PHASE-2.29.0.md and docs/UPGRADE-2.29.0.md for this release.

## Organization Settings, Team & Compliance

See docs/PHASE-2.28.0.md and docs/UPGRADE-2.28.0.md for this release.

## 2.26 Paid Work Funding Assurance & Project Finance Closure

Desktop sidebar uses 280px expanded and 76px compact layouts with an optional persistent preference. Mobile uses the existing full-label drawer. Workspace-specific collapsible groups keep tasks/updates near Home and move optional impact modules into their own group. Navigation renders only the authorized page set from 2.25.1. Its active group expands on navigation, compact icons retain accessible names and native titles, and navigation scrolls separately from identity/sign-out controls.

Public navigation, onboarding and verification terminology now uses Organization and Field Worker. Unavailable Email/Push preference controls are hidden while stored preferences are preserved. Wallet Sandbox is excluded from the production frontend import/render path; existing backend finance permissions and mock-provider services are unchanged. Audit actors prefer authorized account names and expose UUIDs only in technical details.

Paid opportunities are gated by project funding coverage through a security-definer trigger while finance commitments and closure transitions remain RPC-only. Existing payable/ledger permissions are preserved.

## Previous release notes retained

## 2.25.1 Identity and workspace stabilization

The migration adds guarded begin_workspace_onboarding(text) and my_workspace_access() RPCs. Authenticated clients cannot directly edit enrollment or intent columns. Organization onboarding grants no organization administration; staff access requires an authorized platform role. Worker enrollment does not reactivate suspended profiles. Legacy worker access is preserved and labelled, while new organization signups do not enroll as workers.

## Previous release behavior retained
## 2.25.0 Earnings, Wallet & Withdrawal UX

- 2.25.0 adds **no database authority** and no migration. Existing RLS/RPC/payment permissions remain authoritative.
- Field Worker Earnings reads only the signed-in user's paid assignments and existing personal withdrawal summary/history RPCs.
- A Field Worker may submit allowed claims/disputes and request a withdrawal through existing guarded RPCs, but cannot approve/pay their own payable units or settle their own withdrawal.
- Organization payable management stays scoped to the active Organization and existing project/finance authority. Accepted contract snapshots remain immutable evidence for payable calculation.
- FieldLance payout operations remain restricted to existing finance-management roles and guarded admin RPCs; the new queue metrics do not expose direct wallet secrets or grant settlement authority.
- Transaction PIN hashing/lockout, wallet verification status, withdrawal activation holds, dual-control thresholds and provider reconciliation remain server-enforced.
- Navigation labels (`Earnings`, `Field Worker payables`, `Payout operations`) are presentation aliases only; stored internal page keys remain unchanged.
- No live JazzCash/Easypaisa, SMS, bank or IBAN authority is introduced.

## 2.22.0 FieldLance Staff Operations permissions

- Staff Operations adds **no new database authority**. Visibility remains constrained by existing platform roles, RLS and guarded RPC execution grants.
- The Staff Home performs no insert/update/delete and does not call decision/mutation RPCs. Queue cards navigate to the existing authorized workspaces.
- Organization review metrics are loaded only for existing NGO-management roles; Field Worker review metrics only for existing volunteer-management roles.
- Survey/recruitment/case metrics are loaded only for existing survey-management roles.
- Finance metrics are loaded only for existing FieldLance Admin/Super Admin finance roles and use the guarded withdrawal/reconciliation RPCs; direct sensitive wallet/withdrawal table access is not added.
- Curated Staff navigation is a presentation filter. Direct page state cannot bypass backend authorization.
- Personal Field Worker profile/work-history/wallet pages remain in the personal workspace, not the Staff sidebar.
- Historical internal `poem` scope and role/storage identifiers remain compatibility details and are not renamed by this UX release.


## 2.21.0 Organization workspace permissions

- Organization Home adds **no new database authority**. Every metric is read through the same authenticated organization/project visibility already enforced by RLS.
- The dashboard performs no insert/update/delete and calls no mutation RPC. Its action buttons navigate to existing authorized workspaces.
- Organization navigation is a presentation filter, not a permission grant. A direct URL/state change still cannot bypass PostgreSQL RLS or guarded RPC checks.
- Recruitment summaries remain scoped to the active organization; application-scoped profile snapshots do not become permanent profile shares.
- Formal assignment offers still require Field Worker acceptance before marketplace survey access becomes active.
- Beneficiary cases, assistance entries, survey responses, payables and project finance remain scoped by their existing organization/project policies and RPCs.
- Organization identity/logo is read from the existing approved organization record; private Partner NGO application documents are not exposed by the dashboard.
- Personal Field Worker profile, work-history and wallet pages are intentionally excluded from the Organization sidebar; switching workspace is required to reach personal data.

# Current permissions note — FieldLance 2.20.0

## 2.20.0 Field Worker workspace permissions

- The Field Worker Home dashboard adds **no new database authority**. All summaries are constrained by the same personal RLS/RPC visibility already used by the underlying workspaces.
- Opportunity count comes only from `available_work_opportunities`; the dashboard cannot expose draft, closed, expired or otherwise unauthorized opportunities.
- Application and assignment summaries are the signed-in user's own visible rows. The dashboard does not grant Organization access to the Field Worker's private profile.
- Earnings summary comes from `my_withdrawal_summary`; the dashboard cannot approve payables, verify wallets, execute provider settlement or create withdrawals.
- Verified work history comes from `work_experience_history`; the dashboard does not create/edit verified history or convert profile completeness into verification.
- Navigation-label changes are presentation-only. Stored page keys, internal roles and backend policies remain unchanged.
- Survey access still begins only through existing accepted formal assignments or existing explicit direct assignment rules.

## 2.19.8 marketplace permissions


- Field Workers may discover only opportunities returned by the existing `available_work_opportunities` authorization/filtering RPC.
- Applying shares only the existing application-scoped recruitment snapshot; no permanent/full NGO profile grant is created by the 2.19.8 UI.
- Organization/Project recruitment actions continue to depend on existing RLS and guarded RPC authorization. Frontend tabs and buttons are not a security boundary.
- Selection does not activate survey access. Formal assignment access begins only after the worker accepts an authorized assignment offer, except for already-supported explicit direct survey assignments.
- 2.19.8 changes no beneficiary, finance, payable, wallet, payment-provider or Partner NGO approval permissions.

## 2.19.7 Partner NGO application permissions

- **Applicant / personal account:** may create/edit its own draft or changes-requested Partner NGO application, add operating/program areas, upload/remove its organization logo and private supporting documents, and submit only when server requirements are satisfied.
- **Organization logo draft:** private to the applicant and existing FieldLance NGO-management reviewers; unrelated authenticated users cannot read it before approval. Applicant write/delete access ends when the application leaves an editable state.
- **Approved organization logo:** after approval, the logo path is copied to the active organization and may be read by active authenticated platform users for organization presentation. It does not expose legal supporting documents.
- **FieldLance NGO management:** retains the existing application/document review authority. 2.19.7 adds no reviewer self-approval or cross-role bypass.
- **Supporting documents:** remain in the existing private `poem-ngo-applications` bucket with the existing owner/reviewer lifecycle; added document categories do not broaden read authority.
- **Direct tables:** application/logo state remains RPC/Storage-policy controlled. The five-step UI, completion indicator and success modal grant no authority.
- **Approval:** still creates one organization and first NGO Admin membership through the guarded existing review workflow; logo synchronization is an approval-side database effect only.


## 2.19.6 visual-system / navigation permissions

2.19.6 adds no role, grant, RLS policy, storage policy or RPC authority. Navigation configuration and workspace labels are presentation-only. AppShell continues to build the candidate page list from existing authorized scope before centralized grouping, and the database remains authoritative for every read/write operation.

Public labels Field Worker, Organization and FieldLance Staff do not rename internal workspace keys (`volunteer`, `ngo`, `poem`) or database roles/statuses. The header notification shortcut uses the same already-loaded recipient-scoped notification rows and opens the existing Notifications workspace; it grants no new notification access.

CSS/status changes are visual only. Stored workflow states, finance/payment authorities, beneficiary/case authorities, project roles and Partner NGO onboarding permissions are unchanged.

## 2.19.3 follow-up / outcomes / closure permissions

- **FieldLance Survey/Data authority:** may schedule/complete/cancel follow-ups, record outcomes, close/reopen cases and use the scoped follow-up queue across existing survey-management authority.
- **NGO Admin:** same operations for the NGO's own authorized projects.
- **Project Manager:** same case/follow-up lifecycle operations for assigned projects through existing `can_manage_project`; this does not grant NGO-wide administration or finance authority.
- **Area Focal Person:** no broad case/follow-up/closure mutation authority is added in 2.19.3.
- **Other NGOs / collectors / volunteers:** no cross-organization case follow-up or closure authority.
- **Direct tables:** `beneficiary_case_followups`, follow-up revisions and lifecycle events are RPC-only to browser roles. Bounded data is returned through case detail/follow-up queue RPCs.
- **Need outcome changes:** only a follow-up actively linked to that case need may request a need-status update, and existing `met` assistance requirements still apply.
- **Closure:** allowed only after server-derived blockers are zero; the browser cannot self-declare a case closure-eligible.
- **Payments/finance:** no new authority over worker payables, project finance, e-wallets or withdrawal settlement.

## 2.19.2 assistance ledger / duplicate-control permissions

- **FieldLance survey authority:** may review canonical duplicate conflicts across its existing survey-management scope, record ready planned deliveries, view the scoped ledger and document protected-conflict overrides.
- **NGO Admin:** may record ready deliveries and view the assistance ledger for own-organization projects. A duplicate blocker may be overridden only when every blocker is within the NGO Admin's existing project authority; protected blockers require FieldLance review.
- **Project Manager:** may record a no-blocker ready delivery and view the ledger only for actively assigned projects. Project Manager cannot override a blocking duplicate signal and gains no cross-NGO detail.
- **Area Focal Person:** receives no case/request/plan/delivery/ledger management access in 2.19.2.
- **Other NGO / unrelated staff / volunteers:** no delivery or ledger access outside existing project authority.
- **Authenticated browser clients:** `assistance_distribution_deliveries` is RPC-only. Internal duplicate snapshots are not directly selectable.
- **Service role:** database maintenance only; never exposed to browser clients.

Existing `assistance_entries` RLS remains authoritative for the delivered ledger. Planned-delivery RPCs do not grant finance, payable, wallet, withdrawal or provider-settlement authority. Cross-NGO assistance detail continues to require the separate controlled data-sharing subsystem; duplicate controls may return only a FieldLance-review-required signal when a blocking source is protected.

## 2.19.1 assistance distribution planning permissions

- **FieldLance survey authority:** may view/manage cases, approved requests and distribution plans across its existing survey-management scope.
- **NGO Admin:** may view/manage its organization projects/cases/requests/plans and retains request approval/rejection authority.
- **Project Manager:** may create/edit/schedule/mark-ready/cancel distribution plans only for an actively assigned project; this does not grant NGO-wide admin or request-approval authority.
- **Area Focal Person:** receives no beneficiary-case/request/distribution-plan table or RPC access in 2.19.1. Area-scoped distribution execution remains deferred until explicitly designed.
- **Other NGO / unrelated project staff / volunteers:** no planning access unless separately authorized by an existing project-management role.
- **Authenticated browser clients:** plan tables are select-only through RLS; all plan mutation is RPC-only.
- **Service role:** retains database maintenance privileges; it is never exposed to the browser.

An active distribution plan blocks cancellation of its approved assistance request. Cancelling the plan first releases that operational guard; request cancellation still follows the 2.19.0 authority rule (approved requests require NGO Admin or FieldLance survey authority). Responsible-party text on a plan is informational and grants no access.

## 2.19.0 beneficiary case / assistance-request permissions

The 2.19.0 split remains unchanged: FieldLance survey authority, NGO Admin and Project Manager manage cases/requests; only NGO Admin / FieldLance survey authority approve or reject requests.

## 2.18.3 consolidated payment permission boundary

- **Volunteer/account owner:** may operate only personal JazzCash/Easypaisa wallets, secure PIN and eligible withdrawal requests through guarded RPCs.
- **NGO Admin:** retains funded payable approval authority but receives no provider settlement, PIN or central finance authority.
- **Project Manager / Area Focal:** receive no wallet/provider/central-finance authority.
- **FieldLance Admin / Super Admin:** may operate mock verification and finance/manual settlement functions subject to existing policy and dual-control checks.
- **Sensitive tables:** direct authenticated access to wallet security, withdrawals, allocations, provider events and manual operation history remains denied; tests must use the same bounded RPCs as the application.
- **Provider scope:** JazzCash and Easypaisa only; current execution modes are mock and manual. No bank/IBAN or live-provider permission surface is added.


## 2.18.2 withdrawal operations permissions

- **Volunteer / account owner:** may link JazzCash/Easypaisa, manage their secure transaction PIN, request withdrawal within configured limits, view status/references and cancel only while still `requested`. They cannot approve, process, settle, fail or reverse a withdrawal.
- **NGO Admin:** retains existing payable authority but receives no e-wallet/provider-operation or central settlement authority. Active withdrawal reservations continue to block competing payable monetary mutation.
- **FieldLance Admin / Super Admin:** may configure payout limits, approve manual settlement, start processing, record provider success/failure/reversal and view reconciliation. At/above the dual-control threshold, the approver cannot also record settlement.
- **Project Manager / Area Focal:** no payout, PIN or central-finance authority.
- **Direct table access:** payout policy and manual-operation history are not directly exposed to authenticated browser roles; guarded RPCs provide bounded views/actions.
- **Supported providers:** JazzCash and Easypaisa only. No bank/IBAN payout surface exists.

## 2.18.1 e-wallet / withdrawal permissions

2.18.1 permissions remain in force for wallet ownership, activation hold, PIN lockout and mock-provider controls. Manual operations added in 2.18.2 do not weaken those boundaries.

## 2.18.0 e-wallet / withdrawal permissions

- **Volunteer / account owner:** may link their own JazzCash/Easypaisa wallet, choose a default verified wallet, configure/change their own transaction PIN, request withdrawals from their own approved unpaid PKR entitlement, and cancel a request before processing. They cannot self-verify a wallet or mark their own withdrawal successful.
- **NGO Admin:** receives no wallet credential/PIN access. Existing payable approval/adjustment/payment authority remains, but monetary payable mutation is blocked while the affected unit is reserved by an active user withdrawal.
- **FieldLance Admin / Super Admin:** existing finance authority remains unchanged and includes the development-only **E-Wallet sandbox** for mock wallet verification and mock provider callback outcomes. Admins still do not receive browser access to transaction PIN hashes or unmasked wallet numbers.
- **Project Manager / Area Focal:** no e-wallet, withdrawal, PIN or central-finance authority is added.
- **Other users/NGOs:** cannot read or operate another user's wallets/withdrawals.
- **Mock provider controls:** FieldLance-Admin-only. They are not proof of live wallet ownership and must not be treated as production provider authorization; end users cannot invoke them.
- **Direct table access:** authenticated roles receive no direct grants on `e_wallets`, `e_wallet_security`, `e_wallet_withdrawals`, allocations or provider-event tables. Guarded SECURITY DEFINER RPCs return only bounded/masked data.
- **Supported payout methods:** JazzCash and Easypaisa only. Bank accounts/IBAN are not in the 2.18.0 schema or UI.

## 2.17.2 finance bridge permissions

- **FieldLance Admin / Super Admin:** read central finance, create/verify funding sources, use generic finance administration, run payable-finance reconciliation and future operational repair actions.
- **NGO Admin:** read own-organization finance, reserve/release verified own-organization project funds, approve/manage worker payables, and reconcile own project payable events. Generic arbitrary journal posting remains denied.
- **Project Manager:** no finance ledger access and no reconciliation authority. Operational compensation terms remain read-only project context.
- **Area Focal Person:** no global finance access or funding controls.
- **Volunteer:** sees their worker payable subledger through existing rules but not central finance bridge/link records.

The payable bridge is automatic for new monetary payable events. Its private trigger/helper functions are not executable by authenticated users directly. `finance_payable_event_links` is read-only through finance RLS and immutable even through privileged direct SQL; correction happens through new source payable events / finance journals, never link mutation.

## 2.17.0 finance permissions

| Capability | FieldLance Super/Admin | NGO Admin (own NGO) | Project Manager | Area Focal | Volunteer |
| --- | --- | --- | --- | --- | --- |
| Read organization finance accounts/journals/postings | Yes | Yes | No | No | No |
| Read FieldLance/system finance accounts | Yes | No | No | No | No |
| Create generic finance account | Yes | No | No | No | No |
| Post generic balanced journal | Yes | No | No | No | No |
| Reverse posted journal | Yes | No | No | No | No |
| Edit/delete posted finance history | No | No | No | No | No |

The generic posting RPC is intentionally not an NGO money-movement API. NGO funding/reservation actions arrive in 2.17.1 as constrained business RPCs. Project Manager/Area Focal operational roles are not automatically financial roles.


- **NGO Admin:** may configure paid/volunteer project compensation defaults for own active projects, including basis/currency/rate/note; may manage recruitment and assignments under existing project/recruitment gates.
- **Project Manager:** may read project compensation defaults, create recruitment opportunities and send formal assignment offers, but cannot change project compensation defaults. The database derives contract compensation from the authoritative project/opportunity snapshot rather than trusting manager-supplied rate fields.
- **Area Focal Person:** receives no global compensation configuration, recruitment-rate or payable-management authority; existing geography-scoped monitoring/review remains unchanged.
- **Volunteer:** sees structured compensation on published opportunities and formal assignment offers; accepting an offer confirms the frozen assignment terms.
- **FieldLance survey manager/admin:** may configure compensation defaults where existing project-management authority permits and continues existing oversight.
- **Payables:** existing NGO Admin payable approval/payment rules remain unchanged. Project compensation configuration is not a funding balance and does not grant payment-provider or finance-ledger authority.
- Direct table/UI edits are not an authorization boundary. Guarded RPCs, immutable assignment triggers, RLS and existing payable uniqueness enforce the contract/payable chain.

# Previous permissions note — FieldLance 2.16.0

- **NGO Admin:** may read/update the approved-response target, required-volunteer capacity and manual recruitment gate for own active projects; may continue existing NGO-wide recruitment/assignment operations subject to the effective project gate.
- **Project Manager:** may read/update the project recruitment plan, manage project recruitment and assignments, and see project-wide target/capacity metrics. New recruitment/offers are server-blocked when target/capacity/manual state closes.
- **Area Focal Person:** may continue geography-scoped monitoring/review only; cannot read/update the global recruitment plan or gain project-wide recruitment/assignment authority.
- **Volunteer:** may discover/apply only while an opportunity remains published/open **and** the project effective recruitment gate is open. Existing assigned field work is not invalidated by target reach.
- **FieldLance survey manager/admin:** retains existing project/recruitment authority and is subject to the same project target/capacity gate for new recruitment activity.
- Direct project-plan mutation is not a frontend trust boundary; guarded RPCs plus triggers/RLS enforce the target/capacity rules.

# Previous permissions note — FieldLance 2.15.1

- **NGO Admin:** create/edit own-organization project drafts while `draft`/`changes_requested`, submit/resubmit them, read decision history and see the resulting operational project after approval.
- **FieldLance survey manager/admin:** review all submitted NGO project drafts, request changes, reject, or approve and atomically activate the existing operational project model.
- **Project Manager / Area Focal Person:** receive no project-draft authoring/submission/approval authority; their access begins from approved operational projects under the 2.14 project/area model.
- **Other NGO / ordinary member / volunteer:** cannot read or mutate another NGO's project drafts or review history.
- **Template boundary:** a project may use a FieldLance-owned template or an approved template owned by the same NGO; cross-NGO private template reuse is rejected server-side.
- Direct workflow-table writes remain denied; RLS protects reads and guarded RPCs own mutations.

# Previous permissions note — FieldLance 2.15.0

- **NGO Admin:** create/edit organization-owned template drafts while `draft`/`changes_requested`, submit/resubmit them, read review history and read own approved templates plus FieldLance-owned published templates.
- **FieldLance survey manager/admin:** retain direct FieldLance draft publication and can review all submitted NGO drafts, request changes, reject or approve+publish.
- **Project Manager / Area Focal Person:** no template authoring, submission or approval authority.
- **Other NGO / ordinary member / volunteer:** no access to another NGO's draft/review history or private NGO-approved templates.
- Direct table writes remain denied; workflow mutations use guarded RPCs and RLS remains the read boundary.

# Previous permissions note — FieldLance 2.14.2

## 2.14.2 project-scoped roles

| Capability | FieldLance Survey Manager | NGO Admin | Project Manager | Area Focal Person | Collector |
| --- | --- | --- | --- | --- | --- |
| Assign/revoke project staff | Yes | Own NGO project | No | No | No |
| Read project | Yes | Own NGO project | Assigned project | Assigned project | Assigned project |
| Whole-project operational review | Yes | Own NGO project | Yes | No | No |
| Review responses | Yes | Own NGO project | All project areas | Assigned area + descendants | Own response only |
| Change scoped survey assignment | Yes | Own NGO project | Yes | No | No |
| Publish templates / canonical administration | Yes where existing role permits | Existing rules only | No | No | No |
| Organization memberships / cross-NGO sharing / finance | Existing rules | Existing rules | No new access | No new access | No |

Project staff authority additionally requires an active account and active membership in the owning NGO. UI visibility is not an authorization boundary; RLS/RPC helpers enforce area scope.

- Sign-in exposes explicit Volunteer, Partner NGO and FieldLance Staff destinations while keeping one personal FieldLance credential set per person. Approved NGO representatives enter an active NGO workspace; otherwise Partner NGO sign-in routes to the onboarding application.
- The volunteer profile no longer exposes permanent “Allow profile access” controls. Current open recruitment uses application snapshots; live NGO profile reads are bounded to explicit invitation/assignment relationships.
- Direct survey assignment no longer requires a permanent profile-sharing grant; project authority, active/published volunteer state and project verification policy are still enforced.
- Active volunteers can browse published public recruitment without granting permanent NGO profile access.
- Applying requires an active/published volunteer profile plus application-scoped recruitment-profile consent.
- Invite-only recruitment remains limited to invited volunteers.
- Partner NGO admins/reviewers remain scoped to their authorized organization/project operations; FieldLance-only canonical and platform verification powers are unchanged.
- Independent volunteer identity verification tracks identity-relevant name data, not ordinary CV edits such as skills or availability.
- Canonical identity reconciliation is FieldLance-only and cannot clear review state while unresolved/stale match decisions remain.
- Volunteers can read their complete automatic FieldLance work history; FieldLance Volunteer Managers can inspect it for volunteer management. Other authorized profile readers see only FieldLance work backed by approved surveys or completed assignments.
- Automatic FieldLance work history exposes project/NGO/field/area and review counts, never beneficiary answers, private documents, payment values or supervisor feedback.
- Previous/external experience remains volunteer-controlled and uses the existing NGO confirmation workflow.

Historical permissions notes below remain useful for original phase boundaries; later migrations supersede them where stated.

## Consolidated 2.13.3 permission boundary

2.13.3 changes no authorization rule. Existing platform roles, organization memberships, project/workforce relationships, verification permissions, canonical-registry restrictions, sharing grants and payable permissions continue to be enforced by the database. UI visibility is not an authorization boundary. Project Manager and Area Focal Person roles are **not** part of this release; they belong to the planned 2.14 project-scoped authorization model.

> Current consolidated release: [2.13.3](PHASE-2.13.3.md). For current validation and remaining limits, see [2.13.3 validation](VALIDATION-2.13.3.md). Older permission matrices below are historical and later migrations take precedence.

> Phase 2.3: [Needs Assessment & Assistance Follow-up](PHASE-2.3.md) adds approved-survey assessments, assistance links and a follow-up queue. See [upgrade instructions](UPGRADE-2.3.md). Earlier sections describe their original release scope.

> Phase 2.2: [Registry Review & Assistance Ledger](PHASE-2.2.md) adds identity corrections, project-scoped match decisions and recorded deliveries. See [upgrade instructions](UPGRADE-2.2.md). Earlier-phase sections retain their historical scope.

> Phase 2.1 update: see [Survey & Registry Pilot](PHASE-2.1.md) for the current survey model, permissions and acceptance checks, and [upgrade instructions](UPGRADE-2.1.md) for existing installations. Earlier-phase sections below describe their original scope.

Historical Phase 1.4: see [experience/invitation workflow and permissions](PHASE-1.4.md) and [upgrade instructions](UPGRADE-1.4.md).

Historical Phase 1.3: [staff permission matrix](PHASE-1.3.md). Treat it as provenance only; the current database/functions and the 2.13.3 note above define the active permission boundary.

# FieldLance Phase 1.2 permission matrix

Permissions are enforced in PostgreSQL, not by hidden navigation alone. All public mutation RPCs verify the current `auth.uid()` and account status. Browser users have SELECT grants only on tables; all business changes use guarded functions.

| Action | Volunteer | NGO Admin | FieldLance Admin | FieldLance Super Admin |
| --- | --- | --- | --- | --- |
| Read/edit own CV profile | Yes, if not profile-suspended | Yes | Yes | Yes |
| Publish/edit own profile | Yes, after server validation | Yes | Yes | Yes |
| Read another volunteer | No | Only explicit grant to active NGO with active membership | Yes | Yes |
| Approve another profile | Not required | Not required | Not required for publication | Not required for publication |
| Create/edit NGOs | No | No | Yes | Yes |
| Assign registered users to NGOs | No | No | Yes | Yes |
| Change platform role / account suspension | No | No | No | Yes, other accounts only |
| Grant/revoke own NGO profile access | Yes | Yes | Yes | Yes |
| View active partner directory | Yes | Yes | Yes | Yes |
| View profile audit | Own events | Own events | All events | All events |
| Direct table mutation / forged audit | No | No | No | No |

FieldLance Admin and Super Admin are platform roles. NGO Admin is a membership of a specific organization; it never grants platform roles. All registered accounts also have a personal volunteer profile.

## Access revocation

- Account suspended: protected table reads and all application mutations are denied on future requests; only own account status remains readable for the suspension screen.
- NGO suspended/inactive: NGO-based access to shared volunteer profiles stops.
- NGO membership suspended: that user's NGO access stops.
- Profile grant revoked: that NGO's administrators lose future access to the profile.
- Volunteer profile suspended: NGOs cannot view it and the owner cannot edit it; FieldLance admins can review it.

These controls cannot erase information a viewer already saw or copied. Refresh/reload to discard previously rendered data. The original Phase 1.2 section did not include cross-NGO beneficiary sharing; current Phase 2.5 adds a separate controlled grant workflow. Fine-grained bulk export controls remain future work.

## First-admin bootstrap

Signup metadata is untrusted. The Auth trigger copies only a bounded display name and email; platform role is always the database default `volunteer`.

The local bootstrap script requires direct access to the project's named PostgreSQL Docker container. It only promotes a confirmed account when no active Super Admin exists, acquires a transaction lock, and appends an audit event. It is not exposed as an anonymous/public RPC.

## Profile publication workflow

Draft → Active (self-published after server validation).

Admin approval is not required for normal profile publication or later edits. The database keeps the historical `verified` value as the Active/marketplace-ready state so existing survey/workforce permissions remain compatible. Private-document reviews and NGO work-experience confirmations are independent from profile publication. Account/profile suspension still removes protected access.

## Phase 1.2 additions

| Action | Owner | NGO via profile share | FieldLance Admin / Super Admin |
| --- | --- | --- | --- |
| Read geographic hierarchy | Active account | Active account | Yes |
| Create/edit geography | No | No | Yes |
| Upload/remove own supporting files | Active account and allowed profile state | No additional rights | Own only |
| Read another user's document metadata/bytes | No | No | Yes |
| Review documents | No self-review | No | Other profiles only |
| Read/mark/archive notifications | Own only | Own only | Own only |

Storage object writes are the exception to the public-table SELECT-only rule: Storage API INSERT/DELETE are authorized by RLS against reserved document metadata. There is no object UPDATE policy. Profile suspension blocks new uploads/finalization, while owner removal and reading remain available to an active account. Account suspension blocks all document access. Public URLs and NGO grants do not grant file access. Application download requests are audited, but direct authorized Storage reads require separate infrastructure logging.

## Phase 2.5 controlled beneficiary sharing

Cross-NGO beneficiary access now uses a separate grant workflow; it does not modify the existing project RLS on surveys, registry persons, needs or assistance rows.

| Action | Requesting NGO Admin | Source NGO Admin | FieldLance Survey Manager/Admin/Super Admin | Unrelated NGO |
| --- | --- | --- | --- | --- |
| Discover source NGO for own canonically-linked person | Yes | N/A | Canonical tools separately | No |
| Create purpose-bound request | Yes | No | No | No |
| Approve/reject source request | No | Yes | No | No |
| Final authorize/reject | No | No | Yes | No |
| Reduce requested/approved fields | Request selects initial fields | Yes | Yes | No |
| Read raw other-NGO survey/need/assistance tables | No | Own project only | Existing FieldLance scope | No |
| Read approved shared summary | Active grantee only | No | Use FieldLance canonical tools instead | No |
| Revoke active grant | No | Yes | Yes | No |
| Read visible request/grant event trail | Involved NGO | Involved NGO | Yes | No |

A grant is invalid if revoked, expired, either NGO becomes inactive, or the canonical identity/version/linkage changes. Revocation is prospective; information already viewed or copied cannot be recalled.

## Phase 2.7 workforce marketplace

| Action | Volunteer | NGO Admin | FieldLance Survey Manager/Admin |
| --- | --- | --- | --- |
| Discover matching open opportunity | Own active/shared local profile only | N/A | N/A |
| Submit/withdraw application | Own | No | No |
| Read application | Own | Own organization | Oversight |
| Review application | No | Own organization | No |
| Search project candidates | No | Own project/organization | Oversight search |
| Create formal assignment offer | No | Own active project | No |
| Accept/decline assignment | Own offered assignment | No | No |
| Read assignment | Own | Own organization | Oversight |
| Complete assignment | No | Own organization | No |
| Cancel assignment | No | Own organization | Survey management emergency/oversight |

Candidate search returns profile information only where the NGO already has profile-sharing access. Aggregate experience counters do not disclose another NGO's raw survey or case records.

## Partner NGO onboarding (2.13)

| Action | Applicant | FieldLance NGO Manager/Admin | Other user |
| --- | --- | --- | --- |
| Create/read own NGO application | Yes | Review read | No |
| Edit draft / changes-requested application | Yes | No direct table mutation | No |
| Upload/remove own application evidence while editable | Yes | No | No |
| Download application evidence | Own | Yes | No |
| Review application document | No | Yes | No |
| Request changes / approve / reject | No | Yes | No |
| Activate organization / first NGO Admin membership | No | Approval RPC only | No |

Direct application/document table writes are not granted to authenticated clients; mutations use audited security-definer RPCs with owner/manager checks.
