# FieldLance 2.41.2 validation

Required gates: `npm run preflight`, `npm run test:browser-241`, `npm run test:browser-network-2412`, `npm run test:browser-map-2411`, and local Supabase `npm run test:local`.

The network regression deliberately recreates blocked transport with native `navigator.onLine=true`, then runs the same complete offline acceptance flow through the corrected controller. It must restore native state and preserve real request blocking.

The date regression must pass without relying on the host timezone or `Date.toString()` formatting. Browser expiry coverage must wait for sync/download refresh completion before altering the cached lease.

Build-side results and limitations are recorded in the patch's VALIDATION_RESULTS.md. Physical phones, live map services, Supabase Auth/Storage and hosted deployment remain separate acceptance checks.
