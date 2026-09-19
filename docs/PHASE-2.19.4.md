# POEM 2.19.4 — Frontend Foundation Stabilization

## Objective

Clean the validated 2.19.3 frontend foundation before screenshot-driven UI/UX work, without redesigning working architecture or changing database behavior.

## Changes

- Fix grouped sidebar discoverability for `Recruitment` and `Withdrawal operations`.
- Replace the duplicate Needs and Surveys Pager implementations with one shared UI component.
- Remove the unreferenced volunteer `ReviewForm.tsx` component.
- Remove the unused generic `public/favicon.svg`; keep the branded POEM emblem favicon.
- Add `test:frontend-foundation` regression coverage.

## Deliberately deferred

- AppShell decomposition.
- URL/deep-link navigation.
- legacy `style.css` / `design-system.css` consolidation.
- replacement of native confirm/prompt dialogs.
- visual redesign, spacing/theme changes and screen-specific workflow polish.

Those changes should be driven by the next screenshot audit rather than speculative refactoring.

## Database / security

No migration, RLS, RPC, finance, payment, beneficiary, offline or organization-authorization change is included.
