# FieldLance 2.25.2 — Frontend Navigation & Workspace IA Stabilization

- Desktop sidebar: expanded 280px, compact 76px, persisted preference with storage-failure fallback. Mobile drawer retains full labels and existing focus trap/Escape controls.
- SidebarNavigation component handles collapsible sections, active page, accessible icon labels, native title hints and unread counts. Navigation list scrolls separately from header and sign-out controls. Secondary enrollment actions sit under Add workspace.
- Workspace-specific groups are presentation of the existing authorized page set: no group creates access. Unknown future authorized destinations are retained in Other tools instead of silently disappearing.
- Worker: Overview, Find work, Career, Profile, More. Organization: Overview, Work, Finance, Governance, Impact operations. Staff: Overview, Organizations & people, Field delivery, Finance, Governance, Impact operations, System. Project/applicant/access contexts have separate groups.
- Organization application and verification labels updated without renaming internal table/function/page identifiers. Role labels use Organization/Field Worker. Audit actors use names from already-authorized account data, with technical IDs expandable.
- Email/Push preference controls hidden until transport integration exists; saving in-app preferences preserves stored values for those channels.
- Wallet Sandbox import, navigation and render gated by development mode. This is a frontend utility restriction, not a change to existing server finance permissions or provider configuration.
- Neutral footer positioning: Field workforce & operations platform.

No database migration, new account settings placeholders, permission changes, finance ledger changes, organization team self-service or project workspace rewrite. Next: 2.26 paid-work funding assurance and project finance closure after operational validation of 2.25.1/2.25.2.
