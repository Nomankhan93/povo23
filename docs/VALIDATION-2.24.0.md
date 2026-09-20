# FieldLance 2.24.0 validation

## Automated

Run:

```bash
npm run types:generate
npm run metadata:generate
npm run metadata:check
npm run check
npm run test:notification-center
npm run test:task-center
npm run test:staff-operations
npm run test:organization-workspace
npm run test:field-worker-workspace
npm run test:workforce-marketplace
npm run test:ngo-application
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run preflight
npm run test:local
npm run test:operations
```

## Browser QA

- Field Worker: unread/read, deep links, archive/restore, preferences.
- Organization Admin: Organization-member broadcast and recent broadcast history.
- Project Manager: Project-team broadcast and action link.
- FieldLance Admin/Super Admin: Field Workers / Organization admins / FieldLance Staff / all-active audiences.
- Non-admin FieldLance role: no FieldLance-wide broadcast control.
- Task assignment/escalation produces an actionable Task Center notification.
- Email/push preference copy clearly states provider delivery is not active.
- Mobile layout has no horizontal overflow.
