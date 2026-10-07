# Upgrade to FieldLance 2.41.11

This release is frontend/deployment-routing only. It adds **no Supabase migration** after the 2.41.10 `00570` migration.

After applying the patch:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm run test:routing-domain-24111
npm run test:routing-236
npm run test:notification-routing-2413
npm run release:consistency
npm run check
npm run preflight
git diff --check
```

`npx supabase migration up --local` is not required specifically for 2.41.11 if the validated 2.41.10 migration state is already applied. Do not create an empty migration merely for this release.

## Custom-domain follow-up

When the production app domain is connected, configure hosted Supabase Auth to allow the actual production origin, including:

```text
https://app.fieldlance.app/auth/callback
https://app.fieldlance.app/reset
```

Keep the local-development redirect URLs as needed. If a different purchased domain is chosen, substitute the real app origin; source code intentionally uses `location.origin` instead of hard-coding a domain.

No Git push, Vercel deployment, DNS mutation, hosted Auth mutation or remote database push is performed by this patch package.
