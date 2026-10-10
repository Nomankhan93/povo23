# Upgrade to FieldLance 2.42.6

## Baseline

Apply the installable patch only to the exact FieldLance 2.42.5 baseline accepted by the installer.

## Database

No database change is required.

- No migration is added.
- No `supabase db push` is required.
- Migration count remains 87.
- Migration head remains `20261013000580_project_lifecycle_e2e_integrity.sql`.
- RLS, RPC signatures/semantics and grants remain unchanged.

## Application upgrade

The patch updates the Field Operations Map presentation, retires its legacy global CSS and adds the dedicated 2.42.6 regression. The installer verifies the 2.42.5 package version and baseline hashes before writing, protects map authorization/view-state and other unrelated behavioral files, verifies all migration hashes, creates a timestamped rollback backup and supports `--check` before writes.

Recommended flow:

```bash
bash apply.sh --check /home/noman/projects/poem-phase1.1
bash apply.sh /home/noman/projects/poem-phase1.1
```

After apply, run the focused commands documented in `docs/VALIDATION-2.42.6.md`. FieldLance mobile acceptance remains browser/PWA based; no Android-native test belongs to this release.
