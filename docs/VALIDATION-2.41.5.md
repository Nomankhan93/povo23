# FieldLance 2.41.5 validation

Run inside WSL Ubuntu:
```bash
cd /home/noman/projects/poem-phase1.1
source ~/.nvm/nvm.sh
nvm use
npm run test:recruitment-hardening-2415
npm run test:collection-dates-2415
npm run test:browser-recruitment-2415
npm run types:check
npm run check
npm test
npm run build
npm run release:consistency
FIELDLANCE_GRANTS_DATABASE=postgres npm run test:grants-2415
npm run test:local-recruitment-2415
npm run test:browser-attendance-2414
npm run test:browser-map-2411
npm run test:browser-241
```

The local HTTP test validates project identity and loopback port before using disposable tagged accounts and records. Cleanup removes only recorded fixture IDs. The grants test checks actual effective privileges and transactional table probes for both migration-owner defaults. It requires the confirmed local database administration credentials inside the container; it never reads hosted credentials.

Latest-schema collection fixtures now establish application, formal offer and worker acceptance before collection. Existing payment/map contracts are created before their survey access, preserving their original immutable terms. Existing authorization, finance, geography, capacity, moderation, review and history assertions remain; obsolete direct-access setup has not been used to bypass the new guard.

The recruitment browser fixture exercises the actual component with simulated transport at 390px. Real Auth/PostgREST/RPC behavior is covered separately. Native-device field testing is not claimed.

Known pre-existing failure: F14, scripts/test-browser241.mjs fails at offline deep-link because native navigator.onLine disagrees with the requested state in Chromium 151.0.7922.34. Do not call this a 2.41.5 regression, disable its assertions or fix the offline harness in this patch.

See IMPLEMENTATION-2.41.5.md for actual execution results and limitations. Overall release remains on hold.

The pre-commit project-date correction adds A-I date-boundary assertions and unchanged-contract checks. The isolated real PostgreSQL runner uses FIELDLANCE_DATE_DATABASE=fieldlance_2415_validation and rolls fixtures back; it refuses the live postgres database. The live HTTP integration uses only its tagged, cleaned-up records.

Correction outcome: all required targeted checks and an uninterrupted npm test passed. Types, TypeScript, build, browser recruitment/map/attendance and metadata/release checks passed. The previous F14 failure was not rerun in this correction. See the correction results in IMPLEMENTATION-2.41.5.md; do not conflate patch commit readiness with overall release readiness.
