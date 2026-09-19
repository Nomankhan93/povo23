# Current permissions note — POEM 2.19.1

## 2.19.1 assistance distribution planning permissions

- **POEM survey authority:** may view/manage cases, approved requests and distribution plans across its existing survey-management scope.
- **NGO Admin:** may view/manage its organization projects/cases/requests/plans and retains request approval/rejection authority.
- **Project Manager:** may create/edit/schedule/mark-ready/cancel distribution plans only for an actively assigned project; this does not grant NGO-wide admin or request-approval authority.
- **Area Focal Person:** receives no beneficiary-case/request/distribution-plan table or RPC access in 2.19.1. Area-scoped distribution execution remains deferred until explicitly designed.
- **Other NGO / unrelated project staff / volunteers:** no planning access unless separately authorized by an existing project-management role.
- **Authenticated browser clients:** plan tables are select-only through RLS; all plan mutation is RPC-only.
- **Service role:** retains database maintenance privileges; it is never exposed to the browser.

An active distribution plan blocks cancellation of its approved assistance request. Cancelling the plan first releases that operational guard; request cancellation still follows the 2.19.0 authority rule (approved requests require NGO Admin or POEM survey authority). Responsible-party text on a plan is informational and grants no access.

## 2.19.0 beneficiary case / assistance-request permissions

The 2.19.0 split remains unchanged: POEM survey authority, NGO Admin and Project Manager manage cases/requests; only NGO Admin / POEM survey authority approve or reject requests.

## 2.18.3 consolidated payment permission boundary

- **Volunteer/account owner:** may operate only personal JazzCash/Easypaisa wallets, secure PIN and eligible withdrawal requests through guarded RPCs.
- **NGO Admin:** retains funded payable approval authority but receives no provider settlement, PIN or central finance authority.
- **Project Manager / Area Focal:** receive no wallet/provider/central-finance authority.
- **POEM Admin / Super Admin:** may operate mock verification and finance/manual settlement functions subject to existing policy and dual-control checks.
- **Sensitive tables:** direct authenticated access to wallet security, withdrawals, allocations, provider events and manual operation history remains denied; tests must use the same bounded RPCs as the application.
- **Provider scope:** JazzCash and Easypaisa only; current execution modes are mock and manual. No bank/IBAN or live-provider permission surface is added.


## 2.18.2 withdrawal operations permissions

- **Volunteer / account owner:** may link JazzCash/Easypaisa, manage their secure transaction PIN, request withdrawal within configured limits, view status/references and cancel only while still `requested`. They cannot approve, process, settle, fail or reverse a withdrawal.
- **NGO Admin:** retains existing payable authority but receives no e-wallet/provider-operation or central settlement authority. Active withdrawal reservations continue to block competing payable monetary mutation.
- **POEM Admin / Super Admin:** may configure payout limits, approve manual settlement, start processing, record provider success/failure/reversal and view reconciliation. At/above the dual-control threshold, the approver cannot also record settlement.
- **Project Manager / Area Focal:** no payout, PIN or central-finance authority.
- **Direct table access:** payout policy and manual-operation history are not directly exposed to authenticated browser roles; guarded RPCs provide bounded views/actions.
- **Supported providers:** JazzCash and Easypaisa only. No bank/IBAN payout surface exists.

## 2.18.1 e-wallet / withdrawal permissions

2.18.1 permissions remain in force for wallet ownership, activation hold, PIN lockout and mock-provider controls. Manual operations added in 2.18.2 do not weaken those boundaries.

## 2.18.0 e-wallet / withdrawal permissions

- **Volunteer / account owner:** may link their own JazzCash/Easypaisa wallet, choose a default verified wallet, configure/change their own transaction PIN, request withdrawals from their own approved unpaid PKR entitlement, and cancel a request before processing. They cannot self-verify a wallet or mark their own withdrawal successful.
- **NGO Admin:** receives no wallet credential/PIN access. Existing payable approval/adjustment/payment authority remains, but monetary payable mutation is blocked while the affected unit is reserved by an active user withdrawal.
- **POEM Admin / Super Admin:** existing finance authority remains unchanged and includes the development-only **E-Wallet sandbox** for mock wallet verification and mock provider callback outcomes. Admins still do not receive browser access to transaction PIN hashes or unmasked wallet numbers.
- **Project Manager / Area Focal:** no e-wallet, withdrawal, PIN or central-finance authority is added.
- **Other users/NGOs:** cannot read or operate another user's wallets/withdrawals.
- **Mock provider controls:** POEM-Admin-only. They are not proof of live wallet ownership and must not be treated as production provider authorization; end users cannot invoke them.
- **Direct table access:** authenticated roles receive no direct grants on `e_wallets`, `e_wallet_security`, `e_wallet_withdrawals`, allocations or provider-event tables. Guarded SECURITY DEFINER RPCs return only bounded/masked data.
- **Supported payout methods:** JazzCash and Easypaisa only. Bank accounts/IBAN are not in the 2.18.0 schema or UI.

