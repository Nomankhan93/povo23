# FieldLance 2.41.9 validation

Ubuntu WSL; Node 24.21.0 / npm 11.19.0. Baseline 7780d95. All work remains uncommitted.

| Check | Result |
| --- | --- |
| npm run check | PASS |
| 2.41.9 mobile/desktop behavioral suite | PASS (including native validity and all survey action clearance) |
| test:browser-recruitment-2418 | PASS |
| test:browser-recruitment-2415 | PASS |
| test:browser-workflow-2416 | PASS |
| test:browser-241 | PASS |
| test:browser-network-2412 | PASS |
| test:browser-attendance-2414 | PASS |
| test:browser-map-2411 | PASS |
| Worker dashboard, notification center, task center, navigation and notification routing checks | PASS |
| release:consistency / metadata:check | PASS |
| check:release-secrets | PASS |
| git diff --check | PASS |
| Supabase tree and generated types compared with 7780d95 | UNCHANGED |
| npm run preflight (includes production build) | PASS, exit 0 |
| npm run build | PASS, exit 0 |

Screenshots of actual components/CSS at 390px were inspected for opportunity hierarchy, consent readability and question controls. Browser screenshots/logs remain outside the repository under /tmp/fieldlance-2419-*.

A transient WSL shell connection timeout recovered on retry without resetting WSL, services or data. Browser-harness locator issues were corrected without weakening product assertions. The new sticky-progress geometry check exposed an existing panel overflow constraint; the fix is scoped to mobile panels containing an open survey form.

New suite: npm run test:browser-mobile-2419. Uses actual AppShell, SurveyForm, capture components, production CSS, real browser IndexedDB/encryption and a deterministic Supabase adapter. Responsive widths: 360/390/430; desktop 1280. It is not a hosted integration or physical Android test.

Coverage: linked lifecycle and application destination; guarded Home field continuation; mobile records-first hierarchy; filter open/apply/reset/state retention; Updates; task empty state; compact accessible sync/offline header; consent gate and optional adult representative disclosure; Previous/Next retention; validation section/focus; review reset and unchanged submit payload; encrypted draft reload and Save draft; overflow and bottom-navigation clearance; desktop inline filters/full form.

The existing 2.41.8 test now opens/closes the new mobile filter dialog before its existing reversed-response assertions. Those assertions are preserved. No backend fixtures, migrations or authorization tests are weakened.

Full preflight includes generated types, TypeScript, SQL/PGlite and client regressions and production build. Existing browser suites cover recruitment, workflow, map, offline, network and attendance. Notification routing/navigation checks remain required.

No hosted data/schema change, push, merge, Vercel deployment or commit.

The production build emits the existing non-blocking Vite advisory for the minified main chunk (519.75 kB); no performance refactor or threshold change was introduced.

## Changed file manifest

Modified tracked files:

- FILES.txt
- PROJECT_ANALYSIS_CONTEXT.txt
- README.md
- docs/ARCHITECTURE.md
- docs/PERMISSIONS.md
- docs/RELEASE-CHECKLIST.md
- docs/VALIDATION.md
- package-lock.json
- package.json
- project-tree.txt
- scripts/test-browser-recruitment2418.mjs
- src/app/AppShell.tsx
- src/features/notifications/Notifications.tsx
- src/features/operations/TaskCenter.tsx
- src/features/surveys/SurveyForm.tsx
- src/features/surveys/SurveySyncStatus.tsx
- src/features/surveys/capture.ts
- src/features/workforce/FieldWorkerDashboard.tsx
- src/features/workforce/WorkforceMarketplace.tsx
- src/features/workforce/recruitmentState.ts
- src/styles/design-system.css

New files:

- docs/PHASE-2.41.9.md
- docs/UPGRADE-2.41.9.md
- docs/VALIDATION-2.41.9.md
- scripts/fixtures/mobile2419/client.js
- scripts/fixtures/mobile2419/main.jsx
- scripts/test-browser-mobile2419.mjs
- src/features/surveys/surveyPresentation.ts
- src/shared/useNarrowScreen.ts
