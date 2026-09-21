# FieldLance 2.30.0 validation

## Automated release gates

Run:

```bash
npm run types:check
npm run check
npm run test:project-workspace-230
npm run release:consistency
npm run preflight
```

The 2.30 project-workspace regression covers the forward migration and static frontend contract for the new project command center, project-scoped documents/activity, locked Finance/Governance, distinct Field Work/Responses modes, focused project entry from Survey Projects, and browser-prompt removal from project staffing controls.

## Database/security checks

- `project_documents` direct writes remain unavailable to authenticated clients.
- Read access requires an authorized active project relationship.
- Upload/delete RPCs require project-management authority.
- Storage insert/read/delete policies validate both bucket/path and document state.
- Finalization validates stored object size and MIME metadata against the reservation.
- Activity feed requires project-management authority and returns only explicitly project-tagged audit rows.
- Existing survey response evidence and organization compliance stores are unchanged.

## Browser checks

- Overview is not the Team screen.
- Field Work does not show the response-review/registry panels; Responses does not show collection/start-survey controls.
- Finance and Governance have no cross-project selector inside Project Workspace.
- Documents upload/download/remove and states are understandable on desktop and mobile.
- Project tabs scroll horizontally on narrow screens without squeezing labels.
- Confirmation/reason dialogs support keyboard Escape and restore focus after close.
- Organization/Staff project detail can open the full workspace and return to Survey Projects.

Real authenticated browser, Supabase Storage and linked-cloud tests remain deployment checks. Automated static/PGlite coverage does not claim full browser E2E certification.
