# FieldLance 2.41.9 — Mobile Field UX Stabilization

Baseline: production 2.41.8, main 7780d95. Development branch: codex/fieldlance-2.41.9-mobile-field-ux.

| Area | Root cause / before | After |
| --- | --- | --- |
| Lifecycle | Marketplace progress used the current page instead of real recruitment state | Existing linked offered/active/completed assignments supersede application status; current stage is exposed accessibly |
| Application link | Generic Open link opened the application, even when its card displayed an active assignment | View application details identifies its distinct destination; Open field work remains the primary continuation |
| Opportunities | Lifecycle, four metrics and full filters preceded records | Compact context/count and Filters control precede records; secondary summaries follow |
| Filters | Tall inline form consumed the mobile viewport | Native modal with all existing controls, active count, Apply, Clear and Close; desktop stays inline; query semantics unchanged |
| Home | Marketing, readiness and metrics preceded the next action | Mobile priority appears first; offers/active work precede profile completion; active work directly opens its guarded project |
| Updates | Intro and three large counters preceded notifications | Compact unread count, category tabs and actual records precede secondary controls |
| Tasks | Personal task empty state used internal operations language | Personal task-oriented copy; technical explanation retained for operational roles; failure is not described as caught up |
| Header | Full sync phrases competed with notification/title width | Compact visible state with full accessible label; offline, pending and attention remain visible |
| Footer | Repeated branding and space before bottom navigation | Nonessential authenticated mobile footer hidden; safe-area/action padding retained |
| Survey | Long single form and narrow nested controls | Responsive logical sections, Previous/Next, section progress, readable controls and validation focus; desktop retains full form |

## Survey presentation architecture

Question type/schema and template authoring contain no section/group metadata. No new template property, field ID convention or Health-specific mapping was introduced. A small generic frontend helper groups existing ordered questions in batches of four, between Consent / Person & household and Review & submit. Conditional visibility still uses visibleAnswers/isVisible. Empty conditional groups are skipped.

All visible section content remains mounted; CSS/hidden presentation switches sections without clearing answers, capture component state or encryption metadata. React form state and existing encrypted draft storage persist across movement and reload. Save draft remains available in each section. The existing reviewed flag resets when answers change, and submission retains its original RPC/payload semantics.

Native validity is explicitly checked before save because hidden section controls cannot be focused by the browser automatically. Invalid controls/structured capture errors reveal and focus their section. Required-on-submit questions remain optional for drafts, while consent and existing native identity constraints still apply.

Representative disclosure uses the existing backend age rule, including unknown ages and household members. Optional adult representative inputs remain available and retain values. Server validation is unchanged.

## Boundaries

No branding/navigation redesign, database migration, hosted operation, offline architecture change, new application enum or authorization relaxation. Earlier audit organization pagination/retry and report drill-down are deferred. Physical mobile-browser verification is a later post-deployment check; no Android app testing is introduced.
