# FieldLance 2.41.13 validation

## Fast required checks

| Check | Required result |
| --- | --- |
| `npm run test:workspace-refresh-24113` | PASS |
| `npm run test:auth-session-24112` | PASS |
| `npm run test:routing-domain-24111` | PASS |
| `npm run release:consistency` | PASS |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Full historical `npm run preflight` is intentionally deferred to security/database changes or final release certification.

## Dedicated regression

The 2.41.13 test verifies that:

- hidden-tab events do not trigger refresh and paired focus/visibility events are deduplicated;
- foreground refresh uses the narrow access-freshness path rather than `load()`;
- full workspace load no longer blocks on geography or account-directory hydration;
- only four audit events are used for bootstrap/Overview while Activity requests the larger history;
- the own volunteer profile is not queried twice;
- notification and profile-photo callbacks use narrow refreshes;
- foreground refresh still calls `my_workspace_access()`, checks account status and refreshes active project assignments;
- geography mutation explicitly invalidates the geography cache.

## Manual acceptance

1. Sign in and open Overview. Switch to another browser tab and return; confirm the workspace remains responsive and current access/notification state refreshes.
2. Trigger both browser focus and visibility transitions close together; confirm there is no visible loading reset/flicker.
3. Open My profile, Survey projects or a map and verify geography labels/pickers populate normally.
4. Open Activity and verify the full authorized activity list loads; return to Overview and verify the recent preview remains correct.
5. For a staff account, open Memberships/Accounts and verify account names and controls load on demand.
6. Change a geography in Geography Manager and verify the updated geography reference appears after the explicit refresh.
7. Suspend/revoke a test user's access from another session, return the user's tab to foreground and verify the current workspace no longer remains authorized.
