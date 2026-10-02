# FieldLance 2.41.6 implementation report

**Patch verdict: READY TO COMMIT. Overall product release: HOLD (F03 and F14).**

## Implementation status and baseline

Completed F02 funding retry reliability, F04 unsaved authoring protection and F05 recruitment exact reads/pagination. Work remains uncommitted on codex/fieldlance-2.41.6-workflow-reliability, based on e7a009d (completed 2.41.5). The initial working tree was clean.

All shell work used Ubuntu WSL in /home/noman/projects/poem-phase1.1. Node v24.21.0 / npm 11.19.0 were selected through nvm; .nvmrc pins major 24. Local Supabase identity is poem-phase11, API 55321 and database 55322. No hosted Supabase, service start/stop, reset, stage, commit, push, merge or deployment was performed.

## Root causes and exact solutions

| Finding | Root cause | Implemented correction |
| --- | --- | --- |
| F02 | Every submission generated a new key; the error-catching wrapper still allowed unconditional form reset. Reserve/release can reject balance checks before reaching idempotency replay. | Retain a normalized request/key before sending, restore it from account-scoped session storage, lock replacement submissions, reconcile uncertain results through existing journal SELECT/RLS, and expose explicit same-request retry. Confirmed rejection preserves input; confirmed success clears pending state and resets the submitting form. |
| F04 | beforeunload did not cover SPA unmounts; sticky dirty flags were inconsistent with saved/reverted content. | Shared snapshot-based dirty state and Stay/Discard decision covering navigation, workspace/sign-out, draft changes and history. Preserve existing field-draft flush restoration. Native modal plus focus wrapping, Escape and true reload protection. |
| F05 | Focus only searched capped lists, so older actionable records disappeared; large collections had no continuation. | Exact application/assignment and related project/opportunity reads through current RLS, independently of 50-row keyset pages. Pin/focus current routed records, expose unavailable/error/retry states, and keep old selected applications usable for formal offers. |

See PHASE-2.41.6.md for lifecycle details and explicit limits. Session storage preserves funding identity within the browser tab/session, not after closing that session or clearing storage. Browser transport fixtures are separate from real local integration evidence.

## Validation results

All rows below are final PASS results. The uninterrupted full npm test run and required targeted checks passed before versioning. Types, TypeScript, production build, new browser tests, metadata/release consistency, secret scan and diff check passed again after versioning.

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| npm run test:funding-retry-2416 | PASS | Complete migration schema in isolated PGlite plus actual production retry helper; receipt/replay/payload mismatch/lost commit/rejection/release/isolation. |
| npm run test:browser-workflow-2416 | PASS | Actual AppShell and changed React components; native beforeunload, keyboard, dirty navigation, funding uncertainty/reload and 201/501 recruitment records. Final pre-version run 12 and post-version run passed. |
| npm run test:local-workflow-2416 | PASS | Real local Auth/PostgREST/RPCs, exact reads/RLS, actual timestamp/UUID keyset syntax and strict boundary, formal acceptance, date guard and cleanup. |
| npm run test:recruitment-hardening-2415 | PASS | 20 hardening checks; repeated in full suite. |
| npm run test:collection-dates-2415 | PASS | All-migration A-I date scenarios; repeated in full suite. |
| npm run test:grants-2415 | PASS | Real PostgreSQL effective grants, Storage/RPC access and both migration-creator default ACLs on confirmed local postgres. |
| node scripts/test-phase2171.mjs | PASS | Existing funding/accounting protection retained. |
| node scripts/test-phase2172.mjs | PASS | Existing payable-to-finance bridge. |
| node scripts/test-phase212.mjs | PASS | Existing payable workflow. |
| Finance/payment scripts 217 through 2183 in npm test | PASS | Full existing payment sequence, including unchanged assertions. |
| npm run test:case-ownership-239 | PASS | Case-worker contract eligibility and role isolation. |
| node scripts/test-phase216.mjs | PASS | Capacity/assignment controls. |
| npm run test:auto-marketplace-2381 | PASS | Published-project automatic visibility. |
| npm run test:notification-routing-2413 | PASS | Notification/deep-link routing. |
| npm run test:correctness-2414 | PASS | Existing exact-task/attendance/notification corrections. |
| npm run test:browser-recruitment-2415 | PASS | Existing formal recruitment browser fixture. |
| npm run test:browser-attendance-2414 | PASS | Existing attendance browser regression. |
| npm run test:browser-map-2411 | PASS | Existing map browser regression. |
| npm run test:routing-236 | PASS | Existing routing assertions adapted to shared history implementation. |
| npm run types:check | PASS | Generated database types match all migrations; file unchanged. |
| npm run check | PASS | TypeScript. |
| npm run build | PASS | Production assets and field-worker build checks; existing large-chunk warning remains non-fatal. |
| npm run release:consistency | PASS | Inventories and seven release consistency checks at 2.41.6. |
| npm run check:release-secrets | PASS | No release secret violation. |
| npm test | PASS | Final uninterrupted sequence: 96 expanded commands, including all 33 map regression scenarios. |
| git diff --check | PASS | No whitespace errors. |

