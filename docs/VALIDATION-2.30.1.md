# FieldLance 2.30.1 validation

Release checks: npm run types:check, npm run check, npm test, npm run build (combined by npm run preflight).
Focused checks: npm run test:project-workspace-230, npm run test:project-workspace-2301, node scripts/test-phase2141.mjs.

Automated coverage includes PGlite document upload/read/delete authorization and deletion retry, denied focal/outsider access, asynchronous draft navigation ordering and failure handling, permission combinations, source wiring and application status contracts.

Browser/deployment checks remain required: upload/download/remove through live Supabase Storage; switch tabs during survey edits, blocked capture and device storage failures; check lazy loading/error behavior, scoped roles and desktop/mobile layout. The Node/PGlite suite does not constitute browser or linked-cloud E2E certification.
