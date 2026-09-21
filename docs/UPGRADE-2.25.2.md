# Upgrade to 2.25.2

Requires the audited 2.25.1 patch and its database migration. Use the supplied apply_patch.py --check, then apply if there are no conflicts. Backups are automatic. Run npm ci and npm run preflight, then npm run dev.

No new SQL migration is included. Existing databases must already contain 20261009000900_identity_workspace_stabilization.sql. Test desktop expanded/compact sidebar, mobile drawer, group toggles, active-page expansion, keyboard navigation, unread count and workspace switching for Worker, Organization, Staff and project-scoped users. Check approval, password reset and offline draft preservation inherited from 2.25.1.

Production build should omit the MockEWalletSandbox component chunk. Existing backend mock-provider finance behavior is not disabled by hiding the development frontend utility.
