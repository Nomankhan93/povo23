# Upgrade 2.11.2 → 2.12.0

Save `poem-workforce-payables-2.12-patch.zip` to:
`\\wsl.localhost\Ubuntu\home\noman\projects\poem-workforce-payables-2.12-patch.zip`

Run in Ubuntu WSL. Keep a current database backup before applying a migration to a data-bearing environment.

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
git status --short
patch_dir=$(mktemp -d /tmp/poem-payables212.XXXXXX)
unzip -n /home/noman/projects/poem-workforce-payables-2.12-patch.zip -d "$patch_dir" &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
```

Expected baseline 2.11.2. Installer validates all baseline migration hashes and changed-file hashes before writing, preserves appended README notes/custom scripts, and creates backups. Conflicts must be reviewed; do not force-overwrite local changes.

With Docker running:

```bash
nvm use
npm ci &&
npm run preflight &&
npx supabase start &&
npx supabase migration up --local &&
npm run test:local &&
npm run dev
```

No database reset is needed. New migration creates the private receipt bucket automatically. Use the existing local environment settings; if setting up a fresh local environment, use the project's `npm run env:local` command after starting local Supabase.

Hosted migration, only after local acceptance and checking your linked project:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

Review the pending list and confirm the target before running `npx supabase db push`. This release adds only `20260929000100_workforce_payables.sql`; if older migrations are also unexpectedly pending, resolve history first. Do not reset hosted data or force migration repair. Deploy the matching frontend after the migration succeeds.

## Git review and commit

With patch_dir still set in this terminal, stage only the patch's reviewed files:

```bash
git diff --check &&
python3 - "$patch_dir/CHANGED_FILES.txt" <<'PY'
import pathlib, subprocess, sys
for name in pathlib.Path(sys.argv[1]).read_text().splitlines():
    subprocess.run(['git', 'add', '--', name], check=True)
PY
git diff --cached --stat
git diff --cached
```

After verifying the staged diff:

```bash
git commit -m "Add POEM 2.12 workforce payable accounting" && git push
```

Source ZIP is an optional clean snapshot, excludes secrets/dependencies/build output, and is not an overwrite recipe for a customized working project. Prefer the guarded patch. Once financial entries exist, do not remove the migration/tables as a rollback: fix forward and preserve the journal.