## 2.17.2 finance bridge permissions

- **POEM Admin / Super Admin:** read central finance, create/verify funding sources, use generic finance administration, run payable-finance reconciliation and future operational repair actions.
- **NGO Admin:** read own-organization finance, reserve/release verified own-organization project funds, approve/manage worker payables, and reconcile own project payable events. Generic arbitrary journal posting remains denied.
- **Project Manager:** no finance ledger access and no reconciliation authority. Operational compensation terms remain read-only project context.
- **Area Focal Person:** no global finance access or funding controls.
- **Volunteer:** sees their worker payable subledger through existing rules but not central finance bridge/link records.

The payable bridge is automatic for new monetary payable events. Its private trigger/helper functions are not executable by authenticated users directly. `finance_payable_event_links` is read-only through finance RLS and immutable even through privileged direct SQL; correction happens through new source payable events / finance journals, never link mutation.

## 2.17.0 finance permissions

| Capability | POEM Super/Admin | NGO Admin (own NGO) | Project Manager | Area Focal | Volunteer |
| --- | --- | --- | --- | --- | --- |
| Read organization finance accounts/journals/postings | Yes | Yes | No | No | No |
| Read POEM/system finance accounts | Yes | No | No | No | No |
| Create generic finance account | Yes | No | No | No | No |
| Post generic balanced journal | Yes | No | No | No | No |
| Reverse posted journal | Yes | No | No | No | No |
| Edit/delete posted finance history | No | No | No | No | No |

The generic posting RPC is intentionally not an NGO money-movement API. NGO funding/reservation actions arrive in 2.17.1 as constrained business RPCs. Project Manager/Area Focal operational roles are not automatically financial roles.


- **NGO Admin:** may configure paid/volunteer project compensation defaults for own active projects, including basis/currency/rate/note; may manage recruitment and assignments under existing project/recruitment gates.
- **Project Manager:** may read project compensation defaults, create recruitment opportunities and send formal assignment offers, but cannot change project compensation defaults. The database derives contract compensation from the authoritative project/opportunity snapshot rather than trusting manager-supplied rate fields.
- **Area Focal Person:** receives no global compensation configuration, recruitment-rate or payable-management authority; existing geography-scoped monitoring/review remains unchanged.
- **Volunteer:** sees structured compensation on published opportunities and formal assignment offers; accepting an offer confirms the frozen assignment terms.
- **POEM survey manager/admin:** may configure compensation defaults where existing project-management authority permits and continues existing oversight.
- **Payables:** existing NGO Admin payable approval/payment rules remain unchanged. Project compensation configuration is not a funding balance and does not grant payment-provider or finance-ledger authority.
- Direct table/UI edits are not an authorization boundary. Guarded RPCs, immutable assignment triggers, RLS and existing payable uniqueness enforce the contract/payable chain.

# Previous permissions note — POEM 2.16.0

- **NGO Admin:** may read/update the approved-response target, required-volunteer capacity and manual recruitment gate for own active projects; may continue existing NGO-wide recruitment/assignment operations subject to the effective project gate.
- **Project Manager:** may read/update the project recruitment plan, manage project recruitment and assignments, and see project-wide target/capacity metrics. New recruitment/offers are server-blocked when target/capacity/manual state closes.
- **Area Focal Person:** may continue geography-scoped monitoring/review only; cannot read/update the global recruitment plan or gain project-wide recruitment/assignment authority.
- **Volunteer:** may discover/apply only while an opportunity remains published/open **and** the project effective recruitment gate is open. Existing assigned field work is not invalidated by target reach.
- **POEM survey manager/admin:** retains existing project/recruitment authority and is subject to the same project target/capacity gate for new recruitment activity.
- Direct project-plan mutation is not a frontend trust boundary; guarded RPCs plus triggers/RLS enforce the target/capacity rules.

