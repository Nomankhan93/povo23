# POEM 2.12.6 Validation

## Automated gate

Run:

```bash
npm run preflight
npm run test:local
npm run test:operations
```

The focused embedded PostgreSQL suite is:

```bash
node scripts/test-phase2126.mjs
```

It verifies:

- an active POEM survey assignment appears automatically before the first survey;
- submitted/approved review states update counts without adding a manual experience row;
- approved work becomes verified POEM evidence;
- profile authorization governs third-party work-history access;
- manual/external experience remains independent;
- closing a worked project finalizes the project history;
- recruitment snapshot contains bounded verified POEM history and no permanent profile grant;
- Work experience UI separates POEM-generated and previous/external experience;
- anonymous callers cannot read the RPC.

## Manual browser acceptance

1. Sign in as a volunteer assigned to a survey project.
2. Open **Work experience** and confirm the project appears under **POEM verified work** as In progress.
3. Submit a survey. Refresh Work experience and confirm Submitted/Pending changes.
4. Review/approve that response as the authorized NGO reviewer.
5. Refresh the volunteer page: Accepted increases and the record is labelled POEM verified activity.
6. Complete/close the relevant work/project and confirm the history changes to a completed POEM-verified record.
7. Add a previous/external experience entry and confirm it remains separately editable/requestable.
8. From an authorized shared-profile viewer, confirm only verified POEM evidence is visible and beneficiary answers/private documents/payment data are absent.
9. Revoke profile access and confirm future third-party work-history reads fail.
10. Apply to a public opportunity with recruitment-profile consent and confirm the application snapshot contains bounded POEM verified work but creates no permanent profile share.

## Known boundaries

POEM 2.12.6 does not calculate volunteer levels or performance rankings. Accepted survey counts are evidence, not a quality score. Project/template names currently provide the survey-field label; a formal specialization taxonomy remains a later phase.
