# Upgrade Phase 1.1 → Phase 1.2

Use the patch ZIP for the standalone Phase 1.1 package. It is not compatible with an older Sites/Cloudflare project. Stop the frontend first and save current work in Git. The installer checks every changed file against the supplied Phase 1.1 baseline; it refuses local modifications instead of overwriting them. No environment file, dependency directory or existing migration is replaced.

## WSL commands

Adjust the Windows username/project path if yours differs. Extract to a new empty temporary directory so old patch contents cannot be reused.

```bash
patch_dir=$(mktemp -d /tmp/poem-phase12.XXXXXX)
unzip -n "/mnt/c/Users/noman/Downloads/poem-phase1.2-patch.zip" -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project ~/projects/poem-phase1.1 --check
python3 "$patch_dir/apply_patch.py" --project ~/projects/poem-phase1.1
cd ~/projects/poem-phase1.1
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run preflight
npm run test:local
npm run dev
```

Keep your existing `.env.local` and confirmed admin account. Do not bootstrap again. If the environment file is missing, run `npm run env:local`. The Supabase project ID intentionally remains `poem-phase11` to preserve the original stack and database. Do not run `db reset`.

The patch creates a timestamped source backup under `.poem-patch-backups/`. This is not a database backup. Back up valuable database data before a schema upgrade using your existing backup process. Once the new migration is applied, do not restore the old UI: the profile save/review RPC contracts changed. Fix forward or restore a coordinated database and source backup.

If the installer reports local edits, it writes nothing. Compare the named files with `files/` in the extracted patch and manually merge your work. Do not delete your work just to bypass the check. Already-applied files are safely skipped. The unchanged foundation migration and Supabase config are checked for baseline compatibility.

## First use

1. POEM admin opens Geography and enters sourced province → division → district nodes, then taluka/UC/village or ward as needed. No invented names are seeded.
2. Volunteer selects at least a district and saves/submits the profile. Existing legacy approvals are preserved, but the next save/review needs the new geography rules.
3. Upload a small synthetic PDF/JPG/PNG. Documents are optional and visible only to the owner and POEM admins.
4. Admin accepts each current document, completes the verification checklist and approves the profile. NGO full-profile sharing still excludes document metadata and bytes.
5. Volunteer checks Notifications. Removing a document resets previous approval and keeps an audit/history record.

## Commit after validation

For an existing repository, inspect before committing:

```bash
git status --short
git diff --stat
git add README.md FILES.txt docs src scripts supabase/migrations/20260912000100_phase12_geography_documents.sql package.json package-lock.json .gitignore
git diff --cached --stat
git commit -m "Build POEM Phase 1.2 geography and private documents"
git push
```

Use your existing intended remote/branch. `.env.local`, dependencies and patch backups should not appear in staged files. If this is a new repository, follow RELEASE-CHECKLIST.md.
