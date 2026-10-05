# FieldLance 2.41.7 upgrade

## Current production baseline and freeze

Production baseline is ebf12d1: GitHub main and Vercel Production are at that
commit (deployment identity supplied by the operator). Read-only linked migration
history verification confirms 00500–00540 applied, with no migration after 00540.
This work is post-deployment certification, not a pending 2.41.7 rollout.
Hosted production is frozen: no push, repair, rollback, reset, managed/default
grant change or hosted SQL change without separate approval.

00540_wallet_production_capability.sql is already deployed. It defaults wallet
sandbox enrollment and simulated provider operations to disabled, preserves
wallet/withdrawal records and manual settlement, and retains the provider RPC's
JSONB result contract. Do not reset or restore the local database.

The following portability/replay notes describe the historical pre-deployment
work. Their earlier blockers and pending migration list are not current hosted
deployment status.

The change was validated against the local poem-phase11 Supabase project. Its pre-migration custom-format backup is outside the repository at /home/noman/fieldlance-backups/2.41.7/pre-capability.dump; SHA-256: 8a41f5a3cabb9c5aa5f26e8b1a0b5e8edd15dff1ca50efd8a71a23dbb9474b94. pg_restore --list read all 2,789 TOC entries. No hosted Supabase project was changed.

## Authorized pre-production 00500 portability correction

This is an intentional source correction to an already locally applied migration,
not a new forward migration or a migration-history repair. Hosted production had
00490 applied; 00500 failed and rolled back before ever being recorded, leaving
00500–00540 pending. The user explicitly authorized this exception to the normal
immutable-migration rule. No hosted SQL, Dashboard setting, deployment, repair,
or commit was performed during this work.

00500 filters postgres/supabase_admin creator defaults with
pg_has_role(current_user, oid, 'USAGE'). It preserves every existing-table revoke
and alters only defaults whose owner privileges the executor actually possesses.
There is no privilege elevation, role-membership grant, or exception swallowing.
The previous source SHA-256 was
39c9022ccc0252fb674afb1feeccded7f8d6ff22cbc758f55ed3b83b8111adf6.
00520 remains unchanged with SHA-256
407a07e1bbd3c85f3ae08199f9ed34f2c88dfed3ef8080d1ac78113acaa7940e;
its historical blank-line-at-EOF issue remains a nonfunctional exception.

### Backup and local reconciliation

Verified custom archive:
 /home/noman/fieldlance-backups/2.41.7-portability/20261004T142956Z/pre-portability.dump

SHA-256:
12f47d34cd6fffa7c2df343405dde0391867e7b108684fe168e85c6120320f1e

The container's pg_restore --list verified the archive. After isolated replay,
the authorized local db reset --local --no-seed --yes applied all 83 migrations
through 20261013000540. Previous application data was not restored. Local history
therefore represents the corrected source, not a repaired timestamp over old SQL.

The CLI exited unsuccessfully during Storage readiness. Storage logged clean
shutdown at 14:34:58 UTC and successful startup at 14:35:42 UTC on 2026-10-04.
On continuation it was healthy, with restart count zero and OOMKilled=false.
Auth, REST and Storage through Kong each returned HTTP 200. No additional reset,
restore, configuration change or restart was needed. Evidence supports a transient
startup/readiness failure; the exact failed healthcheck response was not retained.

### Creator boundary and F10 regression

The original test used:
 BEGIN; SET LOCAL ROLE <owner>;
 CREATE TABLE public.fieldlance_2415_acl_probe(id integer);
 ...; ROLLBACK;

The session user was supabase_admin. The postgres iteration created a
postgres-owned table with current_user=postgres and no excessive privileges.
The supabase_admin iteration created a supabase_admin-owned table and inherited
eight grants: TRUNCATE, REFERENCES, TRIGGER and MAINTAIN for each of anon and
authenticated. pg_default_acl/aclexplode and the created table's relacl identify
the source as supabase_admin's public-schema table defaults. No global table
default entry or PUBLIC grant supplied them; the probe made no explicit GRANT.

The corrected migration needs no further change. The test now asserts the
enforceable postgres future-table invariant, retains all existing current-table,
Storage, RPC and service-role assertions, and separately reports managed policy
and probes it transactionally. It also restores excessive grants in a transaction,
executes the actual migration as non-superuser postgres, asserts all revokes,
checks postgres future defaults, verifies inaccessible managed defaults unchanged,
and rolls back. Managed-default policy is NEEDS FOLLOW-UP, never silently PASS.

### Automatic default-grant dependency audit

Verdict: NOT SAFE TO DISABLE for the repository's complete operational contract.
Do not change the Dashboard setting as part of this patch.

