# POEM 2.3.1 — combined stabilization patch

This patch upgrades the audited 2.3.0 application in place. It adds no new business phase. It preserves the existing Supabase project identity and seven historical migrations.

## Included

- Domain components under `src/features`: auth, volunteers, organizations, geography, surveys, registry, assistance, needs, workforce, notifications and audit. Shared form fields and Supabase client/types have explicit homes. The former Phase12–Phase23 modules are removed by the guarded installer.
- Existing JSX is extracted and formatted, rather than rewritten. Registry identity/matching and assistance panels now have separate state and queries. The workspace shell remains a larger orchestration component; further extraction should follow the domain being changed.
- Survey modules load on demand. Header/footer version comes from package.json.
- Only POEM Admin/Super Admin can assign NGO memberships. NGO Managers can still onboard organizations and maintain operations. Existing memberships are preserved and must be reviewed separately.
- A reviewer can revoke a surveyor assignment after collection closes. Activating an assignment still requires an active project.
- Survey save requires a request UUID. Database receipts serialize actor/request pairs and return the original result on identical retries. Changed payloads under the same key fail. Current project access is rechecked on replay. The old public save signature is removed.
- Survey form preserves an immutable request during uncertain replies, disables editing, and exposes an unchanged retry. SQL validation errors release the request so the user can correct the form. Success refreshes the response list.
- Composite foreign keys enforce person/household/project and needs/assistance/source consistency even for privileged writes. Existing link scope is backfilled without rewriting historical snapshots.
- Additional SQL regression tests, a local HTTP/concurrent operations test, a read-only scope diagnostic and guarded deletion/backup support in the patch installer.

## Boundaries and remaining work

This is still an online pilot. The retry reference survives only while the form stays mounted: leaving the workspace or reloading loses it. It does not perform fuzzy deduplication or prevent intentionally starting the same person twice with different request keys. Reopen/search existing responses after abandoning an uncertain save. No beneficiary PII is saved into browser local storage by this feature.

The shell still loads supporting datasets with existing caps (organizations/accounts, memberships, assignments/templates and geography). Pagination and query-on-demand across all supporting selectors remain follow-up work. Older profile/admin form models still contain `any`; new operational table types come from migrations. This release does not claim complete API/hook separation or rewrite all shared UI primitives.

Full sensitive-read auditing, malware scanning/quarantine, consent withdrawal/retention workflows, exports, fine-grained POEM staff role separation, offline sync, merge/unmerge, payment operations and production monitoring remain outside this stabilization patch. Database RLS is preserved; frontend folders are not a security boundary.

## Upgrade behavior

Use the guarded installer, not unzip-overwrite. It checks every replacement/deletion before writing, preserves an appended README suffix and synchronized dependency updates, and backs up source files it changes. User-edited phase files stop the patch before any source mutation; merge those edits rather than forcing deletion.

The new migration validates existing references. If invalid data already exists, it fails rather than silently changing ownership. Run `docs/STABILIZATION-SCOPE-CHECK.sql` against your intended database before upgrading. Resolve each returned inconsistency with a reviewed correction. Review existing NGO Manager memberships for least privilege; their presence alone does not prove misuse.

Deploy backend and frontend as one maintenance update. Users must finish pending forms and reload after deployment because the old survey save RPC signature no longer exists. Take a database backup separately: the source installer cannot back up or roll back a database. Do not run older frontend code against the new migration to roll back.

## Frontend acceptance checks

1. Sign in as volunteer, NGO reviewer, NGO Manager and POEM Admin. Check each workspace and existing profile/documents flow.
2. NGO Manager sees organization operations but no membership editor; POEM Admin can grant membership.
3. Create draft, reopen and submit; approve with a different reviewer; inspect provisional identity.
4. Interrupt the response to a save, retry unchanged without leaving the form, and confirm one person, household and response.
5. Review registry identity and match history, record assistance, link a need, mark met, then void assistance and check needs_review.
6. Close project, revoke collector assignment, and confirm stale collector session loses access.
7. Verify narrow/mobile layouts, keyboard focus and lazy-loading behavior.

Real browser acceptance is a release gate, not implied by a successful TypeScript build.
