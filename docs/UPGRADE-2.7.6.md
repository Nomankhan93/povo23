# Apply POEM 2.7.6 to the existing WSL project

Required baseline: package version 2.7.5, with the original 15 migrations. Do not apply this archive directly over older releases. The installer checks changed source files before writing and preserves an appended README suffix, custom package scripts, and synchronized dependency/lockfile changes. It creates source backups under `.poem-patch-backups`; this is not a database backup.

Download `poem-correctness-recovery-2.7.6-patch.zip` to:

Windows: `\\wsl.localhost\Ubuntu\home\noman\projects\poem-correctness-recovery-2.7.6-patch.zip`

WSL: `/home/noman/projects/poem-correctness-recovery-2.7.6-patch.zip`

Stop the development server before applying. Inspect and commit any existing work first. Use the existing project directory:

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
git status --short
patch_dir=$(mktemp -d /tmp/poem276.XXXXXX)
unzip -n /home/noman/projects/poem-correctness-recovery-2.7.6-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
```

If the guard reports a conflict, nothing is written. Review that file against `files/` and `baseline/` in the extracted archive. Do not bypass the guard or overwrite local edits wholesale. Reapplication is safe when files already match the patch.

Start Docker Desktop with Ubuntu WSL integration (or your configured Docker engine) before running local Supabase. `docker info` must succeed. The project's local Supabase stack uses Docker; the frontend does not need its own Docker image.

Before applying the migration to a valuable database, create and verify a database backup using your existing backup process. Then:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use &&
npm ci --include=dev &&
docker info &&
npx supabase start &&
npx supabase migration up --local &&
npm run preflight &&
npm run test:local &&
npm run test:operations &&
npm run dev
```

Do not use `supabase db reset`. Existing project ID, ports, environment values and configuration are preserved. These commands target local development; they do not migrate a hosted Supabase database. If your local schema has drift or a prior migration is missing, stop and resolve the actual migration history. Do not repair migration records blindly.

After checking the UI flows in VALIDATION-2.7.6.md, review and commit:

```bash
cd /home/noman/projects/poem-phase1.1
git diff --stat
git diff --check
git add -- src scripts supabase/migrations docs package.json package-lock.json README.md FILES.txt
git diff --cached --stat
git commit -m "Stabilize POEM 2.7.6 correctness and recovery"
git push
```

Review the staged diff so unrelated local work is not included. Do not add environment files or patch backups. `git push` assumes the current branch already has the intended remote/upstream.

After a database migration, do not restore an old frontend/source backup as though that also undoes schema and history changes. Prefer a corrective forward migration. Database recovery requires a verified database backup and a coordinated application version.
