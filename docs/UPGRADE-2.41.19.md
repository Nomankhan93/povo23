# Upgrade to FieldLance 2.41.19

## Scope
Frontend/runtime observability only. There is no database migration in this patch.

## Apply / install

Use the normal FieldLance Node version and install the locked dependency set:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
```

## Targeted validation

```bash
npm run test:observability-24119
npm run test:performance-24118
npm run test:workspace-refresh-24113
npm run test:notification-routing-2413
npm run test:mobile-production-24117
npm run check
npm run build
git diff --check
```

Full historical `npm run preflight` is not required for this frontend/runtime patch; reserve it for 2.42.0 release certification unless later changes introduce DB/auth/RLS/finance/security-critical behavior.

## Production smoke checks after deploy

- Normal login and workspace load still succeed.
- Temporarily block `/field-sw.js` in browser devtools and confirm the app remains usable while a sanitized service-worker diagnostic is emitted.
- Use an invalid application path and confirm the normal page-not-found/deep-link behavior remains intact.
- Disconnect/reconnect during Offline field and confirm device data is retained and retry messaging remains usable.
- Open Field Map with the renderer CDN blocked and confirm the evidence list remains available with a retryable map warning.
- Open a stale/unauthorized notification target and confirm the user gets a safe access/availability message rather than raw database detail.

Do not paste production console records containing user data into tickets. 2.41.19 diagnostics are designed to be sanitized, but support should still treat diagnostic output as operational data.
