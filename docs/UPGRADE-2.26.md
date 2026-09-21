# Upgrade notes — FieldLance 2.26

1. Apply the migration `20261010000100_paid_work_funding_assurance_closure.sql` after the existing migrations.
2. Regenerate database types with `npm run types:generate`.
3. Run `npm run preflight`.
4. Review existing paid opportunities. Historical rows are not rewritten; only newly published paid opportunities receive the 2.26 funding gate.
5. Reserve verified project funding before publishing new paid opportunities.
6. Use Project Funding to sweep expired commitments and progress closure states.

Do not reset the database or edit previously applied migrations.
