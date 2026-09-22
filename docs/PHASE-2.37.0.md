# FieldLance 2.37.0 — Workforce Scheduling, Availability, Capacity & Assignment Safety

## Purpose

FieldLance 2.37.0 adds a structured scheduling layer for Field Workers without exposing the names or details of their other Organization commitments. It keeps `work_assignments` authoritative, adds private availability preferences/exceptions, and gives authorized project recruiters a privacy-preserving conflict/capacity summary before a formal offer is created.

This release does not add attendance/GPS check-in. That remains a later field-operations phase.

## Field Worker availability

Field Workers can now maintain:

- weekly available/off days and working-hour windows;
- preferred shift and travel willingness;
- a maximum parallel-project limit;
- a maximum workdays-per-week preference;
- date-specific unavailable periods;
- a 60-day schedule view for offered/active assignments and blocked dates.

The existing profile `availability` value remains a general recruitment summary. Structured availability is the source used for assignment conflict checks.

## Assignment safety

`check_work_assignment_conflicts(...)` returns only a privacy-safe summary to the worker or an authorized project workforce manager:

- `clear`, `warning`, or `hard_conflict`;
- number of overlapping commitments;
- configured parallel-project limit;
- proposed capacity percentage;
- unavailable-date count;
- estimated available days where a weekly schedule is configured.

It deliberately does **not** return the other Organization/project names or assignment identifiers.

Hard conflicts are enforced below the UI by a `work_assignments` trigger. A new offered/active assignment is rejected when the proposed concurrent-project count exceeds the Field Worker's configured maximum or when a configured weekly schedule has no available day in the requested assignment range. Normal overlaps/unavailable dates are warnings unless they reach a hard rule.

## Privacy and authority

The new availability tables are private to the signed-in Field Worker under RLS. Authenticated users cannot directly insert/update/delete them; mutations are handled through guarded security-definer RPCs and audited.

Organization/Project recruiters receive the aggregate conflict result only. Cross-Organization commitment identity remains hidden.

Existing project/workforce authorization is unchanged. URL visibility, candidate cards, or frontend state do not grant workforce-management authority.

## Routes and UX

Field Worker routes added:

- `/app/work/schedule`
- `/app/work/availability`

Both participate in the existing 2.36 URL-routing/mobile IA. The mobile **Work** destination remains the primary entry point and treats Schedule/Availability as work-related pages.

The formal-offer form now performs a debounced assignment-safety check against the proposed target/dates and disables the final offer action on a hard conflict.

## Migration

Adds one forward migration:

`20261013000300_workforce_scheduling_assignment_safety.sql`

No existing assignments are rewritten. Existing Field Workers begin with safe defaults and a warning state until they configure structured weekly availability.