A separate PostgreSQL database replayed all 83 migrations with no automatic table
or sequence grants and with default PUBLIC function EXECUTE revoked. Comparing
effective catalogs with the local Supabase replay found:
- authenticated: no table CRUD or public RPC EXECUTE differences;
- anon: 13 table grants across capture metadata and three operational-task tables,
  plus EXECUTE on project_staff_candidates(uuid,text), disappear;
- anon and authenticated: 48 sequence privileges each disappear (16 sequences);
- service_role: 104 CRUD grants across 26 tables, 36 sequence privileges across
  12 sequences, and 261 public function EXECUTE grants disappear.

These differences are not all application requirements or grants to restore.
Browser writes generally use explicitly granted SECURITY DEFINER RPCs, whose
owners access sequences. Authenticated SELECT/RPC access is explicitly granted
through the chain. For example foundation grants SELECT and RPC EXECUTE; capture
migration grants authenticated SELECT and reserve/authorize RPC EXECUTE;
workforce scheduling explicitly grants authenticated SELECT and RPC EXECUTE.

A concrete required dependency is DELETE on operational_tasks for service_role
in test-local-recruitment2415.mjs and test-local-workflow2416.mjs cleanup.
The task-center migration grants authenticated access without an explicit
service_role grant. In the no-defaults database service_role SELECT on this table
reproduced permission denied; its DELETE privilege is also false. BYPASSRLS does
not replace table ACL permission.

The 26 tables lacking explicit service_role CRUD are:
survey_capture_files, work_payable_units, work_contract_amendments,
work_payable_receipts, work_payable_events, survey_template_drafts,
survey_template_review_events, survey_project_drafts, survey_project_review_events,
finance_payable_event_links, operational_task_sla_policies, operational_tasks,
operational_task_events, organization_invitations, organization_compliance_documents,
field_worker_reputation_reviews, field_worker_certificates, project_documents,
worker_availability_preferences, worker_availability_rules, worker_unavailable_periods,
project_attendance_policies, assignment_work_sessions, assignment_session_locations,
attendance_adjustments, attendance_events.

The exact catalog delta, including sequence and RPC signatures, is retained outside
the repository in default-grants-audit.json beside the backup. A separate explicit
grant policy audit must decide which administrative/service capabilities are
required before disabling defaults. Do not blanket-grant every catalog difference.

### Hosted state supersedes the former release gate

The former 00500–00540 pending/push procedure is retired: those migrations are
already applied remotely. Read-only migration listing confirmed the hosted head
is 20261013000540. No repair or repeat push is needed. Proposed 00550 is applied
only locally for certification and must not be deployed until review and approval.

### Historical continuation validation and Storage mismatch

A second fresh isolated PostgreSQL replay passed all 83 migrations through 00540.
All 1,872 application column/function/RLS-policy catalog entries matched the
reconciled local database. The local migration-history statements contain the new
00500 pg_has_role guard. Current public-table excessive privilege count is zero.

Live recruitment and workflow integration passed with disposable cleanup.
All six browser commands passed: recruitment, workflow, offline/device recovery,
network mismatch, maps, and online attendance. Transport-mocked browser results
are distinct from the live Auth/PostgREST results.

The separate actual Storage byte-upload test failed HTTP 500 / SQLSTATE 42P10.
The running image is public.ecr.aws/supabase/storage-api:v1.54.1. Its logged SQL
uses ON CONFLICT (name,bucket_id), but storage.objects has no unconditional
two-column unique index. The reset-installed storage migration 72,
drop-bucketid-objname-index, ran at 2026-10-04 14:34:46 UTC. Catalogs show only
objects_bucket_id_name_version_key (three columns), idx_objects_current_version
(partial archived_at IS NULL), and idx_objects_null_version (partial NOT
is_versioned), besides the primary key. None is an arbiter for that API query.
The verified pre-reset archive records Storage migrations only through 58; the running image also bundles tenant migrations only through 58, while the reset database is at 72. This establishes managed schema/image version skew. Thus healthy containers/HTTP health endpoints are insufficient: Storage writes
are broken by the managed schema/API compatibility mismatch. No managed-schema,
image, configuration, restore or restart correction was attempted.

DB lint returned 3 errors and 31 warnings across 21 functions. Two errors name
missing public crypto functions in guarded fallback branches; extensions.pgcrypto
exists and an actual hash_withdrawal_pin call succeeded. The third is an ambiguous
reason reference in release_project_funding_commitment, from unchanged historical
SQL. It was unresolved at that stage; the forward correction is recorded below.

Full preflight passed generated-type consistency and TypeScript, then failed the
existing test-offline-recovery276.mjs:33 assertion: actual "Must not replace
original", expected "Synthetic child". This is the previously recorded offline
recovery failure signature; no offline source or assertion was changed here.
It is not evidence that the ACL correction caused an offline regression.
Remaining full-suite tests and the chained production build were not completed.
At that stage certification was blocked by functional Storage health. The
post-deployment alignment below resolves that mismatch without reset or restore;
the reset database and original backup remain preserved.

