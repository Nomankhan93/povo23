# FieldLance 2.41.12 validation

## Fast required checks

| Check | Required result |
| --- | --- |
| `npm run test:auth-session-24112` | PASS |
| `npm run test:identity-workspaces` | PASS |
| `npm run test:routing-domain-24111` | PASS |
| `npm run release:consistency` | PASS |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

`npm run test:local` is recommended when local Supabase is already running because it exercises real Auth plus cross-user RLS/storage boundaries. Full historical preflight is reserved for certification rather than repeated after this patch.

## Dedicated auth regression

The 2.41.12 regression proves:

- manually opening `/reset` with a normal session does not authorize the new-password form;
- recovery authorization is bound to the same session user and current browser tab;
- `PASSWORD_RECOVERY` is the event that records recovery authorization;
- expired/rejected reset redirect errors are surfaced without retaining transient fragments;
- the Auth component refuses `updateUser({ password })` unless recovery and session are both present;
- the auth event subscription wins over a stale `getSession()` completion;
- local Supabase configuration enables secure password-change reauthentication;
- 2.41.11 routing behavior remains compatible.

## Manual browser acceptance

Using local Mailpit or a test hosted project:

1. Sign in normally and manually open `/reset`; verify the app offers a reset-link request and never shows the new-password form.
2. Request a password reset, open the newest recovery email and verify the new-password form appears only from that recovery flow.
3. Reload the valid recovery page in the same tab and verify it remains usable for the same recovery session.
4. Set a new password and verify the app clears recovery state and returns to the signed-in workspace.
5. Open an expired/invalid recovery link and verify a useful error plus a fresh reset request are shown.
6. Confirm signup `/auth/callback` and ordinary sign-in still enter the expected workspace.
