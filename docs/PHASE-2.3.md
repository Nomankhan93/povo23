# Phase 2.3 — Needs Assessment & Assistance Follow-up

## Included workflows

A need is a human-reviewed assessment linked to an approved survey and a project-scoped person record. It is distinct from person circumstances, survey approval and delivered assistance.

- Record a food, education, health, housing, livelihood or other need with a description, priority, assessment reason and optional follow-up date.
- Preserve the approved source response ID/version, identity snapshot, author and creation time. The source, category and person are fixed; corrections to description, priority, status and follow-up require a reason and current version. For a wrong category/source/person, close the incorrect assessment with a reason and create a replacement.
- Link recorded assistance for that same person and project. Link removal and reactivation retain history. No automatic money allocation occurs.
- Review outcomes and schedule follow-up. Each need revision and link revision is retained.
- View project/person counts and filter the paged needs list by category, status and overdue follow-up.

## Where to find it

**Survey projects → Open project → Project needs overview** shows reviewer-only counts and a follow-up queue. Open a need to review its outcome, links and provenance.

**Project registry → Review identity / assistance → Needs and follow-up → Record assessed need** creates an assessment. Select an approved response from the latest 50. The existing assistance timeline remains in the same person panel.

## State rules

| State | Meaning |
| --- | --- |
| Open | Assessed need awaiting action |
| In progress | Work underway; first assistance link moves an open need here |
| Met | Reviewer confirms the outcome with a reason and recorded linked assistance |
| Needs review | A human review is required, including after linked assistance is voided |
| Closed | Follow-up ended for the documented reason; never counted as met |

Recorded assistance alone never marks a need met. Marking met requires at least one active link to recorded assistance and no active links to voided assistance. Remove voided links, review remaining evidence, then confirm the appropriate outcome.

Voiding assistance marks all linked non-closed needs as needs review, with new revisions and audit events. Closed needs remain closed. Removing a link from a met need also marks it needs review. Reopen closed needs before changing their links.

Any authorized reviewer can revise a status with a reason, including reopen met/closed needs. Reviewers are responsible for whether the supplied evidence establishes the outcome; the presence of a receipt is not independent proof of impact. There is no second-approver requirement.

## Permissions and scope

This increment reuses Phase 2.1 review permissions: active POEM Super Admin/Admin/Survey Manager across pilot projects, and active NGO Admins within their NGO. Collectors without reviewer rights cannot read or mutate needs, links, histories or summary RPCs. Other staff roles and unrelated NGOs have no access.

New assessments require an active NGO and an approved source survey. Closing survey collection does not end assistance or needs follow-up. POEM reviewers can still review existing records of a suspended NGO, but cannot create a new assessment for it. Account and NGO membership revocation take effect on subsequent requests; data already displayed is not remotely removed.

## Reporting definitions

Counts cover all recorded needs in the selected project or person, independent of list filters. A person count means distinct project registry records with an assessment; same-person flags do not combine records.

Pending means open, in progress or needs review. Overdue means a pending need with a follow-up date strictly earlier than the server's current UTC date. Today is not overdue. The UI uses the server date from the summary. Refresh after UTC rollover to update an already-open page.

Met and closed are separate counts. High-priority pending excludes met/closed. Counts are not a population estimate, verified unmet-needs census or deduplicated cross-NGO impact report.

## Reliability and limits

Need creation uses a request UUID. Retrying the unchanged mounted form returns the existing need without resetting later reviews or duplicating its audit event. After refresh/navigation, inspect the list before creating another assessment. Different request IDs may create similar needs; no automatic deduplication is performed.

Updates and link changes use version checks. SQL locks assistance entries before needs to serialize edits with delivery voids. The embedded test harness does not simulate production concurrent sessions; deadlock/latency testing remains a local or staging task.

Needs, assistance selectors and relationship lists use 50-record pages. The creation selector shows the latest 50 approved responses per person. Identity/assessment and link history views show the latest 50 revisions; older revisions remain stored.

A delivery can support multiple needs. No monetary allocation, percentage attribution or financial totals are computed from links, avoiding double-counted assistance claims. No automatic duplicate-assistance block is added.

No AI needs inference, automatic eligibility, household-level needs, cross-project registry sharing, reminders, exports, offline support, donor reporting or new payment functionality is included. Follow-up dates power a queue; they do not send notifications. Previous consent, access-auditing, retention and identity-verification limits remain.

## Manual acceptance checklist

1. Upgrade a Phase 2.2 database containing approved surveys and recorded assistance. Confirm old responses, delivery values and identity histories remain available; no needs are inferred during upgrade.
2. As an NGO Admin, open a person and create a high-priority need from an approved response, with yesterday's follow-up date. Verify it is open, overdue and counted once.
3. Retry an uncertain creation with the unchanged form. Confirm a single assessment. After refreshing, inspect the list before creating another.
4. Link a recorded delivery for this person. Confirm the need becomes in progress, not met. Try another person's delivery through the API; expect denial.
5. Review the outcome with a reason and mark met. Confirm it is no longer pending/overdue. Inspect assessment and link histories.
6. Void its linked delivery in the assistance timeline. Refresh the need and verify needs review and a new revision. Attempt met with the voided link; expect denial. Remove the link and attach appropriate recorded assistance before re-review.
7. Remove a link from a met need and confirm it returns to needs review. Close a need and confirm it is counted separately from met. Reopen it before changing links.
8. Open two tabs, change the need in one, then save stale values in the other. Expect a reload error. Test linkage and void operations from separate sessions in staging.
9. Verify a collector, unrelated NGO and suspended account cannot read needs, their histories or summaries.
10. Compare project/person counts, category/status filters, due-today versus overdue dates, 50-row paging, mobile layout and keyboard navigation. Changing an assistance entry while a need is open should refresh the local panel; changes from another browser require a reload.

Browser/mobile, actual Docker/Auth HTTP and concurrent-session checks were not executed in the build environment.
