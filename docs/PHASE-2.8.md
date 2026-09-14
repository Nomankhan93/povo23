# POEM 2.8 — Canonical registry operator workbench

Baseline: POEM 2.7.6. Package version: 2.8.0.

POEM Super Admin, Admin and Survey Manager now have **Canonical registry** in the sidebar. NGO roles, collectors and volunteers do not receive access. Self-service profile publication is unchanged.

## Operator workflow

1. Search by canonical display name, canonical UUID or beneficiary number, including the displayed `POEM-BEN-00000001` format. Choose current identities, review required, merged records or all identities. Results use 25-row keyset pagination.
2. Open an identity. Inspect its current display identity and version, source records with NGO/project/household references and link provenance. A merged record links to its surviving identity.
3. On a source record, choose **Review matches for this source**. Suggested candidates use existing explainable signals, prior decisions and current links. The candidate list is explicitly capped at 100. A known source UUID from another project can also be compared.
4. Load a side-by-side comparison. Review both source revisions, canonical identities and previous decision. For separate identities, the preview counts source records that would move, active grants and pending requests that would be invalidated. Counts describe the preview instant; concurrent new sharing requests may change these counts before submission. Merge always invalidates the affected current approvals.
5. Choose **Needs review**, **Different people**, or **Same person**. Provide evidence/reason and acknowledge the impact. The server rechecks role, source versions, canonical IDs/versions and decision version. A stale preview must be reopened; the UI does not automatically retry the decision.
6. **Merges** shows active/reverted events, actor, time, reason, moved-record count and both identity links. Reversal requires a reason and acknowledgment, uses current version tokens and respects later-merge dependencies.
7. If display identity needs review, inspect sources and resolve disputed merges before selecting **Use this source as authoritative display identity**. This updates the master display fields and preserves revisions; it does not independently verify documents or settle disputed relationships.
8. **History**, **Match history** and **Assistance** provide paginated inspection of canonical snapshots, decision snapshots and assistance from currently linked project records.

Project discovery policy remains in Data sharing. The earlier small canonical correction panel has moved into this workbench, avoiding two competing correction interfaces.

## Architecture and data access

New frontend domain folder: `src/features/registry/canonical/`:

- `CanonicalWorkbench.tsx`: search, filters and identity selection.
- `CanonicalDetail.tsx`: source records, history, assistance and reversal.
- `MatchReview.tsx`: candidate review, comparison and decision submission.
- `model.ts`: shared UI result types.
- `canonical.css`: scoped responsive layout.

The workbench is lazy-loaded. No new `PhaseXX.tsx` module, framework migration or whole-app rewrite is introduced.

One additive migration, `20260925000100_canonical_workbench.sql`, introduces four RPCs:

| RPC | Purpose |
| --- | --- |
| `search_canonical_registry` | Bounded identity search with a beneficiary-number cursor. |
| `canonical_workbench_detail` | Paginated source/history/merge/assistance/decision inspection. |
| `preview_canonical_review` | Compare two project source records and summarize merge impact. |
| `apply_canonical_review` | Validate preview versions under the canonical maintenance lock, then call the existing reviewed-match workflow. |

All four check POEM survey-management permission, use an empty search path and audit successful reads/previews or decisions. NGO raw-table RLS is unchanged. Prior 16 migrations are unchanged; no source, assistance or history rows are deleted.

Detail sections use deterministic ordering with offset pagination. Concurrent changes can shift detail-page boundaries; reload after a change. Name search uses literal substring matching, not probabilistic identity confidence. A canonical match is not identity-document verification.

The workbench is an operator tool, not a public beneficiary directory or an export facility. Standalone identity-verification evidence, bulk operations, advanced fuzzy matching, cross-device conflict tooling, complete large-dataset optimization and a dedicated source-survey/document evidence viewer are not part of this release. Source/project identifiers are provided for tracing records through existing survey operations.