# Previous permissions note — POEM 2.15.1

- **NGO Admin:** create/edit own-organization project drafts while `draft`/`changes_requested`, submit/resubmit them, read decision history and see the resulting operational project after approval.
- **POEM survey manager/admin:** review all submitted NGO project drafts, request changes, reject, or approve and atomically activate the existing operational project model.
- **Project Manager / Area Focal Person:** receive no project-draft authoring/submission/approval authority; their access begins from approved operational projects under the 2.14 project/area model.
- **Other NGO / ordinary member / volunteer:** cannot read or mutate another NGO's project drafts or review history.
- **Template boundary:** a project may use a POEM-owned template or an approved template owned by the same NGO; cross-NGO private template reuse is rejected server-side.
- Direct workflow-table writes remain denied; RLS protects reads and guarded RPCs own mutations.

# Previous permissions note — POEM 2.15.0

- **NGO Admin:** create/edit organization-owned template drafts while `draft`/`changes_requested`, submit/resubmit them, read review history and read own approved templates plus POEM-owned published templates.
- **POEM survey manager/admin:** retain direct POEM draft publication and can review all submitted NGO drafts, request changes, reject or approve+publish.
- **Project Manager / Area Focal Person:** no template authoring, submission or approval authority.
- **Other NGO / ordinary member / volunteer:** no access to another NGO's draft/review history or private NGO-approved templates.
- Direct table writes remain denied; workflow mutations use guarded RPCs and RLS remains the read boundary.

# Previous permissions note — POEM 2.14.2

## 2.14.2 project-scoped roles

| Capability | POEM Survey Manager | NGO Admin | Project Manager | Area Focal Person | Collector |
| --- | --- | --- | --- | --- | --- |
| Assign/revoke project staff | Yes | Own NGO project | No | No | No |
| Read project | Yes | Own NGO project | Assigned project | Assigned project | Assigned project |
| Whole-project operational review | Yes | Own NGO project | Yes | No | No |
| Review responses | Yes | Own NGO project | All project areas | Assigned area + descendants | Own response only |
| Change scoped survey assignment | Yes | Own NGO project | Yes | No | No |
| Publish templates / canonical administration | Yes where existing role permits | Existing rules only | No | No | No |
| Organization memberships / cross-NGO sharing / finance | Existing rules | Existing rules | No new access | No new access | No |

Project staff authority additionally requires an active account and active membership in the owning NGO. UI visibility is not an authorization boundary; RLS/RPC helpers enforce area scope.

- Sign-in exposes explicit Volunteer, Partner NGO and POEM Staff destinations while keeping one personal POEM credential set per person. Approved NGO representatives enter an active NGO workspace; otherwise Partner NGO sign-in routes to the onboarding application.
- The volunteer profile no longer exposes permanent “Allow profile access” controls. Current open recruitment uses application snapshots; live NGO profile reads are bounded to explicit invitation/assignment relationships.
- Direct survey assignment no longer requires a permanent profile-sharing grant; project authority, active/published volunteer state and project verification policy are still enforced.
- Active volunteers can browse published public recruitment without granting permanent NGO profile access.
- Applying requires an active/published volunteer profile plus application-scoped recruitment-profile consent.
- Invite-only recruitment remains limited to invited volunteers.
- Partner NGO admins/reviewers remain scoped to their authorized organization/project operations; POEM-only canonical and platform verification powers are unchanged.
- Independent volunteer identity verification tracks identity-relevant name data, not ordinary CV edits such as skills or availability.
- Canonical identity reconciliation is POEM-only and cannot clear review state while unresolved/stale match decisions remain.
- Volunteers can read their complete automatic POEM work history; POEM Volunteer Managers can inspect it for volunteer management. Other authorized profile readers see only POEM work backed by approved surveys or completed assignments.
- Automatic POEM work history exposes project/NGO/field/area and review counts, never beneficiary answers, private documents, payment values or supervisor feedback.
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

# POEM Phase 1.2 permission matrix

Permissions are enforced in PostgreSQL, not by hidden navigation alone. All public mutation RPCs verify the current `auth.uid()` and account status. Browser users have SELECT grants only on tables; all business changes use guarded functions.

| Action | Volunteer | NGO Admin | POEM Admin | POEM Super Admin |
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

