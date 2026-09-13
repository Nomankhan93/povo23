# POEM 2.7.6 — Correctness and recovery stabilization

Baseline: the uploaded 2.7.5 project. This is an additive stabilization patch, not a frontend rewrite. Self-service profile publishing remains available. The legacy profile status `verified` continues to mean active/published in that workflow; it is not independent identity verification.

## Delivered behavior

| Area | Change |
| --- | --- |
| Offline encryption | Atomic first-writer-wins key creation across tabs; existing AES-GCM keys and encrypted records retained. |
| Queue identity | Concurrent enqueue cannot overwrite an existing request's payload. A slower queue update cannot resurrect an acknowledged/deleted entry. |
| Recovery | Owner-scoped per-item answer preview, exact original retry, confirmed-rejection recovery, explicit per-item discard. Existing drafts cannot be overwritten by recovery. |
| Recovery durability | Recovery draft and recovered marker commit together. The failed copy stays available for inspection/discard; its old request cannot be retried after recovery. |
| Uncertain saves | Keep original request UUID and payload. No new request is created solely because a network response was lost. Background RPC timeout is 20 seconds. |
| Corrupt copies | Decryption failure moves to attention and retains the ciphertext. Missing/overwritten old keys cannot be reconstructed by this patch. |
| UI callbacks | A failed close/refresh callback after a durable or acknowledged save cannot issue a second request from the same form. |
| Canonical merge | Repeat same-person review preserves the merge event. Source versions checked with locks; nullable stale-version bypass closed. A merge no longer automatically promotes identity status to confirmed. |
| Unmerge | Reconciles all separated same-person decisions, including legacy missing event pointers; preserves revisions and merge history. |
| Source correction | Name/DOB changes preserve the existing master identity, mark review required, bump canonical version and invalidate sharing approvals. POEM explicitly selects a reviewed source for reconciliation. |
| Sharing | Canonical changes revoke active grants and pending approval requests. A fresh request can proceed after review and still requires both approvals. |
| Discovery | Disabled by default per project. POEM can enable source NGO name discovery for already linked beneficiaries. Assistance/needs existence flags are removed. Lookups are audited. |
| Foreign identity probes | The unused name/DOB foreign-count RPC is restricted to POEM survey management. |
| Terminology | Workforce uses active volunteers/profile location; actual verified experience and reviewed survey metrics retain their meaning. |
| Forms | Sharing request reset captures the form before awaiting submission. Expired/revoked grants show appropriate labels and revocation reasons. |

## Database and governance

One forward migration: `20260924000100_correctness_recovery.sql`. All 15 previous migrations remain unchanged. No tables or source records are dropped. Existing RLS and role guards remain in effect.

Two additive fields: `canonical_persons.review_required`, `survey_projects.sharing_discoverable`. New public RPCs are POEM survey-management only: `reconcile_canonical_identity` and `set_project_sharing_discovery`.

The migration repairs historical same-person decisions whose links are already separated and flags historical source corrections conservatively (changed source revision with a differing name/DOB). It revokes already stale version grants. Migration-created history explicitly identifies migration activity; original actor references are retained where no interactive actor exists. Pending requests invalidated by future canonical changes remain visible as revoked, with an explanatory note.

Project discovery controls **new requests and discovery**, not existing grants. To end an existing grant independently, use its Revoke control. Enabling discovery is a policy decision: another NGO with a linked beneficiary can learn the source NGO name, but cannot see needs/assistance facts before authorization.

POEM maintenance controls are in Data sharing. The compact correction queue lists up to 100 identities and 500 projects; it is not the full canonical matching/merge workbench. Review all relevant source records before selecting an authoritative source. Resolve disputed links through the existing merge/unmerge RPC workflow before reconciling display identity.

## Offline recovery workflow

1. Open Field sync and inspect the failed survey's project, response reference, error and saved answers.
2. For a temporary issue or unknown older failure, choose Retry original request. The original UUID is retained.
3. For a confirmed rejection, choose Recover for editing. If another draft exists, review it first. Recovery never overwrites it.
4. Close any already-open survey form; reopen the indicated project and existing response, or Start survey for a new response. The recovery draft restores automatically.
5. Compare recovered answers with the current server record, correct and save. Recovery does not overwrite the server automatically.
6. Explicitly discard the retained failed copy after verifying the corrected save. Old-request retry is disabled once a recovery draft has been created.

Device storage is browser/origin-specific. Do not clear browser data or switch origin while unsynced work remains. Encryption protects persisted payloads, but does not make an unlocked browser session a secure multi-user boundary. The recovery UI checks the signed-in owner. Full offline cold start, attachments and multi-device synchronization are outside this release.
