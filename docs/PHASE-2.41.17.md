# FieldLance 2.41.17 — Mobile Field Worker Production Acceptance

FieldLance 2.41.17 converts the earlier mobile UX/browser work into a production acceptance boundary for the Field Worker web experience. It is a web/mobile-browser release, not an Android application release.

## Product hardening

- Opt the document viewport into `viewport-fit=cover`, activating the safe-area values already used by the Field Worker bottom navigation on notched/home-indicator devices.
- Protect the authenticated mobile header, drawer, worker content edges and sync overlay with safe-area insets while preserving the zero-inset desktop/Android layout.
- Keep mobile modal height inside the dynamic viewport plus top/bottom safe areas.
- Preserve the five-item touch-sized Field Worker bottom navigation, explicit attendance location capture, encrypted offline attendance/survey queues and static-only service worker cache boundary.

## Acceptance contract

The release adds a dependency-free source/config regression, a composed real-browser Field Worker acceptance command, a deployed-shell HTTPS check and a physical-browser checklist. Automated checks do not replace physical GPS permission, offline transition, keyboard and installed-PWA testing.

No database migration, RLS relaxation, continuous/background location tracking or Android-app feature is introduced.
