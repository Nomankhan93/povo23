# Mobile Field Worker production acceptance — 2.41.17

Run this checklist only after the exact production web build is deployed. Use a non-privileged Field Worker test account with a real published opportunity, accepted assignment, downloadable survey and attendance policy.

## Device matrix

Minimum release gate:

- Android Chrome, current stable, normal browser tab.
- Android Chrome installed/standalone PWA if installation is offered.
- iPhone Safari or an iOS WebKit browser when an iPhone is available; specifically inspect notch/top bar and home-indicator clearance.
- Portrait first; rotate once to landscape and confirm no horizontal page overflow.

This is mobile browser verification. Do not substitute an Android native-app smoke test.

## Production shell

1. Open the canonical HTTPS app origin directly and sign in.
2. Refresh `/app/home`, `/app/work/opportunities` and an assigned field-work route directly; no hosting 404 should appear.
3. Confirm header, drawer, dialogs and bottom navigation do not sit under a notch/home indicator.
4. Confirm Home/Work/Field/Earnings/Profile bottom-nav targets remain tappable, visibly selected and unobscured.
5. Add to home screen/install when supported, relaunch, sign in if required and confirm the same canonical app/session behavior.

## Recruitment and assignment

1. Open Work; opportunities must appear before secondary metrics on a phone viewport.
2. Open Filters, apply/reset filters and return without losing the mobile layout.
3. Open an application and an offered/active assignment; destinations must remain distinct.
4. From Home, use the active-work next action and reach the guarded field-work route.

## Attendance and explicit location

1. Start field work with location permission granted; inspect the captured quality/accuracy result.
2. Repeat on a test session with permission denied or GPS unavailable and verify the UI requests the policy-required explanation rather than inventing coordinates.
3. Toggle connectivity off only after required project/attendance data has been downloaded. Start/end a permitted offline workday and confirm queued-device status.
4. Restore connectivity; sync once and verify no duplicate workday is created.
5. Location capture must occur only on explicit check-in/check-out actions. No continuous/background tracking is expected.

## Survey capture and offline recovery

1. Download the assignment for field work while online.
2. Start a survey, grant consent, move between sections, enter data, then reload/reopen and confirm the encrypted device draft restores.
3. Verify validation reveals/focuses the section containing invalid data.
4. Check that sticky actions remain above the bottom navigation with the virtual keyboard open.
5. Go offline, save/queue permitted work, restore connectivity and synchronize. Confirm acknowledged records are not re-sent.
6. Confirm device lock/erase wording clearly distinguishes local device copies from server records.

## Map and network degradation

1. Open the Field Map online; verify the map renders or presents the existing explicit renderer fallback.
2. Deny location permission: attendance/survey UI must remain usable under the configured project policy.
3. Go offline and confirm basemap/financial/case limitations are stated rather than presented as available offline.
4. Restore connectivity and confirm compact sync state returns to connected without a full-page reload requirement.

## Release evidence

Record device/browser versions, viewport/orientation, production URL, date, test account identifier (never credentials), assignment/project IDs, and PASS/FAIL for every section. Keep screenshots only if they contain no beneficiary/private survey data.
