# FieldLance 2.41.20 — Accessibility & UX Consistency

## Goal
Improve keyboard, focus, modal, mobile-touch and assistive-technology behavior without changing server authorization, business workflows or stored data.

## Changes

- Shared confirmation dialogs now use unique accessible title/description IDs, explicit busy state, Escape handling and keyboard focus containment.
- The unsaved-authoring warning no longer nests a custom dialog inside a native `<dialog>`; one modal boundary owns focus and dismissal behavior.
- Workspace SPA navigation moves programmatic focus to the newly selected content region after a page/workspace change, while leaving modal focus untouched.
- The main workspace heading now labels the focus target used by skip-link and programmatic navigation.
- The top-level crash recovery screen focuses its recovery heading after an uncaught React failure.
- Partner Organization application success modal now restores prior focus, moves initial focus inside the modal, traps Tab/Shift+Tab, supports Escape and exposes its descriptive text to assistive technology.
- Blocking Field Worker, Organization and Staff dashboard errors now use `role="alert"`; project moderation blocking state uses the same assertive error semantics.
- Header notification count is hidden from the accessibility tree because the button already exposes the unread count in its accessible name.
- Coarse-pointer devices receive a 44px minimum interactive target baseline for buttons/summary controls, including icon controls.
- Global reduced-motion fallback disables non-essential animation/transition motion.
- Higher-contrast and Windows forced-colors modes receive explicit border/active-state fallbacks.
- RTL fallback mirrors the sidebar active-edge indicator and mobile header auto-margin behavior.
- Added `test:accessibility-24120` regression coverage.

## Deliberately unchanged

- No Supabase migration, RLS, grant, RPC or schema change.
- No role/capability or workflow change.
- No new accessibility framework/runtime dependency.
- No redesign of individual feature forms; 2.41.20 hardens shared interaction boundaries and high-value inconsistencies first.

## Follow-up

2.41.21 should audit data integrity/reporting consistency across responses, cases, attendance/payables, work history, project counters and archived/closed project behavior before 2.42.0 release certification.
