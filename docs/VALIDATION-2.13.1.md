# POEM 2.13.1 validation

## Automated

Run:

```bash
node scripts/test-phase2131.mjs
npm run preflight
npm run test:local
npm run test:operations
```

The focused suite checks that permanent profile grants are not required for direct survey assignment, NGO live-profile access follows the active assignment, auth contains explicit workspace destinations, the volunteer profile no longer exposes permanent sharing controls, and approved onboarding has a direct NGO-workspace handoff.

## Browser acceptance

1. Sign out and open the auth screen.
2. Confirm **Volunteer**, **Partner NGO**, and **POEM staff** choices are visible.
3. Sign in as Partner NGO with an account that has no approved NGO membership: Partner NGO application should open.
4. Approve that application's organization with a separate POEM NGO reviewer account.
5. Sign in as Partner NGO again: the approved NGO workspace should open automatically.
6. Switch back to **My Volunteer Workspace → My profile**: no **NGO profile access** or **Allow profile access** panel should exist.
7. Confirm **Available Opportunities** still shows published open recruitment and applications still use the recruitment snapshot without creating permanent profile grants.

## Known compatibility note

The legacy `profile_shares` schema/RPC remains for historical migrations/tests. It is not a current UI workflow. Removing the legacy schema entirely should be a separate breaking cleanup after historical regression fixtures are migrated.
