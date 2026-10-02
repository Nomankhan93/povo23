# FieldLance 2.41.7 — Production Capability & Offline Harness Stabilization

This patch closes two existing audit findings: F03 wallet production capability and F14 offline browser test reliability.

## F03 — wallet capability boundary

Production no longer offers mock wallet enrollment or simulated ownership verification. A server-owned capability row defaults to disabled; wallet_capabilities() reports the active environment, and browser session settings cannot enable it. Enrollment and mock verification/activation/provider RPCs are guarded server-side, while private implementations and capability storage have no browser-role grants. Existing wallets, withdrawal history, payable eligibility and manual finance settlement remain available.

The existing simulate_mock_e_wallet_provider(uuid,text,uuid) contract remains JSONB. Its guarded wrapper retains the result shape consumed by older payment clients and tests. This patch does not connect a live payment provider.

## F14 — test harness connectivity

The Chromium adapter now records the browser's native connectivity independently from FieldLance's application offline override and CDP transport. It verifies reachable transport with a unique no-store probe and can explicitly reproduce blocked transport while native navigator.onLine remains true. Production offline storage and synchronization behavior are unchanged.

The preserved pre-patch baseline log records the prior native-online/offline-request mismatch. Current test:browser-241 and test:browser-network-2412 runs pass the recovery, queue/retry, expiration, ownership and erase workflows. This harness issue is separate from the 2.41.5 recruitment/authorization and database-grant patch.

## Database

One forward-only migration: 20261013000540_wallet_production_capability.sql. It follows 20261013000530_collection_project_date_guard.sql; no reset or destructive migration is required. Generated database types were regenerated from the complete migration set.
