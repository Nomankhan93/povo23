# Current permissions note — POEM 2.12.6

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

> Current stabilization release: [2.3.1](STABILIZATION-2.3.1.md). For current validation and remaining limits, see [validation](VALIDATION-2.3.1.md). Older phase-specific statements below are historical; NGO Managers no longer assign memberships.

> Phase 2.3: [Needs Assessment & Assistance Follow-up](PHASE-2.3.md) adds approved-survey assessments, assistance links and a follow-up queue. See [upgrade instructions](UPGRADE-2.3.md). Earlier sections describe their original release scope.

> Phase 2.2: [Registry Review & Assistance Ledger](PHASE-2.2.md) adds identity corrections, project-scoped match decisions and recorded deliveries. See [upgrade instructions](UPGRADE-2.2.md). Earlier-phase sections retain their historical scope.

> Phase 2.1 update: see [Survey & Registry Pilot](PHASE-2.1.md) for the current survey model, permissions and acceptance checks, and [upgrade instructions](UPGRADE-2.1.md) for existing installations. Earlier-phase sections below describe their original scope.

Current Phase 1.4: see [experience/invitation workflow and permissions](PHASE-1.4.md) and [upgrade instructions](UPGRADE-1.4.md).

Current release: [Phase 1.3 staff permission matrix](PHASE-1.3.md). Legacy roles below retain their prior permissions; Volunteer Manager now also reviews documents, NGO Manager manages geography/NGOs and Auditor reads audit events.

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
