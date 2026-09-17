# POEM 2.14.0 validation

## Automated target

`node scripts/test-phase214.mjs` exercises:

- server-stamped response/household geography;
- immutable response geography;
- whole-project Project Manager review;
- denial of POEM template publishing to Project Manager;
- focal-person RLS visibility for one assigned area only;
- cross-area review denial;
- focal denial of assignment-management authority;
- roster visibility boundaries;
- immediate authorization loss after role revocation or NGO membership suspension;
- RLS on new project-team tables and denial of direct table mutation.

## Full release gate

```bash
npm run types:check
npm run check
npm test
npm run build
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

## Manual/browser checks

The 2.14.0 release is intentionally a security/database foundation and does not yet add the dedicated Project Team UI. Use database tests/RPC checks for authorization acceptance; browser Project Team/workspace checks belong to the next 2.14.x UI patch.