POEM Admin and Super Admin are platform roles. NGO Admin is a membership of a specific organization; it never grants platform roles. All registered accounts also have a personal volunteer profile.

## Access revocation

- Account suspended: protected table reads and all application mutations are denied on future requests; only own account status remains readable for the suspension screen.
- NGO suspended/inactive: NGO-based access to shared volunteer profiles stops.
- NGO membership suspended: that user's NGO access stops.
- Profile grant revoked: that NGO's administrators lose future access to the profile.
- Volunteer profile suspended: NGOs cannot view it and the owner cannot edit it; POEM admins can review it.

These controls cannot erase information a viewer already saw or copied. Refresh/reload to discard previously rendered data. The original Phase 1.2 section did not include cross-NGO beneficiary sharing; current Phase 2.5 adds a separate controlled grant workflow. Fine-grained bulk export controls remain future work.

## First-admin bootstrap

Signup metadata is untrusted. The Auth trigger copies only a bounded display name and email; platform role is always the database default `volunteer`.

The local bootstrap script requires direct access to the project's named PostgreSQL Docker container. It only promotes a confirmed account when no active Super Admin exists, acquires a transaction lock, and appends an audit event. It is not exposed as an anonymous/public RPC.

## Profile publication workflow

Draft → Active (self-published after server validation).

Admin approval is not required for normal profile publication or later edits. The database keeps the historical `verified` value as the Active/marketplace-ready state so existing survey/workforce permissions remain compatible. Private-document reviews and NGO work-experience confirmations are independent from profile publication. Account/profile suspension still removes protected access.

## Phase 1.2 additions

| Action | Owner | NGO via profile share | POEM Admin / Super Admin |
| --- | --- | --- | --- |
| Read geographic hierarchy | Active account | Active account | Yes |
| Create/edit geography | No | No | Yes |
| Upload/remove own supporting files | Active account and allowed profile state | No additional rights | Own only |
| Read another user's document metadata/bytes | No | No | Yes |
| Review documents | No self-review | No | Other profiles only |
| Read/mark notifications | Own only | Own only | Own only |

Storage object writes are the exception to the public-table SELECT-only rule: Storage API INSERT/DELETE are authorized by RLS against reserved document metadata. There is no object UPDATE policy. Profile suspension blocks new uploads/finalization, while owner removal and reading remain available to an active account. Account suspension blocks all document access. Public URLs and NGO grants do not grant file access. Application download requests are audited, but direct authorized Storage reads require separate infrastructure logging.

## Phase 2.5 controlled beneficiary sharing

Cross-NGO beneficiary access now uses a separate grant workflow; it does not modify the existing project RLS on surveys, registry persons, needs or assistance rows.

| Action | Requesting NGO Admin | Source NGO Admin | POEM Survey Manager/Admin/Super Admin | Unrelated NGO |
| --- | --- | --- | --- | --- |
| Discover source NGO for own canonically-linked person | Yes | N/A | Canonical tools separately | No |
| Create purpose-bound request | Yes | No | No | No |
| Approve/reject source request | No | Yes | No | No |
| Final authorize/reject | No | No | Yes | No |
| Reduce requested/approved fields | Request selects initial fields | Yes | Yes | No |
| Read raw other-NGO survey/need/assistance tables | No | Own project only | Existing POEM scope | No |
| Read approved shared summary | Active grantee only | No | Use POEM canonical tools instead | No |
| Revoke active grant | No | Yes | Yes | No |
| Read visible request/grant event trail | Involved NGO | Involved NGO | Yes | No |

A grant is invalid if revoked, expired, either NGO becomes inactive, or the canonical identity/version/linkage changes. Revocation is prospective; information already viewed or copied cannot be recalled.

## Phase 2.7 workforce marketplace

| Action | Volunteer | NGO Admin | POEM Survey Manager/Admin |
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

| Action | Applicant | POEM NGO Manager/Admin | Other user |
| --- | --- | --- | --- |
| Create/read own NGO application | Yes | Review read | No |
| Edit draft / changes-requested application | Yes | No direct table mutation | No |
| Upload/remove own application evidence while editable | Yes | No | No |
| Download application evidence | Own | Yes | No |
| Review application document | No | Yes | No |
| Request changes / approve / reject | No | Yes | No |
| Activate organization / first NGO Admin membership | No | Approval RPC only | No |

Direct application/document table writes are not granted to authenticated clients; mutations use audited security-definer RPCs with owner/manager checks.
