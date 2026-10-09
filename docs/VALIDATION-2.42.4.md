# FieldLance 2.42.4 validation

## Dedicated regression

`npm run test:recruitment-marketplace-2424` guards the protected recruitment query/state files, routes/capabilities, no-migration boundary, canonical marketplace/eligibility behavior, application consent and application-time snapshot semantics, exact deep-link entity loading, formal-offer source/compensation/conflict behavior, invitation-vs-assignment boundaries, CSS Module rules and safe local UI-debt retirement.

## Compatibility regressions

Also run the existing Workforce Marketplace, automatic marketplace, recruitment-hardening, Project Workspace, UI foundation, navigation/capability, routing, mobile-production and accessibility regressions plus release consistency and `git diff --check`.

## Typecheck/build

Run `npm run check` and `npm run build` on an environment with project dependencies installed. If the artifact environment lacks dependencies, record the exact limitation and do not claim the commands passed.

## Database

No database migration is included. Migration count/head must remain exactly equal to the verified 2.42.3 baseline.
