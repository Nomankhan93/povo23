# Validation — 2.25.2

Run npm run preflight. New npm run test:navigation checks authorized page coverage/deduplication for all six workspace types, group placement, storage persistence/failure, labels, React-rendered accessibility and development-only sandbox gates. Existing identity/RLS/recruitment/finance/offline suites remain in preflight.

Manual browser acceptance: test 1440px desktop, compact icon mode, keyboard access to workspace selector and sign-out, closed-group navigation, 390px mobile drawer and return to desktop. Native title hints and accessible names identify compact icons. Stored desktop preference must not hide mobile labels.

Local schema tests and server rendering do not replace a live browser or Supabase authentication test. No cloud mutation is part of this patch build.
