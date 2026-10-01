# FieldLance 2.41.5 - Recruitment & Authorization Hardening

Scope: F01 and F10 only. Overall product release remains on hold for the other audit findings.

## Collection invariant
A Field Worker must have an active work assignment for the same project, organization and worker, with a non-null worker-response timestamp. A stored active survey assignment alone is insufficient. Collection still requires an active account, eligible project and organization, non-suspended profile, project and contract dates, allowed moderation and current governance policy.

Both survey-assignment RPCs and a table trigger enforce accepted-contract eligibility. Revocation remains possible. The compatibility collection helper also denies legacy rows. The self-only can_collect_project RPC exposes effective eligibility without exposing another worker's authorization. Administration, historical reading, independent review, moderation and project-staff authority retain their separate rules.

Field Worker beneficiary-case delegation follows the same contract requirement. Area Focal delegation retains its existing role and area checks.

## Frontend
The direct operational override and worker-search activation form are removed. Project details show recruitment guidance, truthful historical access labels, accepted-contract scope management and revocation. Start survey uses server eligibility. Marketplace history no longer labels direct records as active collection rights or includes them in active-contract counts. Project-team counts are explicitly survey-record counts.

## Database privileges
Browser roles lose TRUNCATE, REFERENCES, TRIGGER and PG17 MAINTAIN where inherited defaults had left them on application tables. Capture metadata INSERT/UPDATE/DELETE is reserved to existing definer RPCs. Required CRUD, Storage access, RPC EXECUTE, service-role access and object ownership remain intact. Public-table defaults for postgres and supabase_admin no longer recreate the removed privileges.

## Historical records
The pre-migration local inventory found zero active invalid survey assignments, zero affected projects and zero affected workers. In-memory upgrade tests preserve deliberately seeded legacy rows while denying their effective collection rights. No acceptance, contracts or compensation snapshots were manufactured in the existing development database.

Other environments must inventory their records before upgrading. Leave historical rows intact; workers who still need collection must complete normal recruitment and accept real terms. Scope/revocation controls must not be used to invent acceptance.

## Pre-commit project-date correction

The final scope review detected that 00490 unintentionally removed the pre-existing inclusive UTC project-date predicate while replacing the optional-contract branch. No released or committed 2.41.5 version contained this regression. Forward migration 20261013000530_collection_project_date_guard.sql restores the project window without rewriting 00490-00520 or weakening accepted-contract authorization. Both today >= project.start_date and today <= project.end_date are required in addition to a currently valid accepted active contract. Administrative activation/scope management remains possible, but cannot bypass effective collection eligibility; historical reads, review permissions and revocation remain independent.

Date-boundary regressions cover current/future/expired projects, inclusive start/end today, date edits after acceptance, restoration, unchanged contracts, direct-only legacy denial and Project Manager/Area Focal/admin review. The same focused SQL assertions run with all migrations in PGlite and disposable PostgreSQL. Real local Auth/PostgREST coverage additionally checks project-date edits and legacy RPC non-bypass.
