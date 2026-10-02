# FieldLance 2.41.7 upgrade

Apply the forward migration after 2.41.6:

    npx supabase migration up

The migration is 20261013000540_wallet_production_capability.sql. Do not reset the database. It defaults wallet sandbox enrollment and simulated provider operations to disabled, preserves wallet/withdrawal records and manual settlement, and keeps the existing provider RPC's JSONB result contract.

The change was validated against the local poem-phase11 Supabase project. Its pre-migration custom-format backup is outside the repository at /home/noman/fieldlance-backups/2.41.7/pre-capability.dump; SHA-256: 8a41f5a3cabb9c5aa5f26e8b1a0b5e8edd15dff1ca50efd8a71a23dbb9474b94. pg_restore --list read all 2,789 TOC entries. No hosted Supabase project was changed.
