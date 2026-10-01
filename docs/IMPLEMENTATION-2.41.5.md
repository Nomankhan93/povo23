# FieldLance 2.41.5 implementation report

Status: F01/F10 and the pre-commit project-date correction have passed required patch validation. Version remains 2.41.5. Scope is F01 and F10 only. Overall release remains ON HOLD.

Branch: codex/fieldlance-2.41.5-recruitment-hardening. Baseline was clean main at version 2.41.4. No commit, push, deployment or hosted-service modification was performed.

## Behavior and invariant
For worker survey activation, scope changes and effective collection, an accepted active work assignment must exist for the same project, organization and user with responded_at recorded. Selected applications, accepted invitations, shared profiles, shortlist relationships and offered/declined/cancelled/completed assignments cannot independently authorize collection. A table trigger guards equivalent direct-write paths. Existing account, project, organization, moderation, governance, date, geography and capacity rules continue to apply.

Normal publication/discovery/application-scoped consent/review/formal offer/worker acceptance remains functional without permanent profile sharing. Acceptance stays idempotent. Revocation and suspension deny effective collection. Case delegation requires accepted worker contracts, while independent reviewer, platform administration and Project Manager/Area Focal authority remain separately authorized.

Frontend changes are limited to project collection entry and management, marketplace access labels/counts, and project-team record labels. The operational override is removed. Accepted-contract scope management and revocation remain; historical rows show recruitment guidance and do not imply current collection permission. Start survey reads effective server eligibility.

## Inventory and historical implications
Read-only pre-migration inventory: 0 active survey assignments without a qualifying contract, 0 affected projects, 0 affected workers, 0 currently collecting invalid rows. The development database had no survey or work assignments at all. No local historical assignment remediation was needed.

Upgrade regressions seed real pre-migration legacy survey rows, apply forward migrations, and verify that the rows remain stored while effective collection is denied. Existing compensation and historical records are not rewritten. Other environments must separately inventory their rows and complete genuine recruitment where continued collection is required.

## Forward migrations and local state
- 20261013000490_recruitment_collection_consent.sql: private contract predicate, table guard, both assignment RPCs, compatibility collection gate and self-only eligibility RPC.
- 20261013000500_application_table_privileges.sql: object/default ACL hardening.
- 20261013000510_collection_definer_helper_permissions.sql: trusted postgres-owned RPC access to the private helper; browser access remains denied.
- 20261013000520_case_worker_recruitment_consent.sql: worker case eligibility and candidate filtering.
- 20261013000530_collection_project_date_guard.sql: restores the inclusive UTC project-date condition in the shared collection helper.

All five migrations, including 00530, are applied and registered in the local poem-phase11 database only. Existing applied migrations were not edited. The local environment used Ubuntu, Node v24.21.0, npm 11.19.0 and Supabase API 55321/database 55322. The separate fieldmesh stack was not touched.

## Effective privilege results
| Browser role | TRUNCATE before/after | REFERENCES before/after | TRIGGER before/after | MAINTAIN before/after |
| --- | --- | --- | --- | --- |
| anon | 4 / 0 | 4 / 0 | 4 / 0 | 4 / 0 |
| authenticated | 7 / 0 | 7 / 0 | 7 / 0 | 7 / 0 |

Affected tables: survey_capture_files, operational_task_sla_policies, operational_tasks, operational_task_events, worker_availability_preferences, worker_availability_rules and worker_unavailable_periods. The last three had authenticated-role excesses only. Capture metadata direct INSERT/UPDATE/DELETE grants were also removed from browser roles; existing reservation RPCs retain their authority. Both public-table creator defaults were tested using transactional probes. Required authenticated SELECT, Storage INSERT, RPC EXECUTE and service_role authority passed real catalog checks.

No object ownership, broad schema permissions, Auth schema or Storage schema grants were changed. Applying defaults for supabase_admin requires the appropriate administrative role; see the upgrade notes.

## Backup and cleanup
Recovery archive: /home/noman/fieldlance-backups/2.41.5/pre-hardening.dump
Globals: /home/noman/fieldlance-backups/2.41.5/pre-hardening-globals.sql
SHA-256: 9411347ca8a412b71ca87b453aef414e34fd17a9b99eec18663b180dc26e8a17

pg_restore read the archive directory successfully. A disposable PostgreSQL restore verified application schemas/data and migration execution. One extension-generated GraphQL ACL was excluded from that isolated restore; restore.list preserves the exact selection. The complete archive is unchanged. This is not an unqualified full-cluster restore claim.

The disposable fieldlance_2415_validation database and its temporary restore-list copy were removed after validation; the backup and restore list outside the repository remain. Every disposable HTTP test account/record was removed. The initial cleanup-order failure was corrected and its single leftover tagged geography removed explicitly. Final counts: 18 accounts, 5 projects, 0 survey assignments, 0 work assignments; 0 tagged organizations/templates/geographies. No unrelated existing records were changed.

