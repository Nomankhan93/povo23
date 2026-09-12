> Phase 2.3: [Needs Assessment & Assistance Follow-up](PHASE-2.3.md) adds approved-survey assessments, assistance links and a follow-up queue. See [upgrade instructions](UPGRADE-2.3.md). Earlier sections describe their original release scope.

# Phase 2.2 — Registry Review & Assistance Ledger

This increment builds on the online Phase 2.1 pilot. Records and decisions remain project-scoped.

## Workflows and screens

Open **Survey projects → Open project → Project registry → Review identity / assistance** as an authorized reviewer.

- Correct a person's name, birth date or household within the same project. A reason and current version are required. Every revision retains the previous values. Identity remains provisional.
- Inspect possible identity matches and the signals behind them. Record **Same person — flag only**, **Different people** or **Needs review**, with evidence/reason. Decisions can be revised; old decisions remain in history. Correcting either identity makes an earlier decision stale until reviewed again.
- Record delivered cash (PKR), goods or services for a person with at least one approved survey. Store program, category, description, delivery date, funding source, evidence reference and optional next eligibility date.
- Read the assistance timeline and void incorrect entries with a reason. Original delivery details remain immutable; create a replacement entry if needed.

No new platform role is added. Existing review access controls these operations:

| Actor | Identity corrections / matching | Assistance |
| --- | --- | --- |
| POEM Super Admin, Admin, Survey Manager | All pilot projects | All pilot projects; active NGO required for recording |
| Active NGO Admin | Own active NGO's projects | Own active NGO's projects |
| Assigned collector without reviewer rights | Own linked current identity and response snapshots only | No access |
| Other staff, unrelated NGOs, anonymous users | No access | No access |

Closed survey projects remain reviewable and may receive subsequent assistance records. Account/NGO membership suspension removes NGO access on the next request. Reviewer access is inherited from Phase 2.1; separate registry/finance roles and dual approval are not yet implemented.

## Matching rules

Candidates must be different person records in the same project and satisfy at least one rule:

1. Same name after lowercasing and removing punctuation/whitespace.
2. Same known birth date AND same household.
3. An existing decision links the pair (retained even when identities later change).

Signals are displayed separately. Names, birth dates and households are not proof of identity. A shared household alone never creates a candidate. No artificial probability or automatic merge is used. Matching does not yet collect/use CNIC, B-Form, guardian CNIC or phone; it does not perform transliteration, fuzzy-name matching or cross-project lookup. Same-person flags do not unify registry IDs or assistance totals.

Candidate UI shows 50 records and signals when more exist. This is a bounded pilot view, not an exhaustive matching queue. Household selection searches the first 50 matches; refine the label search as necessary. Assistance has 50-entry pages; identity and decision histories show the latest 50 revisions (older history remains in the database).

## Provenance and upgrade behavior

Every new person has an initial identity revision. Existing people receive an explicitly labeled Phase 2.2 upgrade baseline with a null actor: earlier collection-time identity history cannot be reconstructed.

New survey saves capture identity into the response and its revision. Identity corrections do not rewrite these snapshots. Existing response rows receive labeled upgrade-baseline snapshots; existing response revisions, versions, answers and consent stay unchanged. The migration temporarily disables only the response-revision trigger during this backfill, then re-enables it.

Assistance snapshots identify the person when the delivery was **recorded**, which may be later than the actual delivery date. They are not proof of distribution. References point to externally maintained receipts/registers; no beneficiary evidence upload, cash transfer, payment gateway or independent assistance confirmation is included.

Corrections require human evidence review. If a correction changes age, household or the appropriate consent representative, obtain any required fresh consent before collecting further information; correcting a record does not obtain consent retroactively.

## Assistance accounting boundaries

Cash is recorded in PKR with up to two decimals. Goods/services require a positive quantity and unit with up to three decimals; they have no cash value in this release. Future delivery dates are rejected. Next eligibility cannot precede delivery, but is recorded guidance, not an automated restriction.

Entries are recorded deliveries, not payable approvals. At least one approved survey is required, but survey approval is not identity verification or needs eligibility certification. Reviewers can record and void their own entries; separation of duties is a later workflow. Duplicate assistance is not automatically blocked. Inspect the timeline and matching records before distribution.

A client-generated request ID makes an unchanged assistance retry return the existing entry without adding another audit event. This protection lasts while the form remains mounted. After an uncertain save, retry the unchanged form. After refresh, closing the form or leaving the project, inspect the timeline before creating a new entry. An already voided entry cannot be revived by retrying its request.

Identity, match and assistance mutations are audited; detailed values are in access-controlled histories. This does not add comprehensive logging of every database SELECT, file view or export. The existing consent and retention limitations remain. No cross-NGO beneficiary sharing or exports are added.

## Manual acceptance checklist

1. Upgrade an existing Phase 2.1 database and verify previous responses, consent, IDs and review status. Check the labeled upgrade baseline and unchanged old revisions.
2. As NGO Admin, open a person with an approved survey. Correct a spelling mistake with a reason. Confirm history shows both versions and the old response snapshot remains unchanged.
3. Open the same person in two browser tabs. Correct in one, then save stale values in the other; expect a reload error.
4. Create a second same-name person in that project and inspect matching signals. Mark same person, then different people; inspect decision history. Correct one identity and confirm a stale-decision warning.
5. Verify siblings with different names/birth dates sharing a household are not automatically candidates. Confirm a same-name person in another NGO/project is not exposed.
6. Record PKR 15,000 school fees with a receipt reference; record goods and a service with quantities. Refresh and inspect the timeline, author and identity snapshots.
7. Retry the same assistance request during a controlled connection-error test; verify a single entry. Inspect the timeline before repeating after a page refresh.
8. Void an incorrect entry. Confirm original values and void actor/reason remain; it cannot be voided again or edited.
9. Try unauthorized access as collector, unrelated NGO Admin and suspended account. Verify new management panels are unavailable or denied and data does not leak.
10. Use a narrow mobile viewport and keyboard navigation. Check household search, open/close controls, long notes, errors, disabled submit controls and timeline paging.

Browser and real Docker/Auth HTTP checks must be run locally; they were not executed in the build environment.
