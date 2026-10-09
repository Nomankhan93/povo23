# FieldLance 2.42.3 validation

## Dedicated regression

`npm run test:survey-collection-responses-2423` verifies the protected 2.42.2 survey-template/offline/save baseline, route/capability/Supabase-client invariants and unchanged migration inventory. It also guards the existing Survey Form section calculation/stepping and save/retry/submit wiring, CaptureFields attachment/GPS/household/value semantics, response query/review/revision/secure-attachment behavior, workspace context ownership, Review Queue query/pagination/routing, and CSS Module constraints.

## Compatibility regressions

Also run the 2.42.2 Survey Template Builder, 2.42.1 Project Workspace, 2.42.0 UI foundation, navigation/capability, routing, mobile-production and accessibility targeted regressions plus release consistency and `git diff --check`.

## Typecheck/build

Run `npm run check` and `npm run build` on an environment with project dependencies installed. If the artifact-build environment lacks dependencies, record the exact failure and do not claim these commands passed.

## Database

No database migration is included. Migration count/head must remain exactly equal to the verified 2.42.2 baseline.
