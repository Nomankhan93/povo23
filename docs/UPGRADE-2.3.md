# Upgrade Phase 2.2 → 2.3

Use the existing `/home/noman/projects/poem-phase1.1` project. The folder name does not need to match the app version. This patch requires package version 2.2.0 and all six unchanged earlier migrations. Apply Phase 2.2 first if still on an earlier version.

Save the ZIP at `\\wsl.localhost\Ubuntu\home\noman\projects\poem-phase2.3-patch.zip`. In Ubuntu:

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
git status --short
patch_dir=$(mktemp -d /tmp/poem-phase23.XXXXXX)
unzip -n /home/noman/projects/poem-phase2.3-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project "$PWD" --check &&
python3 "$patch_dir/apply_patch.py" --project "$PWD"
```

Installer checks every changed file before writing and creates source backups. It preserves README suffixes such as `# povo23`, custom package scripts and synchronized exact Vite 8.x versions >=8.0.16. Other conflicting local changes stop the patch for manual merging; do not overwrite them blindly. Source backups are not database backups.

Start Docker Desktop with Ubuntu WSL integration before local Supabase. If Docker is unavailable, fix that before the local-service steps. The frontend itself runs in WSL.

```bash
nvm use
npm ci --include=dev &&
npm run preflight &&
npx supabase start &&
npx supabase migration up --local &&
npm run test:local &&
npm run dev
```

Existing local environment settings remain unchanged. If missing, run `npm run env:local` after Supabase starts. Keep Supabase project ID `poem-phase11` and ports 55321–55324. Do not run `supabase db reset`, create a second database project or re-bootstrap the admin. Only the new phase23 migration is applied to an upgraded database.

Run the manual checklist in PHASE-2.3.md. The local smoke test covers existing Auth/Storage workflows, not the complete new needs/follow-up browser workflow.

After reviewing changes and completing your local checks, commit only the intended source files; exclude credentials and patch backups:

```bash
git diff --stat
git add README.md FILES.txt docs package.json package-lock.json src scripts supabase/migrations/20260917000100_phase23_needs_followup.sql
git diff --cached --stat
git commit -m "Build POEM Phase 2.3 needs assessment and assistance follow-up"
git push
```

The full source ZIP is an alternative for a fresh install, not a command to overwrite an existing project. Follow SETUP-WSL.md for fresh setup only.
