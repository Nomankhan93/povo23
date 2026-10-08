# Upgrade to FieldLance 2.42.0

2.42.0 is a frontend presentation-layer release with no database migration.

## FAST validation

```bash
npm run test:ui-foundation-2420
npm run test:navigation-capability-24114
npm run test:routing-236
npm run test:mobile-production-24117
npm run release:consistency
npm run check
npm run build
git diff --check
```

Do not run the full historical `npm run preflight` for this patch unless independently required for release certification.

## Browser acceptance

Verify one Field Worker, one Organization user and one FieldLance Staff account on desktop and mobile widths. Confirm authorized destinations are unchanged, workspace switching still resolves the same scope, Field Worker bottom navigation keeps Home/Work/Field/Earnings/Profile, and Project Workspace mobile navigation uses the Project Section selector without changing deep links or tab IDs.
