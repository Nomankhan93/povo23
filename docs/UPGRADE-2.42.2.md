# Upgrade to FieldLance 2.42.2

## Baseline

Apply only to the verified FieldLance 2.42.1 baseline.

## Database

No migration, schema, RLS, grant or RPC deployment is required.

## Frontend

The Survey Template Builder is reorganized into Drafts / Builder / Published views and introduces `src/features/surveys/SurveyTemplates.module.css`. Existing Survey Form, response review, project-detail and offline field files are unchanged.

## FAST validation

Run:

```bash
npm run test:survey-template-builder-2422
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:navigation-capability-24114
npm run test:routing-236
npm run test:accessibility-24120
npm run release:consistency
npm run check
npm run build
git diff --check
```

Do not substitute the full historical preflight for this UI patch unless separately performing release certification.
