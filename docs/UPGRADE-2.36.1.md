# Upgrade to FieldLance 2.36.1

Baseline: validated FieldLance 2.36.0.

## Apply

1. Back up the database and current project source.
2. Apply the 2.36.1 patch only to the expected 2.36.0 source baseline.
3. Install dependencies with the project Node version.
4. Apply the new local migration without resetting existing data.
5. Verify generated database types.
6. Run the dedicated 2.36.1 regression, full test suite, TypeScript check and preflight.

Recommended local commands:

```bash
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run types:check
npm run test:self-publish-2361
npm run test
npm run check
npm run preflight
```

Do not run a database reset on a populated environment just to apply this upgrade.

## Existing records

- Published/approved Organization templates remain published and start with moderation status `allowed`.
- Existing operational projects remain operational and start with moderation status `allowed`.
- Old submitted/changes-requested/rejected Organization template drafts that never published a template return to editable `draft` state.
- Old submitted/changes-requested/rejected Organization project drafts that never created an operational project return to editable `draft` state.
- Historical review events/notes are preserved for provenance.

## Cloud deployment

Only after local validation passes, review the migration diff and then apply the normal controlled Supabase cloud migration process. Do not treat `db push` as a substitute for local regression/preflight validation.
