# Upgrade to FieldLance 2.42.7

## Baseline

Apply the installable patch only to the exact FieldLance 2.42.6 baseline accepted by the installer.

## Database

No database change is required.

- No migration is added.
- No `supabase db push` is required.
- Migration count remains 87.
- Migration head remains `20261013000580_project_lifecycle_e2e_integrity.sql`.
- RLS, RPC signatures/semantics and grants remain unchanged.

## Application upgrade

The patch updates the Project Team presentation into Team & Access, adds scoped Project Team CSS and the dedicated 2.42.7 regression, and updates historical presentation-sensitive tests where the old global/mobile-table implementation no longer applies.

Recommended flow:

```bash
bash apply.sh --check /home/noman/projects/poem-phase1.1
bash apply.sh /home/noman/projects/poem-phase1.1
```

After apply, run the focused commands documented in `docs/VALIDATION-2.42.7.md`. FieldLance mobile acceptance remains browser/PWA based; no Android-native validation belongs to this release.
