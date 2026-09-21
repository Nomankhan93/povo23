# FieldLance 2.30.0 — Project Workspace Completion & UX Consolidation

Requires 2.29.0.

## Product objective

2.30.0 completes the project-scoped operating model introduced by earlier project/team phases. A project now has one coherent command center rather than a tab shell that re-renders duplicate screens or sends users back to organization-wide modules.

## Frontend completion

- **Overview** is a dedicated command center with project dates/area, approved-target progress, response health, active staff, recruitment/case signals, funding coverage for authorized finance users, and a context-sensitive next action.
- **Team** remains the project staffing/operating-plan surface; it is no longer reused as Overview.
- **Recruitment** stays project-scoped and is shown only to project-management authority.
- **Field Work** focuses the survey-project detail on assignments, collection and field operations.
- **Responses** focuses the same authoritative project data on submitted responses, review and registry outcomes instead of duplicating Field Work.
- **Cases** embeds the existing beneficiary-case lifecycle for managers of the selected project.
- **Finance** locks the existing finance workspace to the selected project; no project switcher is available inside Project Workspace.
- **Governance** locks policy inspection to the selected project while preserving its existing server authority for publishing policy revisions.
- **Documents** is now implemented as a private project file workspace.
- **Activity** is now an actual project-filtered management audit feed rather than a placeholder/link to the organization-wide log.

Organization Admin and authorized FieldLance survey users can open the full project workspace directly from an existing Survey Project detail. Project-scoped staff continue to enter through their project workspace scope.

## Project documents

The forward migration creates `public.project_documents` and a private `fieldlance-project-documents` bucket. Supported files are PDF, JPG, PNG, DOCX, XLSX and CSV up to 10 MiB. Files are reserved before upload and finalized only after stored-object size/type metadata matches the reservation. Removal uses a begin/delete/finalize workflow and preserves audit history.

This store is for project briefs/TORs, questionnaire support, training material, consent support, field instructions, finance support, project evidence and reports. Survey-response evidence and organization-compliance documents remain in their existing authoritative stores.

## Permission alignment

- NGO Admin / FieldLance survey-management authority: existing project staff-management authority.
- Project Manager: existing project/recruitment/case authority, but no new staff-administration, finance or governance-publication authority.
- Area Focal Person: scoped field/review visibility and project-document read access; no broad case, finance, management-activity or document-mutation authority.
- FieldLance finance authority / NGO Admin: existing project-funding authority.
- Project Activity: project-management authority only.

The frontend is not a security boundary; all new document/activity access is enforced through RLS/guarded RPCs/storage policies.

## UX consolidation

Project actions that require a reason use a reusable in-app confirmation dialog instead of browser `prompt()` calls. The new project workspace has responsive, horizontally scrollable tabs, stacked mobile cards, clearer section hierarchy and a minimum 11–14px typography range for its supporting text rather than introducing new 8–10px UI text.

## Intentionally deferred

2.30.0 does not introduce URL routing/deep links, a generic low-level ledger editor, live payment-provider transport, inventory, or a replacement for survey evidence/compliance storage. Those remain separate future phases.
