# POEM 2.16.1 validation

## Automated release checks

```bash
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
node scripts/test-phase216.mjs
node scripts/test-phase2161.mjs
```

`test-phase2161.mjs` validates:

1. NGO Admin compensation configuration, Project Manager read-only behavior and Area Focal denial.
2. Project compensation defaults overriding legacy caller payment hints during opportunity creation.
3. Existing opportunity snapshots surviving later project-rate changes while new opportunities receive the new version.
4. Formal assignment offers inheriting the authoritative opportunity snapshot even when caller arguments try to supply different compensation.
5. Assignment compensation immutability and volunteer acceptance of the frozen contract.
6. Approved per-survey response generation of exactly one existing payable unit using the assignment snapshot.
7. Reconciliation idempotency and continued use of the existing payable engine rather than a parallel system.
8. UI removal of free-form assignment compensation editing in favor of project/opportunity snapshots.

## Manual browser acceptance

- As NGO Admin, open Project team and configure volunteer/paid compensation defaults.
- Confirm Project Manager can see the defaults but cannot edit them.
- Create a project recruitment opportunity and confirm the structured compensation is shown to volunteers.
- Change the project default and verify the already-created opportunity still shows its original snapshot.
- Select an applicant, create a formal offer and confirm compensation is not editable in the offer form.
- As volunteer, confirm My Assigned Surveys shows the offered rate/basis before acceptance.
- Accept the offer, submit a survey, approve it through an independent reviewer and confirm Workforce payables shows one unit at the frozen assignment rate.
- Confirm target reach/offline sync behavior from 2.16.0 is unchanged.
