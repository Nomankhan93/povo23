# POEM 2.12 — Workforce Payable Accounting

Baseline: 2.11.2 official branding. One forward migration:
`20260929000100_workforce_payables.sql`. All 20 prior migrations remain unchanged.

## Delivered workflow

1. Agree a paid assignment using Workforce marketplace. Original terms cannot be rewritten.
2. Optional future rate amendment: NGO Admin proposes rate/effective date/terms; the volunteer accepts before that UTC date starts. Accepted amendments affect future eligible work only. Cancellation/decline preserves the offer history. Compensation type and currency stay fixed.
3. Independently approved surveys automatically create pending payable units. Survey submission alone does not earn an approved payable. The same response cannot produce a second unit.
4. Daily assignments: the volunteer or NGO Admin claims a workday with an attendance evidence note. One claim per assignment/day. NGO financial approval confirms that claimed workday; this is not a GPS clock-in system.
5. Fixed assignments: complete the assignment using the existing workflow, then claim completion. One fixed unit. Work date is the UTC completion day capped at contract end, so delayed completion review does not require rewriting the contract.
6. Independent NGO Admin approves the unit. The recipient cannot approve/pay their own earnings, including when they also hold NGO Admin membership.
7. Record partial/full manual payments with date, unique bank/cash voucher reference and evidence note. Optional private PDF/JPEG/PNG receipt, maximum 5 MiB. Payment entry does not move money.
8. Disputes block payment. NGO resolves/rejects or records a signed adjustment with a reason. Adjustments cannot increase an existing unit beyond its original snapshot rate.
9. Payment reversal appends a full correcting entry. It does not refund a bank transaction. Previous entries and receipts remain in the history.

## Source eligibility and historical records

Survey rate is determined by the UTC date the server first created the response, within the accepted contract's work dates and before cancellation. Volunteer acceptance must precede that server creation timestamp; reviewer must differ from collector. Delayed offline uploads first received after the contract period are **not automatically payable**. POEM must resolve such exceptions operationally; this patch does not invent a trusted offline work date.

Survey review approval is not identity verification. This ledger uses independent survey review acceptance, not a beneficiary verification badge.

New approvals are automatic. For surveys approved before this migration, an authorized NGO Admin uses **Recover an earlier approved survey** with the response ID. Reconciliation is idempotent and checks contract eligibility; this release intentionally does not financially backfill every historic approval during migration.

Cancellation/completion of an assignment preserves earned work. If an approved survey returns to correction/rejection, its financial entitlement is offset with a journal adjustment. Existing payments remain, exposing any negative balance requiring reconciliation. Reapproval keeps the original unit/rate and requires financial approval again.

## Domain structure

- `src/features/payables/PayablesWorkspace.tsx`: contract/amendment views, claims, financial actions, statements, journals and private receipt workflow.
- `work_contract_amendments`: immutable proposed terms plus response lifecycle.
- `work_payable_units`: source identity and immutable rate/currency/terms snapshot; current eligibility/review status.
- `work_payable_events`: append-only accrual, adjustment, payment, reversal and dispute events.
- `work_payable_receipts`: private evidence metadata and immutable storage object references.

No Phase212.tsx file, no frontend rewrite, no payment provider, no new dependency. Existing POEM logos/theme are retained.

## Permissions

| Actor | Read | Write |
|---|---|---|
| Volunteer | Own assignment statements, journal, accepted payment receipts, amendments | Own day/fixed claims, disputes, accept/decline rate offers |
| Active NGO Admin | Own NGO assignment accounting | Claims, rate proposals/cancellation, approvals, adjustments, manual payments and reversals for other recipients |
| NGO Admin receiving payment | Own accounting | Claims/disputes and own amendment response; no self-approval/payment |
| POEM staff without NGO membership | No automatic financial-ledger access | None |
| Other NGO / anonymous | None | None |

Existing authorized audit readers retain audit-log access. Suspending NGO membership blocks that organization's finance operations; volunteers keep access to their own history while their own account remains active. Active organization is required for new claims and NGO operations.

## Correctness and recovery

- PostgreSQL numeric performs all amount arithmetic; summaries are decimal strings, separated per assignment/currency.
- Unit row locks plus expected versions serialize accounting actions; a stale action is rejected.
- UUID request IDs return the same accounting event after a lost acknowledgement; reusing an ID with different details is rejected. UI retains the command for exact retry while the workspace stays open.
- After browser reload, inspect the journal before retrying manually. The financial queue is not persisted offline; this is an online accounting workflow.
- Payment references are unique per assignment, case-insensitively, including reversed entries. A corrected replacement needs a distinct correction/voucher reference and explanatory reason.
- Partial payments cannot exceed approved outstanding balance. Disputed/voided units cannot receive new payments.
- Composite foreign keys enforce event/unit/receipt assignment consistency. Authenticated users cannot directly write financial tables. Journal update/delete and snapshot mutation are blocked by database triggers.
- Per-assignment summaries include all units; lists/journals use 50-row pages. Amendment history currently shows the latest 100 entries. No cross-currency grand total or export is provided.

## Receipt controls and limits

Storage bucket is private, accepts PDF/JPEG/PNG up to 5 MiB, and disallows client overwrite/delete. Attachments must have matching assignment, uploader, MIME and byte-count metadata and an actual uploaded object. Other volunteers cannot see unattached receipts. Payment recipient can access receipts linked to their journal. UI download authorization writes an audit event and produces a 60-second signed download link.

Signed links remain valid until expiry. Direct authorized Storage requests are controlled by RLS but do not create the UI's download-intent audit event. Existing project does not include server-side malware scanning; the patch does not claim otherwise. Abandoned receipt reservations/objects need an administrator retention process; automatic orphan cleanup is not included.

## Remaining operational acceptance

Real Supabase Storage uploads, Auth/RLS integration, multi-session concurrency, browser keyboard/mobile rendering and existing offline field checks must be exercised locally before rollout. Accounting does not include payroll tax, deductions, payment gateways, bank reconciliation, partial cash-refund handling, expense reimbursements, arbitrary bonuses or attendance-device integrations.
