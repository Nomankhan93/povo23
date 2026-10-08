# FieldLance 2.41.18 Validation

## Completed in patch-build environment

- `node scripts/test-performance24118.mjs` — PASS, 7 scenarios.
- `npm run test:workspace-refresh-24113` — PASS, 8 scenarios.
- `npm run test:branding` — PASS, 10 scenarios.
- `npm run test:mobile-production-24117` — PASS, 10 scenarios.

## Not completed in patch-build environment

`npm run check` and the production Vite build could not be completed because dependency installation repeatedly exceeded the execution environment transport timeout and left `node_modules` incomplete (`vite/client` type definitions unavailable).

This is an environment limitation, not a reported TypeScript/build pass. Run the commands in `UPGRADE-2.41.18.md` in the normal FieldLance WSL environment before commit/deployment.

## Acceptance checks after local build

- No `>500 kB` initial chunk warning, or any remaining warning is identified by generated chunk ownership and documented.
- Field Worker initial entry does not statically include organization/staff dashboards.
- Service-worker install no longer downloads every lazy route chunk.
- Offline Field Workspace opens after a fresh online install followed by network loss.
- Personal Overview does not fetch the global organization/member directories.
- Switching browser/app focus repeatedly within 30 seconds does not trigger repeated workspace refreshes.
