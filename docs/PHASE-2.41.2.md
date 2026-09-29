# FieldLance 2.41.2 — Offline Browser Validation & Release Stabilization

- Browser harness controls both request transport (Playwright) and native navigator state (Chromium `Network.overrideNetworkState`). No navigator getter or application code is mocked to force the expected branch.
- Assert native online state and uncached HTTP probe results before capture and after offline navigation/reload. An inconsistent state fails immediately with context.
- Verify offline checkout in encrypted IndexedDB, its visible confirmation, reload persistence, no simulated server submission while offline, and exactly two original requests accepted on reconnect.
- Wait for the retry action's snapshot refresh to finish, then isolate the expiry test in a freshly loaded offline document. Its download timestamp precedes its expiry timestamp, and both are in the past, so it exercises expiration rather than invalid metadata.
- Failure output includes stage, browser/Node versions, expected/actual connection state, bounded page text, JS errors, failed requests, queue inventory and workday note.
- Correct the PGlite SQL date assertion with `work_date::text`.
- Ignore the two temporary diagnostic/backup scripts created during this investigation.

No new SQL migration or production attendance behavior change. This release requires the latest 2.41.1 baseline, including the existing 00461 daily payable correction. Existing migrations are not rewritten.

The browser suites use simulated Supabase transport and real browser DOM, IndexedDB, crypto and service workers. They do not certify live Supabase or physical-device operation.

Protocol reference: https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-overrideNetworkState
