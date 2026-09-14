# Upgrade the supplied 2.12.0 project to 2.12.1

Save `poem-area-selection-2.12.1-patch.zip` to:
`\\wsl.localhost\Ubuntu\home\noman\projects\poem-area-selection-2.12.1-patch.zip`

In Ubuntu WSL:

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
patch_dir=$(mktemp -d /tmp/poem-area121.XXXXXX)
unzip -n /home/noman/projects/poem-area-selection-2.12.1-patch.zip -d "$patch_dir" &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
```

The installer compares the supplied ZIP baseline before writing and refuses conflicting edits. Appended README notes and custom scripts are retained. Source backups are created by the installer. No database reset.

```bash
nvm use
npm ci && npm run preflight
```

Local Supabase, with Docker running:

```bash
npx supabase start &&
npx supabase migration up --local &&
npm run dev
```

For your hosted Supabase project, inspect the linked target and pending migrations:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

After confirming the correct project and pending migration list, apply with `npx supabase db push`. This patch adds `20260930000100_area_selection.sql`. If unexpected old migrations are pending, resolve that history first; do not reset the database or force repair. Deploy frontend changes after migration succeeds so UC/village saves work.

Git, after reviewing changes and with patch_dir still set:

```bash
git diff --check &&
python3 - "$patch_dir/CHANGED_FILES.txt" <<'PY'
import pathlib,subprocess,sys
for name in pathlib.Path(sys.argv[1]).read_text().splitlines():
    subprocess.run(['git','add','--',name],check=True)
PY
git diff --cached --stat
git diff --cached
```

After reviewing staged changes:

```bash
git commit -m "Fix POEM survey and NGO dependent area selection" && git push
```

Complete the manual checklist in PHASE-2.12.1.md. The source ZIP is an optional clean snapshot, not an instruction to overwrite a customized project.
