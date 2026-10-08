# Validation — FieldLance 2.41.16

Routine patch validation is risk-based; the full historical preflight is deferred.

```bash
npm run test:production-web-24116
npm run test:routing-domain-24111
npm run test:auth-session-24112
npm run test:project-lifecycle-24115
npm run release:consistency
npm run check
npm run build
npm run check:release-secrets
git diff --check
```

There is no new migration. `npx supabase migration list` should remain aligned through `20261013000580` after 2.41.15 has already been applied.

Before custom-domain cutover, load the real production environment values and run:

```bash
npm run check:production-domain-24116
```

Hosted acceptance after deployment:

- inspect response headers on the app origin and confirm CSP/HSTS/frame/MIME/referrer/permissions/no-index headers;
- direct-open and refresh `/app/home`, one authorized `/org/...` route and one authorized `/staff/...` route;
- complete a real email confirmation through `/auth/callback`;
- request and complete password recovery through `/reset`;
- open a public `/verify/:code` certificate link;
- load Field Operations Map and confirm MapLibre/OpenFreeMap are not blocked by CSP;
- verify explicit geolocation still works when the browser grants permission;
- verify Vite fingerprinted assets cache while `index.html` and `field-sw.js` revalidate.
