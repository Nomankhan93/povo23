# POEM 2.8 upgrade — existing WSL project

Use this patch only on POEM 2.7.6. The installer checks changed files and all 16 baseline migrations, preserves appended README notes and synchronized package/lockfile dependency choices, and creates source backups. Source backups do not contain database backups.

Download `poem-canonical-workbench-2.8-patch.zip` to:

`\\wsl.localhost\Ubuntu\home\noman\projects\poem-canonical-workbench-2.8-patch.zip`

Stop the development server, review existing changes, then apply:

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
git status --short
patch_dir=$(mktemp -d /tmp/poem28.XXXXXX)
unzip -n /home/noman/projects/poem-canonical-workbench-2.8-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project "$PWD" --check &&
python3 "$patch_dir/apply_patch.py" --project "$PWD"
```

A conflict stops the installer before source writes. Review it rather than forcing replacement. Reapplying matching files is safe. Existing environment files and Supabase configuration are not changed.

With Docker running and a verified backup of valuable local database data:

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

Do not reset the database. Do not blindly repair hosted migration history. These commands migrate local Supabase only. A hosted rollout requires reviewing its actual migration history and backup separately.

Sign in with POEM Super Admin, Admin or Survey Manager and open **Canonical registry**. Run the acceptance checklist in `docs/VALIDATION-2.8.md` before live operator use.

After reviewing the changes:

```bash
cd /home/noman/projects/poem-phase1.1
git diff --check
git diff --stat
git add -- src scripts supabase/migrations docs package.json package-lock.json README.md FILES.txt
git diff --cached --stat
git commit -m "Add POEM 2.8 canonical registry operator workbench"
git push
```

Check the staged diff for unrelated work. Never stage local environment files or patch backups. `git push` assumes the current branch already has the intended upstream.

For recovery after deployment, prefer a corrective forward migration. Restoring source files alone does not reverse schema or record history changes.
