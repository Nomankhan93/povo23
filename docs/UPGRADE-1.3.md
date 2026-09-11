# Upgrade standalone POEM Phase 1.2 → Phase 1.3

Use this patch only after Phase 1.2 was applied to the standalone project. The established folder remains `/home/noman/projects/poem-phase1.1`; do not create a different database or reinitialize Supabase. This does not update the separate POEM public website / Sites source.

Stop the frontend and preserve current work in Git. The patch verifies all changed files and both existing migrations before writing, and creates source backups under `.poem-patch-backups/`. Local changes cause a safe refusal. If README or another file has your edits, merge that file deliberately from the patch `files/` payload instead of discarding your work. Source backups are not database backups; use your established backup process for valuable local data before migrating.

## WSL commands

Save `poem-phase1.3-patch.zip` under `/home/noman/projects/`. Its Windows Explorer location is `\\wsl.localhost\Ubuntu\home\noman\projects\poem-phase1.3-patch.zip`.

```bash
patch_dir=$(mktemp -d /tmp/poem-phase13.XXXXXX)
unzip -n /home/noman/projects/poem-phase1.3-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
```

After successful application:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci &&
npx supabase start &&
npx supabase migration up --local &&
npm run preflight &&
npm run test:local &&
npm run dev
```

The same Supabase project ID `poem-phase11`, ports, `.env.local`, confirmed users and existing admin remain. Do not run `db reset` or bootstrap again. The installer does not execute any database command. `test:local` requires the running local Docker stack, creates synthetic test users and cleans them up.

If a schema change fails, stop and inspect the error; do not start older UI against a partially upgraded schema or delete migration history. Restore only a coordinated source/database backup, or fix forward. Both old SQL migrations are unchanged in this release.

## Git after validation

```bash
git status --short
git diff --stat
git add src scripts docs README.md FILES.txt package.json package-lock.json supabase/migrations/20260913000100_phase13_directory_operations.sql
git diff --cached --stat
git commit -m "Build POEM Phase 1.3 volunteer directory and NGO operations"
git push
```

Use the existing intended remote/branch. Review the staged file list; secrets, dependencies and backup folders must not be staged. The patch does not create a repository or change its remote.

See PHASE-1.3.md for the permission matrix and manual test checklist.
