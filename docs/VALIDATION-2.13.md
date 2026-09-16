# POEM 2.13 Validation

## Automated

```bash
node scripts/test-phase213.mjs
npm run check
npm run preflight
npm run test:local
npm run test:operations
```

The Phase 2.13 SQL suite checks:

- ordinary-account private draft creation;
- required submission fields/structured areas/programs;
- registration-proof upload and Storage isolation;
- submit-time edit lock;
- POEM changes-requested → applicant edit → resubmit lifecycle;
- document-review gate before approval;
- organization activation + first `ngo_admin` membership;
- applicant/outsider RLS isolation and denied direct table writes;
- frontend application/review destinations;
- RLS retained on all new public tables.

## Browser acceptance

- Signup copy explains one personal POEM account for volunteers/NGO representatives.
- Personal workspace shows **Partner NGO application**.
- POEM NGO-management workspace shows **NGO applications**.
- Submitted application is read-only for the applicant.
- Requested changes reopen the form/document controls.
- Approved applicant can switch into the organization workspace after refresh.
- Private application documents are not shown in volunteer profile sharing.