## Validation results
| Check | Result |
| --- | --- |
| Recruitment upgrade/authorization suite | PASS: 20 grouped checks plus suspension and role-isolation assertions |
| Real Auth/PostgREST recruitment and cleanup | PASS |
| Real PostgreSQL effective and default ACLs | PASS |
| Case ownership, including ended-contract denial | PASS: 16 scenarios |
| Capacity/target regression | PASS: 9 scenarios |
| Recruitment browser, 390px and reload | PASS; simulated transport, actual component |
| Online attendance browser | PASS |
| Map browser | PASS |
| Full database map regression | PASS: all 33 scenarios |
| Database types, TypeScript and production build | PASS before and after version change |
| Live schema versus migrations | PASS: 467 function bodies/signatures/security flags/search paths |
| Release consistency and diff whitespace | PASS for 2.41.5 |
| Offline browser and network-wrapper gates | FAIL: pre-existing F14 |
| Overall product release | BLOCKED by unresolved audit P1s |

The initial implementation test chain contained 94 individual commands including the recruitment suite. Initial npm test invocations stopped on legacy fixture assumptions. The remaining commands were then executed in original order with individual logs; failed fixtures were corrected and rerun. Those initial runs were not one uninterrupted green npm test run; the correction rerun below subsequently passed the complete chain. Exact commands are listed in COMMANDS-2.41.5.md. All 94 individual commands have passing results across the initial sequence and corrective reruns. The 33-scenario map rerun passed in full. Durable logs, including initial failures, are preserved at /home/noman/fieldlance-backups/2.41.5/validation-logs/.

Patch-development failures were fixed rather than hidden: obsolete direct-assignment fixtures, duplicate fixture contracts, restoration of a survey row after its fixture contract had completed, a missing trusted-definer helper grant, browser-fixture setup, and cleanup ordering. No test was disabled and no failed coverage was deleted. Existing capacity and verification assertions now run against the real offer lifecycle; legacy RPC denial assertions were added.

F14 remains separate: both scripts/test-browser241.mjs and its network-wrapper invocation fail at offline deep-link because Chromium 151.0.7922.34 reports native navigator.onLine=true while the requested state is offline. The harness and its assertions were not changed.

## Remaining audit work
F02 funding retry idempotency; F03 production wallet verification; F04 authoring/draft loss; F05 capped recruitment queues/deep links; F06 withdrawal minimum alignment; F07 attendance history UI; F08 attendance error-state recovery; F09 organization compliance upload recovery; F11 dialog focus; F12 mobile attendance overflow; F13 dashboard count truncation; F14 offline browser gate; F15 navigation/label polish. These are not implemented by this patch. Overall release remains on hold.

## Follow-up commands
All five migrations are applied locally; no additional local migration is required.
```bash
cd /home/noman/projects/poem-phase1.1
source ~/.nvm/nvm.sh
nvm use
npm run test:recruitment-hardening-2415
npm run test:browser-recruitment-2415
FIELDLANCE_GRANTS_DATABASE=postgres npm run test:grants-2415
npm run test:local-recruitment-2415
npm run preflight
git status --short
```
F14 and the remaining P1 findings require separately scoped work before release. Do not push or deploy this branch as part of validation.

## Changed files

- FILES.txt
- PROJECT_ANALYSIS_CONTEXT.txt
- README.md
- docs/ARCHITECTURE.md
- docs/COMMANDS-2.41.5.md
- docs/IMPLEMENTATION-2.41.5.md
- docs/PERMISSIONS.md
- docs/PHASE-2.41.5.md
- docs/RELEASE-CHECKLIST.md
- docs/UPGRADE-2.41.5.md
- docs/VALIDATION-2.41.5.md
- docs/VALIDATION.md
- package-lock.json
- package.json
- project-tree.txt
- scripts/accepted-collection-fixture.mjs
- scripts/fixtures/recruitment2415/client.js
- scripts/fixtures/recruitment2415/main.jsx
- scripts/test-collection-dates2415.mjs
- scripts/test-browser-recruitment2415.mjs
- scripts/test-correctness276.mjs
- scripts/test-current-state-stabilization.mjs
- scripts/test-grants2415.mjs
- scripts/test-local-recruitment2415.mjs
- scripts/test-phase21.mjs
- scripts/test-phase210.mjs
- scripts/test-phase211.mjs
- scripts/test-phase212.mjs
- scripts/test-phase2124.mjs
- scripts/test-phase2126.mjs
- scripts/test-phase2131.mjs
- scripts/test-phase214.mjs
- scripts/test-phase216.mjs
- scripts/test-phase231.mjs
- scripts/test-phase239.mjs
- scripts/test-phase240.mjs
- scripts/test-phase28.mjs
- scripts/test-phase29.mjs
- scripts/test-recruitment-hardening2415.mjs
- src/features/projects/ProjectTeamWorkspace.tsx
- src/features/surveys/SurveyProjectDetail.tsx
- src/features/workforce/WorkforceMarketplace.tsx
- src/lib/supabase/database.types.ts
- supabase/migrations/20261013000490_recruitment_collection_consent.sql
- supabase/migrations/20261013000500_application_table_privileges.sql
- supabase/migrations/20261013000510_collection_definer_helper_permissions.sql
- supabase/migrations/20261013000520_case_worker_recruitment_consent.sql
- supabase/migrations/20261013000530_collection_project_date_guard.sql

