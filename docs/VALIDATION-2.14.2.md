# POEM 2.14.2 validation

## Automated acceptance

- `node scripts/test-phase2142.mjs` validates operational metrics/queue wiring, direct project navigation, response filtering, role-specific assignment controls, revoked-workspace fallback, responsive browser structure and the no-migration boundary.
- Existing `test-phase214.mjs` and `test-phase2141.mjs` remain regression gates for project/area authorization and project-team workspace behavior.
- `npm run preflight`, `npm run test:local` and `npm run test:operations` remain authoritative local gates.

## Browser acceptance

1. Sign in as a Project Manager and open the project workspace. Confirm target progress, visible active assignments, review counts, area coverage and latest visible responses.
2. Use **Open responses & reviews**. The assigned project should open directly rather than requiring a second project-selection click.
3. Filter responses by Pending review, Approved, Correction required and Rejected. Counts/rows must remain limited to authorized project data.
4. Sign in as an Area Focal Person. Confirm only assigned geography/descendant assignment coverage and responses are visible.
5. Confirm Area Focal Person does not see direct assignment-management/override controls; Project Manager does.
6. Revoke the project-staff assignment and refresh/reload. The stale project workspace should fall back to the personal workspace.
7. Repeat project dashboard, roster and response-filter flows at desktop, tablet and narrow mobile widths. No horizontal page overflow should be required for the roster; long names/areas should wrap.

## Release boundary

No new database migration is introduced by 2.14.2. Cloud `db push` should have nothing new from this release if 2.14.1 is already applied.
