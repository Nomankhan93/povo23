# Upgrade to FieldLance 2.42.8

## Baseline

Apply the 2.42.8 patch only to the approved FieldLance 2.42.7 / 2.42.7-r1 baseline used for this release.

## Database

No database change is required.

- No migration is added.
- No `supabase db push` is required.
- Migration count remains 87.
- Migration head remains `20261013000580_project_lifecycle_e2e_integrity.sql`.
- Payable/finance RPC signatures, RLS, grants and server calculations remain unchanged.

## Application upgrade

The patch updates the two finance presentation surfaces, adds scoped CSS Modules, adds context-safe funding loading, confirmation-bound financial commands, the failed funding-source form preservation fix and the dedicated 2.42.8 regression.

No Project Workspace → Payables integration is added. No organization-wide payable aggregation, funding approval workflow, Earnings/Wallet redesign, finance-history pagination or backend contract redesign is included.

After applying, run the focused commands in `docs/VALIDATION-2.42.8.md`. Because finance is correctness-sensitive, final release certification should also run the existing full preflight after the dedicated 2.42.x gates are green.

FieldLance mobile acceptance remains deployed browser/PWA based. Android-native smoke testing is not part of this release.
