# Upgrade to FieldLance 2.41.18

No database migration is required.

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
npm run test:performance-24118
npm run test:workspace-refresh-24113
npm run test:navigation-capability-24114
npm run test:mobile-production-24117
npm run check
npm run build
git diff --check
```

After `npm run build`, confirm the generated `dist/field-sw.js` does not list every file from `dist/assets`; it should contain the critical main/offline-field dependency graphs only.

For this patch, full historical `npm run preflight` is not required. Reserve broader certification for 2.42.0 unless an unexpected auth/database regression is discovered.
