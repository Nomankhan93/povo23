# FieldLance 2.41.12 — Auth Recovery & Session Boundary Hardening

Baseline: FieldLance 2.41.11. This is an Auth/frontend configuration patch; no database migration is added.

| Surface | 2.41.11 | 2.41.12 |
| --- | --- | --- |
| Password reset route | `/reset` pathname alone selected reset mode | `/reset` only requests recovery; the new-password form requires an observed `PASSWORD_RECOVERY` session for the same user |
| Expired/invalid recovery link | could fall through to a generic auth state | captures Supabase redirect errors, removes transient token/error fragments and offers a fresh reset request |
| Recovery reload | no explicit recovery identity bridge | sessionStorage remembers only the recovery user for the current tab and is cleared on completion/sign-out/non-reset navigation |
| Existing signed-in session + `/reset` | could reach `updateUser({password})` from the reset form | cannot reach password mutation without recovery authorization; receives the reset-request flow instead |
| Auth initialization | `getSession()` and auth events could both write session state without ordering protection | auth subscription is registered first and a newer auth event prevents stale initial session state from overwriting it |
| Local Auth password change | `secure_password_change = false` | `secure_password_change = true` so old normal sessions require Supabase reauthentication |

## Security boundary

The browser route is not the server authorization boundary. FieldLance now uses Supabase's `PASSWORD_RECOVERY` event as the UI authorization signal for the reset form and keeps local Auth reauthentication enabled. Production should additionally enable the hosted Auth setting that requires the current password for normal password changes; Supabase recovery sessions are intentionally exempt from that requirement.

## Non-goals

No PKCE migration, no RLS/RPC/schema change, no role change, no SMTP/DNS mutation, no hosted Supabase setting mutation, and no new account-settings password-change UI are included.
