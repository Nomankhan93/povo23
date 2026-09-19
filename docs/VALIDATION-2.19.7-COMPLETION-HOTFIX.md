# FieldLance 2.19.7 — Partner NGO Application Completion Hotfix

This corrective hotfix stays on package version `2.19.7` and adds no Supabase migration.

## Scope

- Show uploaded supporting documents in the Review step, including type/size and current state/review badge.
- Rename the Review shortcut to **Edit documents**.
- Add an in-place **Replace** control for ready supporting documents while reusing the existing private storage and document RPC lifecycle.
- Preserve recoverability: the replacement is uploaded/finalized before removal of the prior document is attempted.
- Present backend `submitted` consistently as applicant-facing **Under review** without changing the persisted workflow state.
- Refresh generated project metadata wording and explicitly preserve `.env.example` in analysis/handoff ZIPs.

## Unchanged architecture

- No database migration.
- No RLS/policy changes.
- No new storage bucket.
- No new document table or registry.
- No payment, beneficiary, recruitment, role or finance changes.
- Existing `partner_ngo_application_documents` RPCs remain authoritative.

## Validation

Run from `/home/noman/projects/poem-phase1.1`:

```bash
nvm use
npm ci --include=dev
npm run metadata:generate
npm run check
npm run test:ngo-application
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run metadata:check
npm run preflight
```

Then browser-check Review document visibility, Replace success/failure recovery, mobile layout, and the `Under review` status presentation.
