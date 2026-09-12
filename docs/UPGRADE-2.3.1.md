# Upgrade existing POEM 2.3.0 to 2.3.1 (WSL)

Keep the existing folder `/home/noman/projects/poem-phase1.1`. Save the patch at `\\wsl.localhost\Ubuntu\home\noman\projects\poem-stabilization-2.3.1-patch.zip`.

Before migration, back up the database and run the read-only scope checks in `docs/STABILIZATION-SCOPE-CHECK.sql` (also inside the patch payload). Take a Git snapshot of your existing work. Do not commit environment secrets or patch backups. Close any active survey forms.

```bash
cd /home/noman/projects/poem-phase1.1
patch_dir=$(mktemp -d /tmp/poem-stabilization231.XXXXXX)
unzip -n /home/noman/projects/poem-stabilization-2.3.1-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
```

A successful check does not modify files. The apply step backs up replaced/deleted source in the existing project. It preserves an appended `# povo23` README line and synchronized Vite 8 dependency updates. A local source edit stops the patch; do not bypass its guard.

Start Docker Desktop with Ubuntu/WSL integration (or your working WSL Docker daemon). Verify `docker info` succeeds, then:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev &&
npx supabase start &&
npx supabase migration up --local &&
npm run preflight &&
npm run test:local &&
npm run test:operations &&
npm run dev
```

`preflight` does not use your live database. `test:local` and `test:operations` require the local POEM Supabase stack on port 55321. The operations test creates synthetic users/data and cleans only its own fixture IDs; it fails and reports IDs/errors if cleanup is incomplete. Neither test resets your database. No admin bootstrap is needed for an existing installation.

If you use hosted Supabase with manually applied SQL, reconcile its migration history first. These commands target only local Supabase; do not blindly run `db push`, `db reset` or migration repair on a remote database. This patch does not inspect or repair remote drift.

After success, reload every client tab. The old survey save signature is intentionally unavailable. Keep the source backup until database and browser acceptance checks pass; restoring old source alone is not a compatible database rollback.

See `docs/STABILIZATION-2.3.1.md` and `docs/VALIDATION-2.3.1.md` for scope and verification limits.
