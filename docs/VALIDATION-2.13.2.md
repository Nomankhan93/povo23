# POEM 2.13.2 validation

Run after applying the patch:

```bash
node scripts/test-phase2132.mjs
npm run check
npm run build
```

Then run the normal release gates:

```bash
npm run preflight
npm run test:local
npm run test:operations
```

Browser acceptance:

1. Volunteer, Partner NGO and POEM staff tabs remain available on sign-in.
2. Selecting each tab changes the role-specific story and post-login destination copy.
3. Signup remains available only for Volunteer and Partner NGO entry paths.
4. Password show/hide works without submitting the form.
5. Forgot-password and reset flows retain existing behavior.
6. Public auth UI does not display the internal release version.
7. Mobile shows a compact POEM brand header and a single-column form.
