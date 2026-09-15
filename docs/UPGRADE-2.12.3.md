# Upgrade POEM 2.12.2 to 2.12.3

This patch needs the 2.12.2 template library patch first. No new SQL migration.

```bash
cd /home/noman/projects/poem-phase1.1
patch_dir=$(mktemp -d /tmp/poem-memberships.XXXXXX)
unzip -n /home/noman/projects/poem-membership-actions-2.12.3-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
nvm use
npm ci && npm run check && npm run build
```

Guarded installer retains backups and stops before writes if edited source differs from the expected baseline. Resolve mismatches without force overwriting.

After browser checks, commit and deploy through your existing Git workflow:
```bash
git status --short
git add src/app/AppShell.tsx src/features/organizations/MembershipActions.tsx package.json package-lock.json README.md FILES.txt docs/PHASE-2.12.3.md docs/UPGRADE-2.12.3.md
git commit -m "Add NGO membership role and suspension actions"
git push
```

See PHASE-2.12.3.md for manual testing and the scope of membership removal.
