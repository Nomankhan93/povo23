# FieldLance 2.41.6 - Transaction & Workflow Reliability

Scope: F02 funding retries, F04 template/project authoring protection, F05 recruitment exact reads and pagination. F03 payout verification and F14 offline browser reliability remain outside this patch. Overall product release remains HOLD.

## F02: one identity per funding operation

Previously each record/reserve/release submission generated another UUID and reset its form even when the shared action wrapper caught a failure. A lost response could therefore lead to a second logical ledger operation.

The funding workspace now retains a normalized request and its key before sending. Unknown outcomes keep that snapshot and block replacement submissions; Retry same request explicitly reconciles or resends it. Account-scoped session storage preserves the pending identity across SPA navigation and reload within the tab. Definitive initial SQL rejection preserves entered form values; only confirmed success resets the form. Duplicate clicks are blocked synchronously.

An uncertain retry first reads finance_journals through the signed-in user's existing SELECT/RLS authorization, filtered by key, organization and creator, checking journal type. This matters because reserve/release validate current balances before the backend's existing idempotency lookup: a committed reservation can consume the available balance and cause a direct replay to reject. A later rejection never disproves an earlier uncertain commit.

No ledger RPC, journal immutability rule, financial grant or accounting assertion changes. No migration. Pending recovery is tab/session scoped, not durable after closing the browser session or clearing storage; do not manufacture a replacement operation if an outcome is still unknown. Restored pending requests show their retained amount/note and explicit retry, rather than pretending to reconstruct every uncontrolled form input.

## F04: one shared authoring decision

Template and project editors compare their editable snapshots with their saved/opened baseline. Reverting an edit clears dirty state. Preview/UI-only changes do not set it. Save updates the baseline only after success.

AppShell uses the shared decision for navigation, workspace switching, notification targets, project entry, sign-out and the Offline field entry. Opening another draft is guarded in both editors. Stay preserves values; Discard permits the requested transition. The existing ActionDialog is wrapped in a native modal with explicit keyboard focus wrapping and Escape cancellation. Mobile navigation closes before the dialog opens.

Indexed application history restores the current entry while asking, preserving Back/Forward destinations on Stay. Existing field-draft flush failures still restore the current route. The shared beforeunload hook protects real tab/reload exits; no autosave is introduced and the F14 harness is unchanged.

## F05: routed entities independent of collection windows

Application/assignment route IDs resolve through exact RLS-authorized reads, independently of collection pages. Related project/opportunity context is also loaded exactly, allowing an old selected application's offer form to open even when its project is absent from the preview.

Collections fetch 50 rows plus one lookahead, ordered by created_at and UUID, then use a keyset cursor. Status filters run server-side. Load more appends distinct rows without fetching all history. Loaded counts are identified as such, and loading/error states do not claim an empty collection.

Focused records are pinned once, focused/scrolled after resolution, and show their current actionable/completed state. Missing and RLS-hidden records share an unavailable state to avoid disclosing existence. Exact-read failures and page failures have separate retries. Survey-access legacy classification uses accepted contract presence independently of the currently loaded assignment page.

The 2.41.5 formal offer/acceptance, project/contract dates, geography, moderation, capacity, case eligibility, isolation and least-privilege rules remain authoritative.
