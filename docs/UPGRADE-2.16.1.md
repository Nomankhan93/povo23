# Upgrade to POEM 2.16.1

From the POEM project root:

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
node scripts/test-phase214.mjs
node scripts/test-phase2141.mjs
node scripts/test-phase2142.mjs
node scripts/test-phase215.mjs
node scripts/test-phase2151.mjs
node scripts/test-phase216.mjs
node scripts/test-phase2161.mjs
```

Migration added:

```text
20261008000400_project_compensation_assignment_contract.sql
```

After all local checks pass:

```bash
npx supabase db push
```

## Compatibility notes

- Existing assignments/payable rows are preserved.
- Existing unpaid project opportunities are mapped to structured volunteer/unpaid terms.
- Existing paid opportunities with only legacy free-text payment terms remain historical and must be replaced before a new structured assignment is offered from them.
- Existing project compensation defaults start as volunteer/unpaid until an authorized NGO Admin/POEM survey manager changes them.
- 2.16.0 soft target/recruitment behavior is unchanged.