## Final Git state

Working branch: codex/fieldlance-2.41.5-recruitment-hardening. All patch changes remain uncommitted for review. No existing user changes were present at baseline. No push/deploy or hosted changes.

## Pre-commit project-date correction

The final scope review detected that 00490 unintentionally removed the pre-existing inclusive UTC project-date predicate while replacing the optional-contract branch. No released or committed 2.41.5 version contained this regression. Forward migration 20261013000530_collection_project_date_guard.sql restores the project window without rewriting 00490-00520 or weakening accepted-contract authorization. Both today >= project.start_date and today <= project.end_date are required in addition to a currently valid accepted active contract. Administrative activation/scope management remains possible, but cannot bypass effective collection eligibility; historical reads, review permissions and revocation remain independent.

Date-boundary regressions cover current/future/expired projects, inclusive start/end today, date edits after acceptance, restoration, unchanged contracts, direct-only legacy denial and Project Manager/Area Focal/admin review. The same focused SQL assertions run with all migrations in PGlite and disposable PostgreSQL. Real local Auth/PostgREST coverage additionally checks project-date edits and legacy RPC non-bypass.

## Correction validation and commit readiness

- PASS: all 82 current migrations from scratch in isolated PGlite and a disposable real PostgreSQL database. The real database used the repository test harness minimal Auth/Storage scaffolding; this is not a full Supabase restore claim.
- PASS: identical transactional date-boundary assertions A-I in both engines. The real fixture transaction rolled back.
- PASS: negative control temporarily restored the old helper only in the disposable database; the future-project assertion failed as expected. Restoring 00530 made the suite pass.
- PASS: 00530 applied transactionally and registered in local poem-phase11; catalog comparison confirms only the project-date predicate was added to the function body.
- PASS: recruitment hardening (20 grouped checks plus suspension/staff assertions), date boundaries, effective/default grants, real local Auth/RPC/RLS recruitment and cleanup, case authorization (16), full database map regression (33) and map client checks.
- PASS: recruitment browser at 390px/reload, map browser and attendance browser.
- PASS: one uninterrupted npm test run of 95 expanded commands after correction (2362 seconds), database types, TypeScript, production build, release/metadata consistency and release-secret scan.
- Initial expanded legacy-row test failed because date + an untyped parameter was ambiguous. Explicit integer parameter casts corrected the fixture query; no assertion was removed or weakened. The focused rerun and subsequent complete npm test passed. Both failure and success logs are retained.
- Previously observed F14 offline-browser/network-wrapper failure remains separate and was not rerun or changed during this correction. Overall product release remains ON HOLD for separately scoped audit findings; this is distinct from patch commit readiness.

Logs: /home/noman/fieldlance-backups/2.41.5/validation-logs/date-correction/. The disposable PostgreSQL database was removed after validation. Local counts remain 18 accounts, 5 projects, 0 work assignments and 0 survey assignments; tagged HTTP fixtures were cleaned up. The original four migration hashes and recovery archive SHA-256 remain unchanged. No additional backup was needed for a function-body-only correction; the verified archive plus forward migrations remains the recovery path.

Final patch inventory: 48 candidate files (30 modified tracked, 18 untracked), including the new date test and fifth forward migration. Version remains 2.41.5. No F02/F03/F04/F05/F14 implementation, hosted changes, staging, commit, push or deployment is included.

Final read-only commit-readiness review: READY TO COMMIT. The complete 48-file candidate set remains limited to F01/F10, required fixture/tests, generated types and release documentation/metadata. Existing assertions are preserved or strengthened; older test adaptations establish accepted assignment setup rather than bypassing it. The four previously applied migration files are byte-for-byte unchanged, and 00530 is the next ordered forward migration. Package-lock changes remain version-only. Inventories and documentation match the final files. git diff --check and the secret/artifact scan pass; no staged files, backups, logs, browser artifacts or local Supabase state are included. Overall release remains ON HOLD separately.
