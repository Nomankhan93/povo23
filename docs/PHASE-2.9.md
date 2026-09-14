# POEM 2.9 — NGO/project governance and independent verification

Baseline: POEM 2.8.0. This release adds independent evidence-review cases and opt-in, versioned project collection policies. It preserves self-service profile publication, NGO isolation, existing survey review and canonical matching.

## Independent verification

The new **Verification** workspace covers three distinct scopes:

| Scope | Who can request | Who can review |
| --- | --- | --- |
| NGO registration | Own NGO Admin or POEM NGO management | POEM NGO Manager, Admin or Super Admin |
| Volunteer identity | Profile owner or POEM volunteer management | POEM Volunteer Manager, Admin or Super Admin |
| Beneficiary identity | POEM survey management | POEM Survey Manager, Admin or Super Admin |

A reviewer cannot approve or reject a case they requested, verify themselves, or review an NGO where they hold an active membership. Use a second appropriately authorized reviewer. Revocation can be performed by an authorized manager; the requester can withdraw a pending case.

Each case records its subject snapshot, private evidence reference, request note, requester, reviewer, review method, expiry, version and event history. Accepted methods are document review, issuer/registry check and in-person check. Approval requires an expiry within 366 days, a completed volunteer name or NGO registration number as applicable, and a current subject snapshot. Beneficiary identity must first have its canonical review resolved.

This is a human evidence-attestation workflow. It does not automatically validate a government identifier, check an issuer database, scan files, or certify an organization. Reference existing private documents or controlled offline evidence; the reviewer inspects evidence through an authorized channel. The release adds no public evidence links or document-export permission.

Stored states are pending, verified, rejected, withdrawn and revoked. Effective status also includes:

- **Stale:** subject snapshot changed. A new case is required.
- **Expired:** expiry passed; evaluated at access time, without a scheduler.
- **Unavailable:** the account/profile/NGO is not operationally available or canonical review is unresolved.

Volunteer verification conservatively covers the full profile snapshot and its revision; profile edits or republication can therefore make verification stale. NGO name/registration edits advance a dedicated revision so reverting an edit does not restore old verification. Canonical changes use the existing canonical revision. Never use the stored `status='verified'` alone as a current verification assertion; use the effective-status workflow.

No automatic approval is imported from legacy profile status, NGO operational status, survey approval, experience verification or a canonical merge. The legacy volunteer `verified` profile value continues to mean published/active in existing profile workflows.

## Project governance

The **Project governance** workspace lists accessible projects. POEM survey management can publish policies; project-authorized NGO staff and collectors can inspect them. Published revisions are append-only through application RPCs and include:

- Retention review period, from 1 to 3,650 days.
- Source discovery: none or NGO name with request required.
- Require current independent NGO registration verification for collection.
- Require current independent volunteer identity verification for collection.
- Collection paused/enabled.
- Snapshot of the existing collection purpose, consent version and consent notice.
- Publication reason, actor and time.

Existing and newly created projects remain explicitly labeled **legacy policy** until POEM publishes their first governance revision. They retain existing collection rules. Configure governance before a rollout that requires these gates; this migration does not silently impose new verification requirements on ongoing projects.

After a policy is published, collection gates apply server-side to new saves. They do not replace existing assignment/date/NGO/account checks. A field payload must carry the currently displayed governance version. A policy change rejects unsent work carrying an older version, so the surveyor can use the existing per-item recovery workflow, review the policy and obtain consent again. Restoring an older device draft clears its consent agreement when the policy differs.

Already acknowledged requests retain receipt-based replay behavior, including while collection is paused. An idempotent retry does not stamp a new policy onto a historical response. New/updated responses capture the policy version before response-history snapshots are written; historical responses remain null rather than receiving invented policy provenance.

The existing source-discovery control creates a policy revision on governed projects. Changing discovery controls new discovery/requests; it does not independently revoke existing sharing grants. Revoke existing grants separately where required.

Retention is a documented review schedule, not automatic deletion. No data exporter, retention-purge job, payment workflow or new legal consent wording is introduced. Purpose and consent wording remain the existing project values and are snapshotted, not editable through this policy form.

## Implementation

New domains: `src/features/verification/` and `src/features/governance/`, both lazy-loaded. Survey-form/device-draft integration carries policy provenance. No development-history frontend module or framework rewrite is introduced.

One forward migration: `20260926000100_governance_verification.sql`. All 17 previous migrations are unchanged. New tables: `independent_verifications`, `independent_verification_events`, `project_policy_versions`, each with RLS. Added project/response governance metadata and an NGO verification revision. No existing records are deleted and no verification is backfilled as approved.

UI limits: verification cases and project lists paginate by 25; subject lookup returns up to 25 searchable authorized results; case history shows latest 50 events and policy history latest 25 revisions. Full historical rows remain in the database. Broad exports, a dedicated verification document viewer, larger-history UI pagination and production-scale indexing/load testing are later work.
