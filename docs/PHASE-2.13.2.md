# POEM 2.13.2 — Authentication Experience Redesign

This release is a frontend-only authentication experience refinement. It preserves the 2.13.1 one-account / multi-workspace authorization model and changes presentation only.

## Goals

- Retain the Volunteer, Partner NGO and POEM staff destinations introduced in 2.13.1.
- Present one consistent POEM sign-in and account-creation experience.
- Reduce repeated role wording in headings and primary actions.
- Improve typography, spacing, field treatment, password usability and mobile behavior.
- Make the left story panel role-aware without changing authorization behavior.
- Remove internal release-version text from the public authentication screen.

## UX changes

- Desktop split changes to approximately 43/57 story/form proportions.
- The oversized wordmark card is replaced by the compact POEM brand treatment.
- Volunteer, NGO and staff destinations each receive role-specific story copy.
- Login heading is standardized as `Sign in to POEM`.
- Signup heading is standardized as `Create your POEM account`.
- Primary buttons are reduced to `Sign in` and `Create account`.
- Password and confirmation fields include accessible show/hide controls.
- The long account explanation becomes one compact account note.
- The public authentication footer no longer exposes the application release number.
- Mobile uses a compact POEM brand header instead of a squeezed desktop split layout.

## Non-goals

- No database migration.
- No auth provider changes.
- No RLS or permission changes.
- No change to Partner NGO approval, workspace membership or post-login routing.
