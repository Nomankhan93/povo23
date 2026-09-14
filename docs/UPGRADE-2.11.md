# Upgrade POEM 2.10.0 → 2.11.0 in WSL

The guarded installer verifies changed source files and the 19 previous migrations before writing. It retains appended README notes, custom scripts and synchronized dependency choices. Close other POEM tabs and stop the dev server. Back up valuable database data with your existing backup process; installer source backups are not database backups.

Save `poem-offline-reliability-2.11-patch.zip` at:

`\\wsl.localhost\Ubuntu\home\noman\projects\poem-offline-reliability-2.11-patch.zip`

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
git status --short
patch_dir=$(mktemp -d /tmp/poem211.XXXXXX)
unzip -n /home/noman/projects/poem-offline-reliability-2.11-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project "$PWD" --check &&
python3 "$patch_dir/apply_patch.py" --project "$PWD"
```

Stop on a baseline conflict and review the named file instead of forcing overwrite. With Docker Desktop running and Ubuntu integration enabled:

```bash
nvm use &&
npm ci --include=dev &&
docker info &&
npx supabase start &&
npx supabase migration up --local &&
npm run preflight &&
npm run test:local &&
npm run test:operations
```

These commands migrate local Supabase. No reset or automatic hosted migration repair is required. Cloud deployment requires separate review of migration history and backup.

## Test production offline behavior

```bash
npm run build && npm run preview
```

Open the printed preview URL, normally `http://127.0.0.1:4173/`. Sign in on that origin, select **Offline field**, wait until app files are installed, find assignments and download a project. Reload the root URL online once, then perform the airplane-mode checklist in `docs/VALIDATION-2.11.md`.

Development and preview ports are different browser origins: their sessions, keys and offline copies are separate. Do not expect data captured at port 5173 to appear at port 4173 or a hosted domain. Do not erase the old origin until its pending work is synchronized. Your existing Supabase redirect allowlist may need the preview URL for email-based auth; password sign-in can be used for the local synthetic pilot.

For ordinary development:

```bash
npm run dev
```

No service worker is installed in development mode. After testing a production worker on an origin, continue using that origin consistently or remove that origin's worker only after pending work is safe. Phone GPS/camera/storage need an appropriate secure origin; plain WSL LAN HTTP is not the same as localhost on a phone.

## Commit after acceptance

```bash
cd /home/noman/projects/poem-phase1.1
git diff --check
git diff --stat
git add -- src scripts supabase/migrations docs package.json package-lock.json README.md FILES.txt
git diff --cached --stat
git commit -m "Add POEM 2.11 offline field reliability"
git push
```

Review staged files for unrelated changes. Never stage local environment secrets, dependency folders or patch backups. Push assumes the intended upstream already exists. Restoring old source does not undo a forward migration or the IndexedDB upgrade; use a corrective patch if needed.
