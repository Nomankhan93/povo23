# Upgrade POEM 2.12.3 → 2.12.4
## Recruitment Stabilization Revision

This package replaces the earlier **unshipped** 2.12.4 draft. Because that draft was never applied, install this revision directly on the current 2.12.3 project and then push its single forward migration.

Do **not** apply the older `poem-2.12.4-open-opportunities-patch*.zip` first.

## 1. Apply the guarded patch

```bash
cd /home/noman/projects/poem-phase1.1

patch_dir=$(mktemp -d /tmp/poem-2124-stable.XXXXXX)
unzip -o /home/noman/projects/poem-2.12.4-recruitment-stabilization-revision.zip -d "$patch_dir"

python3 "$patch_dir/poem-2124-recruitment-stabilization/apply_patch.py" \
  --project /home/noman/projects/poem-phase1.1 \
  --check

python3 "$patch_dir/poem-2124-recruitment-stabilization/apply_patch.py" \
  --project /home/noman/projects/poem-phase1.1
```

The installer:

- requires the exact 2.12.3 baseline version,
- verifies SHA-256 hashes for every existing file it will replace,
- refuses to overwrite unrelated local edits,
- verifies new patch files do not already exist,
- creates timestamped backups under `.poem-patch-backups/` before replacement,
- recognizes an already-applied identical 2.12.4 payload and exits safely.

If the check reports a hash mismatch, do not force it. Inspect/commit/stash the local change and re-run against the expected 2.12.3 baseline.

## 2. Install dependencies and run release gates

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev
npm run types:check
npm run check
npm test
npm run build
```

Or use the aggregate gate:

```bash
npm run preflight
```

The focused recruitment test is:

```bash
node scripts/test-phase2124.mjs
```

## 3. Validate local Supabase before cloud

If your local Supabase stack is already running:

```bash
npx supabase migration up --local
npm run test:local
```

For a disposable/local reset workflow, follow the project's existing local database procedure. Do not reset an existing production/cloud database just to install this release.

## 4. Push to linked cloud project

Only after local/preflight validation passes:

```bash
npx supabase db push
```

New migration:

```text
supabase/migrations/20261002000100_open_opportunities_volunteer_applications.sql
```

## 5. Manual acceptance

Use `docs/VALIDATION-2.12.4.md` and `TEST_CHECKLIST.md`. At minimum verify:

- all/area/invite-only visibility,
- application consent and snapshot privacy,
- close/reopen lifecycle,
- NGO Admin and POEM survey-manager review,
- independent-verification gates,
- retry-safe offer acceptance,
- direct survey assignment display,
- no applicant project/beneficiary access before activation.

## Important migration note

This revision assumes the earlier draft migration was **never applied**. If a database already contains the previous draft migration, do not edit migration history in place; create a new corrective migration instead.
