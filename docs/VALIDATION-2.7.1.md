# Phase 2.7.1 validation

Automated acceptance checks cover:

- exactly seven volunteer-facing Province/Territory roots;
- supplied Division/District/Taluka counts for every Province/Territory;
- Islamabad District directly below Islamabad Capital Territory;
- representative hierarchy chains across Sindh, Punjab, KP, Balochistan, AJK and GB;
- mandatory full address and Taluka/Tehsil on submitted volunteer profiles;
- optional manually entered Union Council;
- hiding synthetic integration fixtures from the volunteer location picker;
- compatibility fixes for Phase 2.6 version regression and Phase 2.7 geography fixture hierarchy.

Run:

```bash
node scripts/test-geography-reference.mjs
npm run preflight
npx supabase migration up --local
npm run test:local
npm run test:operations
```
