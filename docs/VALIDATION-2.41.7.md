# FieldLance 2.41.7 validation

All commands ran in Ubuntu WSL at /home/noman/projects/poem-phase1.1, with Node selected from .nvmrc (v24.21.0) and npm 11.19.0.

## Results

To honor the release versioning gate, the full uninterrupted npm test ran on the complete 2.41.7 candidate source while package metadata still read 2.41.6. After the passing run, package/lock versions were advanced; post-version wallet, earnings-wallet, types, TypeScript, release-consistency and secret checks also passed.

- npm test: PASS, uninterrupted final run (exit 0), including new test:wallet-capability-2417.
- npm run test:wallet-capability-2417: PASS. Production default closed; forged session override, direct/private bypass and cross-user access denied; explicit isolated sandbox retains admin-only mock behavior; historical records and withdrawal eligibility remain intact.
- npm run types:generate: PASS after correcting the new wrapper's dollar-quote delimiter; generated database.types.ts preserves JSONB as Json.
- npm run types:check: PASS against all migrations.
- npm run check: PASS.
- npm run build: PASS, including offline worker checks. Vite reported the existing non-fatal >500 kB bundle chunk warning.
- npm run test:browser-network-2412 and npm run test:browser-241: PASS in Chromium. Blocked transport with native online state was explicitly reproduced; offline boot, reload, queued capture, rejected sync/retry, expiration, deep link, owner switching and erase passed. These browser runs simulate API transport; they do not claim live Auth/Storage coverage.
- npm run test:field-map-240 within full npm test: PASS. The full map regression paged 2,605+ records across duplicate-free pages and passed manager, Field Focal, worker-personal, unrelated-organization and revoked-source checks.
- npm run test:browser-map-2411: PASS. Chromium exercised the real map DOM for renderer failure, strict remount/page restoration, revoked-access recovery and owner-separated state; RPC transport was simulated.
- npm run check:release-secrets: PASS.
- npm run release:consistency, npm run metadata:check, and git diff --check: PASS after versioning/inventory generation.

The first two full-suite attempts stopped at stale generated inventories and then an obsolete 2.25 wallet-copy assertion. The inventory files were regenerated; the older assertion was replaced with assertions for the new capability hook, submit guard and production-unavailable message, plus an assertion that the obsolete simulated-ownership claim is absent. No permission or financial assertion was removed. The final uninterrupted full suite passed.

The saved pre-patch offline-baseline.log records the earlier native-online/offline-request mismatch. Current F14 tests pass with the harness correction; this baseline is not attributed to the 2.41.5 recruitment/grant patch.
