# Upgrade 2.11.0 → 2.11.1

Download `poem-design-workflow-2.11.1-patch.zip` to Windows location:
`\\wsl.localhost\Ubuntu\home\noman\projects\poem-design-workflow-2.11.1-patch.zip`

Run in Ubuntu WSL:

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
git status --short
patch_dir=$(mktemp -d /tmp/poem-2111.XXXXXX)
unzip -n /home/noman/projects/poem-design-workflow-2.11.1-patch.zip -d "$patch_dir" &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
```

Expected baseline version is 2.11.0. Installer checks all 20 prior migrations and all changed-file hashes before writing, preserves appended README notes and custom scripts, and refuses conflicting local edits. It creates a backup under `.poem-patch-backups`; inspect conflicts rather than forcing writes. Keep your environment settings. No database migration or reset is needed for this patch.

```bash
nvm use
npm ci &&
npm run preflight
```

With Docker running and the existing local Supabase environment available:

```bash
npx supabase start &&
npm run test:local &&
npm run dev
```

Finish the manual browser checklist in `docs/PHASE-2.11.1.md`. Review the resulting Git diff before committing:

```bash
git diff --stat
git diff --check
git status --short
```

Stage the reviewed files from CHANGED_FILES.txt; do not stage environment files or patch backups. The full source ZIP is an alternate clean source snapshot, not a replacement for a locally customized project. Dependencies, environment secrets and build output are excluded.