Mobile browser coverage uses 360, 390 and 430px for funding/recruitment and authoring layout; the authoring interaction sequence also exercises the real mobile navigation drawer. Tests do not claim an exhaustive native-device audit.

### Earlier failures and unresolved gates

- **FAIL, earlier run only:** unchanged test-offline-recovery276.mjs concurrent enqueue ordering assertion. Test and offlineSurveyStore.ts are byte-for-byte identical to HEAD; five isolated committed-baseline runs passed. The final full suite also passed unchanged. This intermittent baseline runtime failure is distinct from F14 and was not repaired or suppressed.
- **FAIL, corrected:** an existing phase2124 source assertion required double quotes around the survey_assignments table call. The source's original spelling was restored; its assertion was not changed.
- During browser development, Stay initially left the mobile drawer covering the editor and keyboard traversal could escape the confirmation controls. Both were corrected and are covered by the final browser tests. Fixture stylesheet, prompt-default and canceled-reload handling were corrected to exercise actual application behavior.
- **F14: known prior FAIL, NOT RERUN here.** Offline browser deep-link/native connectivity mismatch remains outside scope; scripts/test-browser241.mjs and offline production modules are unchanged.
- **BLOCKED: overall real-world release.** F03 wallet verification/production payout and F14 remain unresolved P1 findings. Other audit findings were not implemented by this patch.
- No final required 2.41.6 check remains FAIL or BLOCKED.

## Live integration and 2.41.5 protection

Real local tests verified automatic marketplace publication, application-scoped consent without permanent profile sharing, organization review, formal offer, acceptance, duplicate-acceptance safety, exact application/assignment reads, cross-organization/nonexistent results and actual keyset query boundaries. Future/expired project edits remove collection eligibility without changing the accepted contract; administrative legacy calls cannot bypass it. Revocation still removes eligibility.

The local test creates uniquely tagged disposable fixtures and removes only those IDs in finally. Final local integration cleanup passed. A direct state check also found zero 2.41.6 fixture accounts/projects/organizations. No persistent finance journal fixture was written to the live database.

The complete schema tests preserve contract dates, geography, capacity, moderation, case-worker eligibility and role isolation. Actual PostgreSQL grant checks preserve F10. The frontend changes do not authorize collection.

## Migrations, types, versions and backups

- No new migration was necessary: existing journal SELECT/RLS and exact recruitment reads suffice.
- All 82 migration files match HEAD byte-for-byte; local migration head remains 20261013000530.
- database.types.ts is unchanged and passes types:check.
- Package and lockfile root versions were changed from 2.41.5 to 2.41.6 only after required validation passed. The lockfile diff contains only its two root version values; dependencies and engines are unchanged.
- README/current release notes and deterministic FILES.txt, project-tree.txt and PROJECT_ANALYSIS_CONTEXT.txt were updated. Inventory additions correspond only to the twelve new patch files.
- No new database backup was needed for this frontend-only patch. The existing archive remains outside the repository at /home/noman/fieldlance-backups/2.41.5/pre-hardening.dump.
- Verified archive SHA-256: 9411347ca8a412b71ca87b453aef414e34fd17a9b99eec18663b180dc26e8a17.

