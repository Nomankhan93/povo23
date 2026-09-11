# Upgrade POEM Phase 1.3 → Phase 1.4

This patch updates the standalone Volunteer/NGO app, not the separate poem-web public website. Existing folder remains `/home/noman/projects/poem-phase1.1` and Supabase project ID remains `poem-phase11`. Apply Phase 1.3 first. Previous migrations/config/environment stay intact.

The installer supports an appended README suffix such as `# povo23`, preserves compatible existing dependency updates, and adds the Phase 1.4 test command. A clean original Vite 8.0.13 baseline is upgraded to 8.0.16 with a matching lockfile. An already synchronized exact Vite 8.x version >=8.0.16 is retained along with your lockfile dependencies. Other edits to code or incompatible package/lock changes stop the patch before any writes. Do not use force overwrite to bypass a conflict.

## Apply in WSL

Save the patch at `/home/noman/projects/poem-phase1.4-patch.zip` (Windows Explorer: `\\wsl.localhost\Ubuntu\home\noman\projects\poem-phase1.4-patch.zip`). Stop the frontend first.

```bash
cd /home/noman/projects/poem-phase1.1
patch_dir=$(mktemp -d /tmp/poem-phase14.XXXXXX)
unzip -n /home/noman/projects/poem-phase1.4-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project "$PWD" --check &&
python3 "$patch_dir/apply_patch.py" --project "$PWD"
```

Only after successful application:

```bash
nvm use
npm ci --include=dev &&
npm run preflight &&
npx supabase start &&
npx supabase migration up --local &&
npm run test:local &&
npm run dev
```

Docker Desktop must be running with Ubuntu WSL integration enabled. `docker version` should show both Client and Server. Do not run `db reset` or bootstrap your admin again. `npm run preflight` does not need Docker, while `test:local` does. Run `npm audit` separately to inspect current advisories.

The patch creates source backups under `.poem-patch-backups/`. Preserve valuable database data using your usual backup process before migration; source backups do not back up the database. After a migration, restore only a coordinated source/database backup or fix forward.

## Use

- Personal workspace → Work experience / Invitations.
- NGO workspace → Work experience (confirmation requests) / Invitations (create opportunities and manage responses).
- NGO Volunteers directory → shortlist a shared profile → Invite to opportunity.
- Confirmed experiences also display in authorized volunteer details.

Follow PHASE-1.4.md for permissions and manual checks. Accepting an invitation is not a contract/payment/assignment.

## Commit and push after local checks

```bash
git status --short
git diff --stat
git add src scripts docs README.md FILES.txt package.json package-lock.json supabase/migrations/20260914000100_phase14_experience_invitations.sql
git diff --cached --stat
git commit -m "Build POEM Phase 1.4 experience verification and NGO invitations"
git push
```

Use the existing intended repository/branch. Review staging: environment files, dependencies and backups must not be included.
