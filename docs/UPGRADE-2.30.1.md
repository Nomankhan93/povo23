# Upgrade 2.30.0 to 2.30.1

Run the patch installer with --check first, then apply. The installer checks version and SHA-256 hashes, refuses unexpected files, verifies payloads and backs up replaced files.

```bash
npm ci
npx supabase migration up --local
npm run preflight
npm run test:local
```

No database reset is needed. The forward migration also repairs documents already left in deleting state: open Documents and retry Remove.
For a linked hosted project, review and apply the forward migration through your normal deployment process after local validation.

If source verification reports a conflict, preserve local edits and reconcile against the expected 2.30.0 source before applying. Do not force overwrite.