## Post-deployment local corrections

The certification branch starts at ebf12d1. No historical migration was edited.

### Storage service alignment

Installed Supabase CLI 2.100.0 reports Storage v1.77.5 as the expected local
service version. The cached image bundles migrations through 0072 and pg.js:846
selects ON CONFLICT (bucket_id, name COLLATE "C") WHERE archived_at IS NULL when
objects-current-version-index is present. This matches the existing schema.

Only supabase_storage_poem-phase11 was replaced: v1.54.1 to v1.77.5, digest
sha256:4ae1890ba0c6fd24d975c34f3aa201a01d410171c8ba6eddeb675ef92341a62d.
The named data volume, connection settings and network address were preserved.
Image-provided runtime environment defaults were aligned with the new image;
migration freeze is drop-bucketid-objname-index. No managed SQL/index/history
was edited. Storage history remains 73 rows (IDs 0–72).

The old container is retained stopped as
supabase_storage_poem-phase11_preserved_v1541. Its private inspection/recovery
record is outside the repository under
/home/noman/fieldlance-backups/2.41.7-postdeploy (mode 0600; contains local settings).
Do not start the old incompatible image against the current schema.

Actual local Auth/Storage E2E passes: User A upload, byte-identical download,
User B denial, User A delete and failed read after delete. Test users and metadata
were cleaned; no unexpected 5xx/server errors appeared in the aligned service
logs. Expected denied/missing-object requests return Storage 400 errors.

### Offline regression diagnosis

test-offline-recovery276.mjs:33 assumed Promise.all invocation order determined
the persisted payload. Encryption completes asynchronously across tabs; holding
the first encryption reproduced the failure deterministically. Production code's
readwrite transaction preserves the first persisted row, not the first invocation.
The corrected harness establishes an original before racing retries and separately
forces reverse encryption completion across modules, asserting the first persisted
payload survives and the queue contains exactly one record. Existing owner,
recovery, discard, retry and corrupt-cipher assertions remain. Nine cases pass;
no offline production code changed.

### Funding correction and crypto lint diagnosis

A new manual-release regression proved SQLSTATE 42702: local variable reason
collides with project_funding_commitments.reason in release_reason=reason.
New forward migration 20261013000550_funding_commitment_release_reason.sql only
renames the local variable to release_reason_value. Signature, authorization,
ownership, grants and state rules are unchanged. Seven funding-assurance cases
pass, including permission denial, trimmed submitted reason, preserved original
reservation reason, idempotent repeat call, and one correctly contextualized audit
event. The regression transaction rolls back before the existing expiry/closure
checks. 00550 was applied locally with migration up --local; hosted remains 00540.

The crypto lint errors inspect dynamic public.crypt/public.gen_salt fallback SQL.
Both functions first choose extensions.pgcrypto when available; that extension
exists locally, readiness is true, and actual PIN hashing succeeds. These guarded
fallback diagnostics do not justify changing historical migrations or widening
grants. No crypto SQL correction is proposed.

### Final post-deployment certification results

- Full npm run preflight: PASS (generated types, TypeScript, complete npm test,
  production Vite build and offline-shell checks; process exit 0).
- F10/test-grants2415: PASS for enforceable current-table/postgres defaults;
  managed supabase_admin future defaults remain separately NEEDS FOLLOW-UP.
- Actual Storage E2E: PASS, including explicit not-found after deletion.
- Live recruitment and workflow integration: PASS with cleanup.
- Funding assurance: 7 scenarios PASS; actual PostgreSQL release/idempotency and
  crypto hash/verify also passed in a rolled-back transaction.
- Offline recovery: 9 scenarios PASS, plus 10 consecutive deterministic runs
  (90 case executions); full preflight also passes the corrected harness.
- All six browser commands: PASS (offline/device, network mismatch, map,
  attendance, recruitment and workflow). Browser transports are simulated;
  actual Auth/PostgREST/Storage verification is reported separately.
- Metadata, release consistency and secrets checks: PASS.
- DB lint completes but is not clean: 2 diagnosed guarded crypto-fallback errors
  and 31 existing warnings; the funding ambiguity is gone.
- Production build: PASS, existing 511.42 kB main-chunk warning remains.
- git diff --check: PASS. All 83 historical migration files match ebf12d1 bytes.
  Generated database types and package versions are unchanged.

Validation logs are outside the repository in
/home/noman/fieldlance-backups/2.41.7-postdeploy. The original pre-portability
backup remains preserved. No commit, merge, push, deploy, hosted SQL change,
migration repair, reset, restore or Dashboard grant change was performed.
The local corrective candidate is validated for review; deployed production still
ends at 00540 and does not include the proven funding correction in local 00550.
