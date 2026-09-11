# POEM Phase 1.3

Standalone React + TypeScript + Vite frontend with Supabase Auth and PostgreSQL. Designed for local WSL development with a local Supabase Docker stack. Independent of the earlier Sites-backed source snapshot.

**Start here:** [WSL setup](docs/SETUP-WSL.md).

**Existing Phase 1.2 users:** follow [safe upgrade instructions](docs/UPGRADE-1.3.md). Keep your existing project folder and database.

**New in this release:** [Phase 1.3 scope, permissions and checklist](docs/PHASE-1.3.md). Search/filter volunteers in 50-record pages, manage NGO operating areas/programs, maintain private shortlists and assign separate staff roles.

## Included

- Email/password signup, confirmation, login, logout and password recovery.
- Safe signup defaults: new accounts are volunteers; client metadata cannot grant admin access.
- POEM Super Admin / POEM Admin, NGO Admin memberships and volunteer workspaces.
- CV-style profile drafts, submissions, review feedback and L0/L1 verification display.
- Editing invalidates previous approval; optimistic version checks reject stale saves/reviews.
- NGO registration, operational status and assignment of registered accounts to organizations.
- One account can belong to multiple NGOs; explicit workspace switching.
- Volunteer-controlled full-profile sharing to individual NGOs, with revocation.
- Database-enforced permissions, active-account checks, protected RPC mutations and audit events.
- Admin geography manager and cascading volunteer location selection.
- Private PDF/JPG/PNG volunteer documents with upload recovery, removal and POEM review.
- Verification checklist and document-review gates; evidence changes invalidate approval.
- In-app notifications with recipient-only read access.
- Local first-Super-Admin bootstrap helper, `.env.example`, locked npm dependencies and validation scripts.

## Important boundaries

- This is a development foundation. It is not the full POEM roadmap or a certified production release.
- App accounts are active after email confirmation; POEM approval applies to submitted volunteer profiles. NGO memberships are assigned by POEM. Account suspension is separate from profile verification.
- UI terminology “verified” means profile review only, not verified identity, completed training, or reliable survey performance.
- NGO “active” is operational approval, not document verification. Registration documents are not uploaded in this release.
- NGO sharing covers the full volunteer profile; field-level beneficiary sharing is a later module. Sharing is optional and independent of POEM review. Past viewed/copied data cannot be recalled.
- Geography is admin-maintained with fixed province/division/district/taluka/UC/village-or-ward levels. No authoritative geographic data is bundled; create a sourced hierarchy before new submissions. Existing approvals survive upgrade until edited/reviewed.
- No survey builder, beneficiary registry, assistance ledger, payments, automatic performance scoring, PWA/offline collection, SMS or email notifications beyond Auth.
- No migration/import from the older Cloudflare/Sites database is included.
- Volunteer directory uses server-side filters and 50-record pages with authorized counts. Supporting UI lists still cap at 500 accounts/organizations, 1,000 memberships/shares and 100 events; keep the operational pilot within those supporting-list caps.
- Database revocation takes effect on the next request; already rendered data is not remotely erased. Refresh the UI after account, membership, organization or grant changes.
- Never put service-role keys or server secrets into any `VITE_*` variable. The build includes a check for common secret-key mistakes.

## Commands

```bash
npm ci
npx supabase start
npx supabase migration up --local
npm run env:local
npm run dev
```

Requires Node 24 (see `.nvmrc`) and Docker for local Supabase. Frontend runs directly in WSL. No extra Dockerfile is required for this phase.

## Checks

```bash
npm run check
npm test
npm run build
npm run test:local
```

The first three were run in the build environment. `npm test` runs the real SQL migration and RLS workflows using embedded PostgreSQL (PGlite) with a simulated Auth schema and JWT subject. The 26 foundation tests, 19 document/geography regression tests and 22 Phase 1.3 tests simulate Auth and Storage metadata; they do not verify actual Auth or Storage HTTP services. `test:local` verifies real local Auth/API and private Storage upload/download/removal once Docker is running; it is supplied for local execution and was not run in this environment.

## Documentation

- [WSL setup and first admin](docs/SETUP-WSL.md)
- [Permission matrix](docs/PERMISSIONS.md)
- [Data model and next phases](docs/ARCHITECTURE.md)
- [Release files and manual checks](docs/RELEASE-CHECKLIST.md)

## Official implementation references

- [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)

These references informed the local CLI setup, database access controls and Auth recovery flow. Browser UI testing, external email delivery and production deployment remain separate verification steps.

Document controls and release limits: [Phase 1.2 architecture](docs/ARCHITECTURE.md). No server-side malware scanner is included. Public rollout needs a scanning/quarantine workflow and a retention policy.

[Supabase Storage access controls](https://supabase.com/docs/guides/storage/security/access-control) and [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets) informed the private upload workflow.
# povo23
