# Apply POEM 2.9 to the existing WSL project

Required baseline: POEM 2.8.0. The guarded installer checks changed files and all 17 baseline migrations before writing. It preserves appended README notes, custom scripts and synchronized package/lockfile dependency choices. Source backups are not database backups.

Download `poem-governance-verification-2.9-patch.zip` to:

`\\wsl.localhost\Ubuntu\home\noman\projects\poem-governance-verification-2.9-patch.zip`

Stop the development server and apply:

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
git status --short
patch_dir=$(mktemp -d /tmp/poem29.XXXXXX)
unzip -n /home/noman/projects/poem-governance-verification-2.9-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project "$PWD" --check &&
python3 "$patch_dir/apply_patch.py" --project "$PWD"
```

If there is a conflict, review it instead of forcing an overwrite. Matching reapplication is safe. Environment files and Supabase configuration are unchanged.

Back up valuable database data using your existing verified backup process. With Docker running:

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

Do not reset the database or blindly repair hosted migration history. These commands target local Supabase. Hosted deployment requires separately reviewing the actual migration history and backup.

Use **Verification** to request evidence review and sign in as a different authorized reviewer to make a verification decision. Use **Project governance** to inspect a project and explicitly publish the verification requirements you want to enforce. Before enabling mandatory verification, ensure the NGO and intended collectors have current independent cases.

After the acceptance checklist passes:

```bash
cd /home/noman/projects/poem-phase1.1
git diff --check
git diff --stat
git add -- src scripts supabase/migrations docs package.json package-lock.json README.md FILES.txt
git diff --cached --stat
git commit -m "Add POEM 2.9 governance and independent verification"
git push
```

Inspect staged changes for unrelated work. Do not stage environment files or patch backups. Push assumes your branch already has the intended upstream. After a migration, restoring old source does not reverse database changes; prefer a corrective forward migration.
