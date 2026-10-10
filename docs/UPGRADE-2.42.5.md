# Upgrade to FieldLance 2.42.5

## Baseline

Apply this release only to the exact FieldLance 2.42.4 baseline accepted by the 2.42.5 installer.

## Database

No database change is required.

- No migration is added.
- No `supabase db push` is required.
- Migration count remains 87.
- Migration head remains `20261013000580_project_lifecycle_e2e_integrity.sql`.

## Application upgrade

The installable patch verifies the 2.42.4 package version and baseline hashes before writing, protects backend/offline/security files, creates a rollback backup, applies the payload, regenerates repository metadata from the target workspace, verifies payload/protected hashes and supports `--check` before writes.

Recommended flow:

```bash
./apply.sh --check /home/noman/projects/poem-phase1.1
./apply.sh /home/noman/projects/poem-phase1.1
```

After apply, run the focused 2.42.5 validation commands documented in `docs/VALIDATION-2.42.5.md`.

## 2.42.5-r1 artifact

Use the `2.42.5-r1` correction artifact instead of the initial 2.42.5 patch. It still applies directly to the exact 2.42.4 baseline and installs package version 2.42.5; the `r1` suffix identifies the corrected artifact only.
