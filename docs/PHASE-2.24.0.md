# FieldLance 2.24.0 — Notifications & Communication Center

## Objective

Turn the existing recipient-only inbox into an actionable communication workspace without replacing workflow source-of-truth state or inventing external provider integrations.

## Delivered

- Notification category, priority, action/deep-link, source metadata and archive state.
- 50-row paging with All, Unread, Tasks, Recruitment, Finance, Broadcasts and Archived views.
- Mark-all-read, individual read, archive and restore actions.
- Saved notification preferences for future email/push/category routing.
- Audited role/scoped broadcasts for FieldLance admins, Organization admins and Project managers.
- Task assignment and SLA escalation notifications linked back to Task Center.
- Insert-time metadata decoration so existing notification producers gain useful categories/actions without editing applied migrations.
- Responsive Communication Center UI across Field Worker, Organization, Project and FieldLance Staff workspaces.

## Boundaries

- In-app transactional notifications remain available regardless of future channel preferences.
- Email/push preferences are stored only; no provider delivery job or credential is introduced.
- SMS/WhatsApp is not integrated.
- Broadcasts do not bypass Organization/Project/RLS authorization.
- Deep links navigate to an existing page; they do not grant access to that page.
