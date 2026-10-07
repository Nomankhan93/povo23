# Auth/session contract — FieldLance 2.41.12

## Recovery flow

```text
Forgot password
  -> resetPasswordForEmail(... /reset)
  -> user opens Supabase recovery email
  -> Supabase establishes a recovery session
  -> onAuthStateChange emits PASSWORD_RECOVERY
  -> FieldLance records the recovery user for this tab
  -> new-password form becomes available
  -> updateUser({ password })
  -> recovery marker is cleared
  -> route returns to /
```

`/reset` by itself is not evidence of recovery. A normal signed-in session that manually navigates there receives the reset-request UI instead of the password mutation form.

## Session ordering

The auth-state subscription is registered before the initial `getSession()` read. Once any auth event has been observed, the later initial-session promise may not overwrite session state. This avoids a stale initialization result racing a newer sign-in/sign-out/recovery event.

## Production Auth settings

Repository configuration enables local secure-password reauthentication. The deployed Supabase project must be reviewed separately because hosted settings are not mutated by source deployment. For production, enable both secure password change and current-password enforcement for normal password changes, while retaining recovery-session behavior. Keep leaked-password protection and production redirect URLs enabled as separate launch requirements.