## Commit-readiness review

Every modified and untracked candidate file was inspected, including actual diffs and complete new source/test/fixture files. Scope is F02/F04/F05 plus tests, inventories and related release documentation. No F03/F14/P2/P3 implementation, dependency churn, migration rewrite, generated-type drift or unrelated feature work was found.

The only older test changed is test-phase236.mjs: its source assertions now inspect the extracted shared history guard rather than the removed inline implementation. It still requires history registration, draft flush, failed-navigation restoration and entity focus; new browser tests verify the actual behavior. No accounting, collection or RLS assertion was weakened. The older phase2124 assertion was preserved unchanged.

All 31 files in the manifest below are recommended for this patch: 19 tracked modifications and 12 new files. There are no optional/redundant or do-not-commit files inside this candidate set. PHASE explains design, UPGRADE gives operational limits/commands, VALIDATION defines coverage and this report records evidence; they have separate purposes.

Do not add ignored local .env, node_modules, dist, Supabase temporary state, external validation logs or backups. No secret, dump, log, screenshot, temporary browser artifact or disposable validation data is in the candidate set. Browser build directories are created under the system temporary directory and removed by the harness.

### Exact final file manifest / Git status

~~~text
 M FILES.txt
 M PROJECT_ANALYSIS_CONTEXT.txt
 M README.md
 M docs/ARCHITECTURE.md
 M docs/PERMISSIONS.md
 M docs/RELEASE-CHECKLIST.md
 M docs/VALIDATION.md
 M package-lock.json
 M package.json
 M project-tree.txt
 M scripts/test-phase236.mjs
 M src/app/AppShell.tsx
 M src/app/routes.ts
 M src/features/finance/ProjectFundingWorkspace.tsx
 M src/features/projects/ProjectWorkspace.tsx
 M src/features/surveys/SurveyProjectDrafts.tsx
 M src/features/surveys/SurveyProjects.tsx
 M src/features/surveys/SurveyTemplates.tsx
 M src/features/workforce/WorkforceMarketplace.tsx
?? docs/IMPLEMENTATION-2.41.6.md
?? docs/PHASE-2.41.6.md
?? docs/UPGRADE-2.41.6.md
?? docs/VALIDATION-2.41.6.md
?? scripts/fixtures/workflow2416/client.js
?? scripts/fixtures/workflow2416/main.jsx
?? scripts/test-browser-workflow2416.mjs
?? scripts/test-funding-retry2416.mjs
?? scripts/test-local-workflow2416.mjs
?? src/features/finance/fundingRequest.ts
?? src/features/workforce/recruitmentQueries.ts
?? src/shared/authoringNavigation.tsx
~~~

The index is empty. HEAD remains e7a009d. No files were staged, committed, pushed or deployed. git diff --name-status and git diff --stat cover the tracked modifications; the explicit untracked manifest above completes the candidate set.

## Evidence and follow-up Bash commands

Evidence logs are outside the repository:
 /home/noman/fieldlance-backups/2.41.6/validation-logs/

Key records: full-npm-test-3.log (exit 0), browser-workflow-12.log, local-workflow-final.log, target-results.json, final-target-results.json, post-version-results.json and offline-baseline-results.json. Earlier failed logs are retained separately.

Run through Ubuntu WSL:
~~~bash
cd /home/noman/projects/poem-phase1.1
source ~/.nvm/nvm.sh
nvm use
git status --short
git diff --check
git diff --stat
git diff --name-status
find scripts/fixtures/workflow2416 -type f -print
npm run release:consistency
~~~

These are review commands; staging/commit/deployment remains a separate user action. The patch is READY TO COMMIT, while overall FieldLance release remains HOLD for F03/F14.
