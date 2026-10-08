# FieldLance 2.41.17 validation

## Automated release boundary

- `test:mobile-production-24117`: safe-area viewport/chrome, bottom-nav accessibility/touch sizing, explicit attendance GPS behavior, encrypted offline controls, static-only worker cache, install manifest, production geolocation policy and no-migration boundary.
- `test:browser-mobile-production-24117`: composes the existing 2.41.9 mobile workflow, 2.41.4 attendance, 2.41.2 network and 2.41.1 map browser suites.
- `check:mobile-production-24117`: post-deployment HTTPS shell check for security headers, viewport safe areas, PWA manifest, service worker and direct SPA mobile routes.

## Local validation policy

Use targeted tests + `npm run check` + `npm run build` + `git diff --check`. Full historical `npm run preflight` remains deferred to release certification.

## Physical acceptance

A production release is not considered mobile-accepted solely because Chromium automation passes. Complete `MOBILE-PRODUCTION-ACCEPTANCE-2.41.17.md` after deployment, including real permission prompts, offline transitions, virtual keyboard/action clearance and installed-PWA behavior. This is mobile-browser testing; there is no FieldLance Android-app requirement.

No database migration is added. Migration head remains 00580.
