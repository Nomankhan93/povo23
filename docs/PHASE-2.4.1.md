# POEM 2.4.1 — Canonical merge reversal stabilization

## Purpose

Phase 2.4.1 is a focused stabilization release for the canonical beneficiary identity foundation introduced in 2.4.0.

The 2.4.0 merge event correctly stores moved project-person UUIDs as a JSON array of scalar strings. The original `revert_canonical_merge()` implementation read each JSON value through `jsonb_array_elements(... )::text::uuid`. PostgreSQL's JSONB-to-text representation keeps the surrounding JSON quotes, so a stored UUID such as `5527...` was presented to the UUID parser as `"5527..."` and the revert failed.

## Change

The forward-only migration `20260919000200_canonical_unmerge_fix.sql` replaces only `public.revert_canonical_merge()` and reads the existing array with `jsonb_array_elements_text()`.

This means:

- existing 2.4.0 merge events do not need to be rewritten;
- project-scoped registry records remain untouched;
- canonical merge history remains auditable;
- a mistaken merge can be reverted again;
- reverted identities can be reviewed and merged again later.

## Boundaries

This release does not add NGO-to-NGO beneficiary sharing, automatic identity merging, fuzzy matching, offline field collection, payment handling, or volunteer scoring.

Partner NGOs still cannot directly read POEM-wide canonical tables or another NGO's beneficiary records.
