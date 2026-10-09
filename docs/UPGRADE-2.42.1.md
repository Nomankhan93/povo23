# Upgrade to FieldLance 2.42.1

2.42.1 is a Project Workspace presentation-only release with no database migration.

## FAST validation

```bash
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:navigation-capability-24114
npm run test:routing-236
npm run test:mobile-production-24117
npm run release:consistency
npm run check
npm run build
git diff --check
```

Do not run the full historical `npm run preflight` for this patch unless independently required for final release certification.

## Browser acceptance

Open a project from an Organization workspace, FieldLance Staff workspace and a project-scoped Project Manager / Area Focal Person account where available. Confirm the compact project identity header wraps long titles, unauthorized tabs remain absent, desktop navigation is grouped, mobile opens the Project Section bottom sheet, direct tab URLs survive refresh, and browser back/forward restores the prior project tab.
