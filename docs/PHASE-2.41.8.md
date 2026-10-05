# FieldLance 2.41.8 — Recruitment & Role Dashboard Workflow Stabilization

Scope: frontend audit F01–F10 and the reproduced Android Attendance responsive defect. F11–F14 and unrelated redesign are excluded.

| Finding | Root cause | Implemented correction |
| --- | --- | --- |
| F01 | Apply form rendered below the entire marketplace grid without focus | Native modal dialog opens in the viewport, focuses the note, retains failed submissions and restores trigger focus |
| F02 | Staff submitted-survey CTA opened identity verification | Dedicated RLS-backed survey review queue opens the existing exact project response review; project workspace render guard recognizes its routed context |
| F03 | Latest 100 assignments were treated as complete dashboard counts | Exact status counts and separate latest status queries keep older offers actionable; failures remain unknown rather than zero |
| F04 | Older marketplace requests could replace newer results | Debounced requests invalidate stale completions, with dedicated loading/error/retry state |
| F05 | Selected application enum was interpreted without its assignment | Existing source_application_id relationships determine offer/active/completed display and actions independently of visible assignment pages |
| F06 | Application-source candidate offer button had no rendered form | Hydrate the exact application/opportunity and render the existing formal-offer form for this source |
| F07 | Invitations page label claimed to include formal offers | Direct invitations and Offers & assignments now identify their distinct workflows |
| F08 | Assignment link navigated to its own already-open assignment | Open field work routes directly to the correct project, preserving can_collect_project and all existing collection guards |
| F09 | View applicants discarded opportunity context | Opportunity-specific URL/filter survives refresh and can be explicitly cleared |
| F10 | Organization dashboard implied separate marketplace publication | Guidance explains automatic visibility of published projects and routes to project recruitment |
| Attendance | Global header height/stickiness and notice flex row constrained long text | Scoped automatic-height header, single-column notice and wrapping controls, with mobile bottom-nav clearance |

No database migration, generated database-type change, authorization relaxation or hosted operation is required.
