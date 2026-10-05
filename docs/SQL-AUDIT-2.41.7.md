# SQL migration and authorization audit

Baseline: 4a34139, branch codex/fieldlance-2.41.7-postdeploy-certification.
Scope: local application migration chain, PostgreSQL catalog/ACL/RLS, database
lint, generated types, database workflow regressions and live local integrations.
Hosted production is frozen; no hosted SQL, migration push/repair, Dashboard grant
change, commit or deployment is part of this audit.

## Verified findings and fixes

| ID | Finding | Evidence | Resolution |
| --- | --- | --- | --- |
| SQL-01 | Private canonical revision mutator inherited browser EXECUTE | New regression before the fix failed with “Missing expected rejection”: authenticated could insert a revision through capture_canonical_revision despite lacking direct table write permission | 00560 revokes PUBLIC/anon/authenticated EXECUTE on that helper and its internal trigger helper; owner operations remain allowed |
| SQL-02 | Anonymous task/capture table permissions exceeded actual workflows | Catalogs showed 9 anonymous INSERT/UPDATE/DELETE grants on three task tables, plus unnecessary SELECT on these tables and survey_capture_files; none has an anonymous workflow | 00560 removes anonymous table privileges; authenticated SELECT, RPC and service access remain unchanged |
| SQL-03 | Staff candidate directory RPC unnecessarily executable anonymously | Function ACL inherited PUBLIC EXECUTE; body already rejects callers without project-team management permission | 00560 revokes PUBLIC/anon EXECUTE while preserving explicit authenticated EXECUTE and the existing guard |

SQL-01 is a database-role boundary defect. app_private is not an exposed REST
schema, so the direct SQL reproduction is not evidence of public REST exploitation.
The trigger helper cannot be called as a normal SQL function; its unnecessary grant
is removed as part of keeping internal mutation helpers private.
SQL-02/03 are least-privilege improvements: existing RLS/body checks already denied
unauthorized application access. No data leak is claimed from those grants alone.

The intentional anonymous certificate verification RPC remains available.
Authenticated RLS predicate helpers and their required EXECUTE permissions remain.
Platform-managed creator defaults are unchanged. The previously recorded eight
high-risk defaults for supabase_admin-owned future tables remain a separate platform
policy follow-up, not grants on current application tables. Do not disable Dashboard
automatic grants blindly: the service-role dependencies documented in
UPGRADE-2.41.7.md still require an explicit-grant policy before that setting changes.
No hosted/default-policy approval is implied by this local audit.

## Catalog and chain verification

- All 85 migration filenames/versions match the local history, ending at 00560.
- All 84 historical migration files match baseline 4a34139 byte-for-byte.
- All 107 public tables have RLS enabled.
- Public invalid indexes: 0; unvalidated constraints: 0.
- Browser effective TRUNCATE/REFERENCES/TRIGGER/MAINTAIN: 0.
- No application SECURITY DEFINER function lacks its configured search path.
- After hardening, the only anonymous public SECURITY DEFINER entry point is
  verify_field_worker_certificate(text), an intentional public workflow.
- The real PostgreSQL helper test rolled back its users, person and revision.
- The new regression replays the full migration chain in an isolated PGlite
  database and verifies denial, trusted snapshot creation and retained API grants.

## Lint classification

The two crypto lint errors refer to statically inspected dynamic SQL in guarded
public.crypt/public.gen_salt fallback branches. The active extensions.pgcrypto
path was already verified with real hash/verify calls in post-deployment
certification. This grant-only change does not modify crypto behavior.

Existing warnings cover unused variables, compatibility parameters and implicit
casts of literal '{}' values to jsonb/integer[]. The casts are valid PostgreSQL
initialization; they are not failed availability/survey workflows. Retired review
RPC parameters are intentionally retained for compatibility, while their bodies
reject the retired workflow. Removing parameters would break RPC signatures.
No mass rewrite of applied functions is justified merely to suppress these warnings.

The previously proven funding reason ambiguity is already fixed by local forward
migration 00550 from the baseline; it is not reimplemented in this patch.

## Backup and boundaries

Before applying 00560, a custom PostgreSQL backup was written outside the repo:
 /home/noman/fieldlance-backups/sql-audit-20261005T050409Z/pre-00560.dump

SHA-256:
791a6243e0bc7ded3d16b9ef01603199818f2b137b215b8f526df899fa83cb92

pg_restore --list verified the archive. 00560 was applied with migration up --local.
No reset, restore, Storage schema edit, role-membership change or platform default
ACL mutation was performed. The backup and validation logs are kept externally.

## Regression coverage

test-sql-authorization.mjs is included in npm test. It asserts:
- authenticated cannot insert private revision snapshots;
- trusted owner can still capture a snapshot;
- both internal helpers lack anon/authenticated EXECUTE;
- anonymous table grants are absent while authenticated SELECT remains;
- staff RPC retains authenticated-only access;
- anonymous public certificate verification remains executable.

## Final validation results

Logs: /home/noman/fieldlance-backups/sql-audit-20261005T050409Z/

| Check | Result |
| --- | --- |
| Full npm run preflight (generated types, TypeScript, full regression chain, production build) | PASS, exit 0 |
| New SQL authorization regression | PASS; reproduced failure before the fix, denied after |
| Real PostgreSQL role test with rollback | PASS; unauthorized helper denied, trusted owner preserved |
| test:grants-2415 | PASS for current application grants; managed future-default policy still needs follow-up |
| test:local (Auth and actual Storage upload/download/isolation/delete/cleanup) | PASS |
| test:local-recruitment-2415 | PASS |
| test:local-workflow-2416 | PASS |
| Funding, offline recovery, analytics and full map regressions inside preflight | PASS |
| Database lint | NOT CLEAN: 2 existing guarded crypto fallback errors, 31 existing warnings; no new diagnostic |
| Metadata, release secret scan and git diff --check | PASS |
| Browser suites | Not rerun in this grant-only audit; prior baseline certification remains separate evidence |
| Hosted validation/deployment | Not performed; production freeze preserved |

The production build succeeds with the existing large-chunk warning (main chunk
511.53 kB). No frontend source, historical migration, dependency version or
production configuration changed. Generated database types remain current because
00560 changes ACLs only. The working changes are uncommitted; hosted application of
new local migrations requires a separate reviewed deployment decision.
