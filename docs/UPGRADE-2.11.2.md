# Upgrade POEM 2.11.1 to 2.11.2

Save poem-branding-2.11.2-patch.zip at:
`\\wsl.localhost\Ubuntu\home\noman\projects\poem-branding-2.11.2-patch.zip`

In Ubuntu WSL:

```bash
cd /home/noman/projects/poem-phase1.1
node -p "require('./package.json').version"
patch_dir=$(mktemp -d /tmp/poem-branding.XXXXXX)
unzip -n /home/noman/projects/poem-branding-2.11.2-patch.zip -d "$patch_dir" &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
nvm use
npm ci && npm run preflight && npm run dev
```

Requires 2.11.1; apply the preceding Design System & Workflow UX patch first if needed. No migration command needed. Installer preserves appended README notes/custom scripts and refuses conflicting edits. Existing environment settings remain intact. Review the manual checks in PHASE-2.11.2.md.

After review, with patch_dir still set in the same terminal:

```bash
git diff --check &&
while IFS= read -r file; do git add -- "$file" || break; done < "$patch_dir/CHANGED_FILES.txt"
git diff --cached --stat
git diff --cached
```

After checking the staged changes:

```bash
git commit -m "Apply POEM 2.11.2 official branding" && git push
```

The source ZIP is an optional clean snapshot; prefer the guarded patch for the existing project. Source excludes dependencies, build output and environment files.
