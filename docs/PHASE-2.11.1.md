# POEM 2.11.1 — Design System & Workflow UX

Incremental frontend upgrade from 2.11.0. No database changes or new migrations.

## Delivered

- Readable shared theme in `src/styles/design-system.css`: navy navigation, teal actions, neutral surfaces, typography, spacing, controls, status colors, visible keyboard focus and reduced-motion support.
- Domain-grouped navigation using the existing role-filtered entries. Active-page semantics, skip link, mobile backdrop, close button, Escape handling and keyboard focus containment.
- Shared UI components in `src/components/ui/WorkflowOverview.tsx`. Dashboard actions use the existing navigation permissions. Notification count is the loaded unread set, not a global aggregate. No invented impact statistics.
- Staff, NGO and personal dashboard actions; volunteer self-publication remains unchanged.
- Survey question progress, explicit progress limitations, readable answer review, sticky mobile save/submit actions. Dirty device drafts show saving status before their older saved timestamp.
- Offline workspace connection badge, downloaded-project empty state, device survey cards, explicit synchronized state, attachment empty state, destructive-action styling and bounded sync popover.
- Shared controls/surfaces flow through existing domain screens. Existing pagination, searches, validations and handlers are retained.

## Scope and follow-up

This is a shared design foundation and prioritized workflow pass, not a complete redesign of every domain. Existing domain forms/tables remain; no new universal search/pagination engine, step-by-step form wizard, translations, dark mode or dedicated task-count APIs. Survey progress counts present answer values, not validity, verified responses or upload completion. Compound answers can be incomplete despite contributing to progress.

Offline storage, queue, retry, access checks and migrations are unchanged. Browser acceptance below remains required; automated checks do not prove responsive rendering, keyboard behavior or real-device recovery.

## Manual acceptance checklist

At desktop 1440px, tablet 768px and mobile 390px, check staff, personal volunteer and NGO scopes:

1. Navigation contains only role-permitted entries and opens the expected existing workflows. Check workspace switching and revoked access behavior.
2. Mobile drawer: open, Tab/Shift+Tab loop, Escape/close/backdrop, focus return, desktop resize. Keyboard skip link reaches content. No content hidden under sticky controls at 200% zoom.
3. Dashboard shows relevant actions, correct loaded notification count and actual profile status; publishing remains self-service.
4. Survey: conditional questions update progress; false/zero answers count; missing consent and invalid fields still block submission. Review household/attachment answers and save/submit/close behavior.
5. Dirty draft shows saving then local timestamp. Simulate offline, queue, reconnect, failure, acknowledged recovery and attachment resume without duplicate submissions.
6. Offline workspace shows empty states, expired-policy guidance, connected/offline state and individual queue errors. Cleanup retains server records; erase still requires typed confirmation.
7. Check dense registry tables, volunteer forms and long names/file names for overflow. Check sync popover remains reachable on narrow screens.
8. Verify service-worker update flow and authenticated local integration with existing scripts.
