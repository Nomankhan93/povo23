# Upgrade to FieldLance 2.41.12

No Supabase database migration is added after the 2.41.10 `00570` migration.

After applying the patch, use the fast risk-based validation path:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm run test:auth-session-24112
npm run test:identity-workspaces
npm run test:routing-domain-24111
npm run release:consistency
npm run check
npm run build
git diff --check
```

If local Supabase is already running and you want runtime Auth/RLS confirmation, additionally run:

```bash
npm run test:local
```

A full historical `npm run preflight` is not required for every patch and is deferred to release certification or when a broader auth/database change needs it.

## Hosted Supabase follow-up

Before production launch, verify in hosted Auth settings:

- Secure password change / reauthentication is enabled.
- Require current password when changing password is enabled for normal signed-in password changes.
- Leaked-password protection is enabled.
- Production `/auth/callback` and `/reset` redirect URLs are allowlisted.

The repository can model secure-password reauthentication locally, but hosted-only password-change policy still needs to be set on the deployed Supabase project.
