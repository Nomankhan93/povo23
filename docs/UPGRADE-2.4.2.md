# Upgrade to POEM 2.4.2

This patch targets an existing POEM 2.4.1 project. There is no new database migration.

## Apply

Place `poem-test-cleanup-compatibility-2.4.2-patch.zip` in:

```text
/home/noman/projects/
```

Then run:

```bash
cd /home/noman/projects/poem-phase1.1
rm -rf /tmp/poem-test-cleanup-compatibility-2.4.2-patch

unzip -o /home/noman/projects/poem-test-cleanup-compatibility-2.4.2-patch.zip \
  -d /tmp/poem-test-cleanup-compatibility-2.4.2-patch

python3 /tmp/poem-test-cleanup-compatibility-2.4.2-patch/apply_patch.py \
  --project /home/noman/projects/poem-phase1.1 \
  --check

python3 /tmp/poem-test-cleanup-compatibility-2.4.2-patch/apply_patch.py \
  --project /home/noman/projects/poem-phase1.1
```

## Validate

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev
npm run preflight

npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

The last command should end with both the operational PASS and:

```text
PASS fixture cleanup: canonical links, orphan identities and local operation fixtures removed.
```

There should be no `Fixture cleanup incomplete` warning.

No `npx supabase db push` is required specifically for 2.4.2 because this patch adds no migration. If 2.4.0/2.4.1 migrations are still pending on cloud, push them only after all local validation passes.
