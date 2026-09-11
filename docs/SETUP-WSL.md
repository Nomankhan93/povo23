# POEM Phase 1.3 — WSL setup

Fresh installation instructions. Existing Phase 1.2 users must use UPGRADE-1.3.md instead. This is a standalone project. It does not depend on ChatGPT Sites, Cloudflare D1, or the old `poem-release-a` folder. It does not automatically migrate records from the previous Sites build.

## 1. Prerequisites

- WSL2 Ubuntu with Docker Desktop running and WSL integration enabled for this Ubuntu distribution.
- Node 24 through your existing NVM installation.
- `unzip`, Git, and internet for npm packages and the first Docker image download.
- Enough free disk space for the Supabase images and database. Do not run every other local Supabase project simultaneously on a low-memory machine.

Use WSL (not PowerShell):

```bash
mkdir -p ~/projects
unzip -n "/mnt/c/Users/noman/Downloads/poem-phase1.3.zip" -d ~/projects
cd ~/projects/poem-phase1.3
nvm install 24
nvm use 24
npm ci
docker version
```

The archive contains its own `poem-phase1.3/` folder. `-n` does not overwrite existing files. Extract a new release into a fresh directory if that folder already contains changes; this ZIP is not an overwrite patch.

## 2. Start the local database/auth services

The project already includes `supabase/config.toml`. Do not run `npx supabase init` again.

```bash
cd ~/projects/poem-phase1.3
npx supabase start
npx supabase migration up --local
npm run env:local
npm run dev
```

`start` applies pending migrations on a fresh project. `migration up --local` safely applies any remaining local migrations without resetting data. Never use `db reset` on a database containing data you want to keep.

Open the frontend at **http://localhost:5173**. Keep the terminal running.

Local project ports are separate from the usual 5432x ports:

| Service | Address |
| --- | --- |
| Frontend | http://localhost:5173 |
| Supabase API | http://127.0.0.1:55321 |
| PostgreSQL | 127.0.0.1:55322 |
| Supabase Studio | http://127.0.0.1:55323 |
| Local email inbox | http://127.0.0.1:55324 |

Use `npx supabase status` for actual service addresses. Real emails are not sent by the local stack; use the local inbox for confirmation/reset messages.

`npm run env:local` writes only the local public URL and anon/publishable key to `.env.local`. It never writes a service-role key. It refuses to replace an existing file unless you explicitly run `npm run env:local -- --force`.

The internal Supabase project ID remains `poem-phase11` for upgrade compatibility. Do not run the old and new folders as separate stacks simultaneously; they use the same local services and ports.

## 3. Create the FIRST Super Admin

1. Open the app and create your own account with your email and a password of at least 12 characters.
2. Open the local email inbox and click the confirmation link.
3. In a second WSL terminal, run the command below with that same email.

```bash
cd ~/projects/poem-phase1.3
npm run admin:bootstrap -- --email "YOUR_REGISTERED_EMAIL"
```

The helper runs against the project's named LOCAL Docker database only. It requires a confirmed account, records an audit event, and refuses to bootstrap another Super Admin when one is already active. It does not create a password or alter another project's database.

Sign out and sign in again. The default workspace will now be **POEM administration**.

## 4. Test volunteer verification

- In a private browser window, create a second volunteer account and confirm its email.
- Admin: add sourced province, division and district nodes under **Geography** first.
- Volunteer: fill in full name, phone, structured location (at least district) and CV details.
- Optionally upload a supporting PDF/JPG/PNG.
- Save a draft, then submit for verification.
- In the admin window, open **Verification**, open the profile, accept each uploaded document, complete the three verification checks and save a decision with a review note.
- Refresh the volunteer window; check the status and review note.
- Edit and resubmit; the status returns to pending, requiring a fresh review.

POEM admins cannot approve their own profile. A second POEM admin can review it if required.

## 5. Create NGOs and assign accounts

- POEM admin: **Partner NGOs → Add partner NGO**, complete details, set active when operationally approved.
- The intended NGO admin signs up normally and confirms their account first.
- POEM admin: **Memberships**, choose that registered account and NGO, assign `ngo_admin`, status `active`.
- NGO admin signs out/in, or reloads, then chooses the NGO in the workspace selector.
- A volunteer opens **My profile → NGO profile access → Allow profile access** for that NGO.
- NGO admin reloads their directory and can now view that volunteer. Another NGO cannot see it unless separately authorized.
- Revoke the grant, suspend the membership, suspend the organization, or suspend the account to remove applicable future access.

An account may have multiple NGO memberships. NGO roles do not grant POEM platform privileges. `member` records a membership but has no NGO management dashboard permissions in this release.

## 6. Validate

```bash
npm run preflight
npm run test:local
```

`preflight` runs TypeScript, PostgreSQL-compatible migration/RLS tests, environment checks, and the frontend production build. It does not require Docker.

`test:local` requires local Supabase on port 55321. It creates two temporary fixture accounts, verifies real Auth/API isolation and private Storage byte upload/download/removal, then deletes those fixtures. It never uses a cloud URL. Do not interrupt it during cleanup; any failed cleanup IDs will remain visible in local Studio.

Also manually test login/logout, email confirmation, forgot-password/reset, correction feedback, NGO access revocation and mobile layouts. Docker, email delivery and browser flows were not executed in the build environment.

## 7. Daily use

```bash
cd ~/projects/poem-phase1.3
nvm use
npx supabase start
npm run dev
```

When finished, stop the frontend with Ctrl+C, then:

```bash
npx supabase stop
```

Do not add `--no-backup` unless you intend to discard local data.

## Troubleshooting

- **Docker not running:** start Docker Desktop on Windows, enable Ubuntu WSL integration, then retry `docker version`.
- **Port already allocated:** stop the specific other service using the conflicting port. Do not delete another project's Docker volumes.
- **Email not confirmed:** use the local inbox on 55324; this is separate from your normal email provider.
- **Unable to open account:** check `npx supabase migration list --local`, then run `npx supabase migration up --local`.
- **Profile changed in another session:** reload and review the newest version. Do not overwrite someone else's newer changes.
- **No NGO volunteers visible:** verify active NGO, active `ngo_admin` membership, and the volunteer's explicit sharing grant.
- **Frontend URL:** use the same origin throughout confirmation and reset (localhost:5173 recommended).
- **Node engine warning:** run `nvm install 24` and `nvm use 24` before `npm ci`.
