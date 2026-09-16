# POEM 2.13.1 — NGO Access & Authentication Stabilization

This release aligns the 2.13 Partner NGO onboarding flow with the current product UX and recruitment privacy model.

## What changed

- Auth now exposes **Volunteer**, **Partner NGO** and **POEM staff** destinations.
- These are workspace destinations, not separate identities: a person continues to use one personal POEM account and password.
- Approved Partner NGO representatives are routed to an active NGO workspace after Partner NGO sign-in.
- A representative without an active NGO membership is routed to **Partner NGO application** to start/continue/review onboarding.
- Approved applications provide an explicit **Open NGO workspace** action.
- Volunteer **My profile** no longer renders permanent NGO profile-sharing controls.
- Existing permanent `profile_shares` rows are retired during migration without firing legacy delete triggers.
- Direct survey assignment no longer requires a permanent profile-sharing row.
- Live NGO profile access can be established by explicit project/assignment/invitation relationships; application review continues to use its bounded recruitment snapshot.

## Compatibility boundary

The historical `profile_shares` table and `set_profile_sharing` RPC remain in the schema so older forward migrations and regression fixtures remain reproducible. Current POEM UI does not query or mutate them, and current recruitment/assignment paths do not require them.

## Not included

- Shared organization passwords/accounts.
- Automatic creation of NGO staff users beyond the approved representative's first `ngo_admin` membership.
- Project Focal Person / area-scoped project roles (planned next).
- JazzCash or custodial account balances.
