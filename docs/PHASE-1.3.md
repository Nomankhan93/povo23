# POEM Phase 1.3 — Volunteer Directory & NGO Operations

## Delivered

- Server-side name, skill, language, availability, review status and geography filters. A geographic filter includes all descendants. Filters use literal case-insensitive substring matching for text; `%` is literal, not a wildcard. Skills/languages remain free-text CV fields.
- Fixed 50-record pages, stable name/user-ID ordering, exact authorized matching total, previous/next controls. Overview no longer presents the old capped arrays as platform totals. Initial workspace loading fetches only the current user's profile rather than up to 500 CVs.
- NGO districts/talukas and programs stored in relational tables, with bounded lists and optimistic versions. An NGO Manager or legacy Admin/Super Admin manages these; NGO Admins read them. Historical free-text `areas` and `programs` are preserved as legacy descriptions and are not automatically guessed/imported.
- Per-NGO shortlist, considering, selected and not-selected states with private notes. Selection is internal planning, not an invitation, assignment or contract. No automated match score is shown.
- Volunteer Manager, NGO Manager and Auditor platform roles, assigned only by Super Admin. Existing Admin and Super Admin roles retain their prior broad permissions for compatibility. Review staff assignments deliberately; no automatic conversion occurs.
- Public-schema TypeScript definitions generated from PostgreSQL catalogs after applying all migrations. Typed Supabase client and RPC arguments. JSON response payloads remain JSON; the directory defines its explicit application result shape.

## Access matrix

All accounts retain their own volunteer workspace. The matrix below describes additional staff privileges.

| Capability | Volunteer Manager | NGO Manager | Auditor | Admin | Super Admin |
| --- | --- | --- | --- | --- | --- |
| Global volunteer directory / CV review | Yes | No | No | Yes | Yes |
| Other volunteer documents / review | Yes | No | No | Yes | Yes |
| Manage NGOs, operating areas, programs, memberships | No | Yes | No | Yes | Yes |
| Manage geography | No | Yes | No | Yes | Yes |
| Audit history | Volunteer workflow events | Organization events | All | All | All |
| Assign staff roles / suspend accounts | No | No | No | No | Yes, other accounts |

NGO membership permissions are independent. Even platform staff need an active NGO Admin membership plus an explicit profile grant to act in that NGO's shortlist workspace. A staff role by itself does not expose another NGO's private shortlist notes. Auditor is read-only for governance records but can still edit their own personal volunteer profile. Audit history can contain historical review notes; audit access is itself privileged.

Directory search is a security-invoker function with RLS plus explicit organization scope. A person working for NGO A and NGO B sees only the selected NGO's grants in each search. Counts use the same scope. NGO membership/organization/account suspension blocks subsequent requests. Profile suspension hides it from NGO directories. Revoking a profile-sharing grant deletes the corresponding private shortlist row and note; regranting does not restore them. Minimal audit events remain, without the private note. No hard deletion of volunteer identity or survey history occurs.

## Schema / source changes

New tables: `organization_areas`, `organization_programs`, `volunteer_shortlists`.
New organization column: `operations_version`.
New RPCs: `search_volunteers`, `save_ngo_operations`, `save_shortlist`.
Existing policies and guarded RPCs now use separate volunteer, NGO and audit capabilities. The two previous migration files remain byte-identical.

`src/Phase13.tsx` provides the directory and lazy-loaded NGO operations editor. `scripts/generate-types.mjs` derives the committed `src/database.types.ts` from the applied migrations in PGlite. Run `npm run types:generate` after schema changes; `npm run types:check` fails if definitions drift. This generator is deliberately limited to the types used in this project; future enums, relations or complex function return types need generator support. It is not the Supabase CLI generator.

## Remaining boundaries

Directory pagination is implemented, not a claim that every screen is paginated. Supporting account/NGO lists still cap at 500, memberships/shares at 1,000 and activity/notifications at 100. Keep the pilot within those supporting-list limits. Geography is fetched in batches but shown in native selectors; large nationwide datasets will need search controls. Deep directory pages use offset pagination and exact counts; test performance with realistic data before large rollout. Concurrent changes between pages may shift results; refresh returns the current dataset.

No browser UI, real Docker Auth/Storage HTTP or deployment was executed during packaging. No malware scanner, field survey engine, beneficiary registry, contracts or performance score is added in this phase. Prior private-document and consent/retention limitations still apply. Documents shown as accepted reflect a staff review, not verified legal identity.

## Manual acceptance

1. Apply the Phase 1.3 migration without resetting data. Login as the existing Super Admin.
2. Assign three test accounts Volunteer Manager, NGO Manager and Auditor. Confirm navigation and direct API access match the matrix.
3. NGO Manager adds active district/taluka operating areas and programs. Save the same organization from an old tab and confirm stale writes are rejected.
4. Volunteer Manager searches by name, skill, language, availability, geography and status; test an ancestor area and empty results. With 51+ matches, navigate both pages.
5. Volunteer shares with NGO A only. NGO A can search/view/shortlist; NGO B cannot.
6. Create shortlist notes, change selection status, and reject a stale second-tab update.
7. Revoke sharing. Refresh the directory; both profile and shortlist disappear. Regrant does not recover deleted shortlist notes.
8. Suspend membership/organization/account and verify future API requests fail. Previously viewed data is not remotely erased.
9. Regression-check document upload, review, checklist approval, download and removal, plus email login/recovery.
10. Check narrow-screen filters, page controls, workspace switching and error messages in your browser.
