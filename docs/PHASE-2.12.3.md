# POEM 2.12.3 — Membership management actions

POEM Admin and Super Admin can now use actions on each membership row:
- Edit role: choose NGO admin or Member; confirm then Save role.
- Remove membership access: confirm to suspend this membership using the existing audited set_membership RPC.
- Restore membership access: confirm to restore its stored role.

Account identity, other organization memberships, survey data and history are retained. This does not revoke separate project assignments, platform roles or clear already downloaded offline data. It is membership suspension, not account deletion or comprehensive offboarding.

To replace an NGO administrator, use the existing form to assign a registered replacement account as active NGO admin, then remove the old account's membership access. This is a two-step operation, not atomic transfer. The existing backend allows removing a last NGO admin; assign the replacement first when continuity is needed. POEM admins retain the ability to restore membership.

No database migration or new privilege is introduced. Only POEM Admin/Super Admin see this existing management screen. Existing RPC validates authorization and appends the membership audit event. UI buttons are disabled while saving; failed requests use the existing error display. The editor resets after a successful role/status change.

Validation: TypeScript check, existing stabilization SQL permission tests and production build/field-worker checks. Installer checked on baseline and against modified source. Live browser clicks and cloud Auth/RLS integration remain manual.

Manual checks:
1. Open Memberships as POEM Admin. Edit NGO admin to Member. Confirm the role changes; account still signs in.
2. Restore NGO admin role. Remove membership access; status should become Suspended.
3. Refresh the affected user's session/workspace and confirm membership-derived admin access is unavailable.
4. Restore membership; status becomes Active with the stored role.
5. Cancel each confirmation; no change should occur.
6. Assign another registered admin, then suspend the prior admin. Verify the replacement can open the NGO workspace and own projects.
7. Check separate project assignments/platform roles explicitly when comprehensive offboarding is intended.
