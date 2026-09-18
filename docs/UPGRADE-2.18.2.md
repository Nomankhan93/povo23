# Upgrade to POEM 2.18.2

1. Start from a green POEM 2.18.1 workspace, including `20261008000920_ewallet_withdrawal_stabilization.sql` and the timestamp assertion compatibility fix in `scripts/test-phase2181.mjs`.
2. Apply the 2.18.2 patch.
3. Run `npm run types:generate`.
4. Apply `20261008000930_withdrawal_operations_manual_settlement.sql` locally.
5. Run `node scripts/test-phase218.mjs`, `node scripts/test-phase2181.mjs`, and `node scripts/test-phase2182.mjs`.
6. Run full `npm run preflight`, `npm run test:local`, and `npm run test:operations`.
7. Only after all gates are green, push the forward migration to the linked cloud project.

The migration does not rewrite historical payable/finance journals. Existing requested/processing mock withdrawals remain valid; manual mode is selected only through the guarded approval workflow.
