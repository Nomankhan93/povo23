# POEM 2.14.1 validation

## Automated gates

- `npm run preflight`
- `npm run test:local`
- `npm run test:operations`
- `node scripts/test-phase214.mjs`
- `node scripts/test-phase2141.mjs`

## Browser acceptance

1. NGO Admin opens NGO workspace → Project team.
2. Select a project and assign an active organization member as Project Manager.
3. Assign another active member as Area Focal Person with one or more project areas.
4. Sign in as Project Manager: a project workspace option appears and project-wide operational counts/projects are visible.
5. Sign in as Area Focal Person: project workspace appears but response/assignment counts remain geography-scoped by RLS.
6. Revoke the focal assignment as NGO Admin; after reload/sign-in the project workspace disappears and historical response/capture access remains revoked.
7. Confirm project staff cannot open broad NGO membership, template, canonical, data-sharing or finance administration.
