# FieldLance 2.19.6 — Visual System & Navigation

FieldLance 2.19.6 turns the 2.19.5 product rebrand into a reusable visual and navigation foundation without changing database, authorization or operational workflow behavior.

## Included

- Canonical FieldLance design tokens for navy, blue, emerald, canvas, surface, text, borders, radii and status states.
- Compatibility aliases for existing `--poem-*` CSS variables so working feature screens do not require a risky wholesale stylesheet rewrite.
- One master runtime brand lockup using the supplied blue/emerald FL icon plus live `FieldLance` text; the raster wordmark asset remains available but is no longer the primary navigation/auth lockup.
- Centralized navigation grouping in `src/app/navigation.ts` with dedicated **Work & earnings**, **People & recruitment**, **Field operations** and **Administration** sections.
- Public workspace labels **Field Worker**, **Organization** and **FieldLance Staff** while internal compatibility values remain `volunteer`, `ngo` and `poem`.
- Dark navy sidebar, blue selected surface, emerald active indicator, standardized navigation badges and a cleaner workspace selector.
- Contextual header with current page, active workspace, notification shortcut, offline-field access, sync state and low-emphasis release badge.
- Marketplace-aligned overview copy for Field Worker, Organization and FieldLance Staff workspaces.
- Shared visual foundations for buttons, cards/panels and neutral/info/success/warning/danger statuses.
- Responsive/mobile drawer styling that preserves the existing focus trap, Escape close behavior, inert main content and accessible navigation controls.

## Explicitly not included

- No Supabase migration or schema change.
- No RLS/RPC/role change.
- No route/deep-link rewrite.
- No payment, finance, beneficiary, recruitment or survey workflow behavior change.
- No mobile bottom navigation yet; worker-specific marketplace UX remains the next screen-level phase.
- No broad rename of historical `poem_*` database/storage/event/local-device compatibility identifiers.

## Next boundary

The next UI phase should be **2.19.7 — Field Worker Marketplace UX**, using this visual system for dashboard, opportunities, applications, assignments, work history, earnings and withdrawals rather than redesigning those workflows inside 2.19.6.
