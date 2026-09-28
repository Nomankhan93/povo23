# FieldLance 2.41.0 validation

`npm run preflight` checks generated database types, TypeScript, the full existing regression chain, release metadata, new device lifecycle tests, production build and static-shell worker behavior.

`npm run test:device-recovery-241` executes real store source with fake-indexeddb and WebCrypto: combined inventory, current-owner denial, lock/offline reopen, retained failures, explicit retries and receipts, owner-scoped erase, in-flight attendance/survey completion after erase, freshness and malformed URLs. Existing 2.40.1 React/attendance tests continue to run with updated dependency mocks.

`npm run test:browser-241` builds the actual App and field components with a test-only Supabase transport alias, starts a local HTTP server and runs Chromium. It covers app deep-link boot offline, check-in/out, reload persistence, denied sync/retry, expired downloads, malformed routes, owner switching, confirmed erase, lock and Auth-callback cache exclusion. Temporary build output is deleted after the run. Fixture files are not imported by the production entry point.

Browser transport simulation is not live Supabase Auth/Storage or multi-session PostgreSQL validation. Mobile devices, actual geolocation permissions, browser eviction and live backend revocation remain explicit upgrade acceptance checks.

Executed 2026-09-28: final preflight exited 0 with 931 PASS result lines; five Chromium acceptance groups passed with simulated backend transport. Production worker precaches 42 static assets. No live Supabase or phone acceptance was claimed.
