# FieldLance 2.19.8 validation

## Automated acceptance

```bash
npm run metadata:check
npm run check
npm run test:workforce-marketplace
npm run test:ngo-application
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run preflight
```

`test:workforce-marketplace` verifies the shared Field Worker/Organization lifecycle presentation, existing discovery/application/review/assignment RPC boundaries, application-scoped consent language, organization recruitment tabs/metrics, organization-logo reuse, responsive marketplace CSS, navigation continuity and the absence of a new Supabase migration.

## Migration check

```bash
npx supabase migration list
```

Expected Local/Remote head: `20261009000600` on both sides. 2.19.8 does not run `db push`.

## Browser QA

### Field Worker

- Available Opportunities shows published/open opportunities across active organizations according to existing server eligibility.
- Organization, payment, skill, work-date, deadline and area filters work.
- Opportunity cards show organization identity, project, area, dates, compensation, positions and application deadline.
- Apply requires application-scoped recruitment snapshot consent.
- My Applications shows pending/shortlisted/selected/rejected/withdrawn states clearly.
- Selected state alone does not claim active survey access.
- Formal offer appears in My Assigned Surveys and requires explicit Accept/Decline.
- Accepted assignment shows active survey access; direct assignments remain separately labelled.

### Organization

- Summary metrics render active opportunities, new applications, pending offers and active assignments.
- Opportunities / Applications / Find Field Workers / Assignments tabs work without changing authorization scope.
- Create, publish, close and reopen opportunity actions retain existing behavior.
- Application pipeline supports shortlist/select/reject and snapshot inspection.
- Selected applicant can receive a formal assignment offer.
- Find Field Workers retains project-scoped discovery and does not imply permanent full-profile access.
- Assignments retain cancellation/completion and structured completion feedback.

### Responsive

- No horizontal page overflow at common desktop/tablet/mobile widths.
- Tab strip remains usable on mobile.
- Metrics collapse 4 → 2 → 1 columns.
- Opportunity/candidate grids collapse to one column.
- Action groups and recruitment progress remain readable at narrow widths.
