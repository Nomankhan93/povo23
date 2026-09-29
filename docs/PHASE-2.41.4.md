# FieldLance 2.41.4 — Attendance & Notification Correctness

- Restore online check-in without a device download. Offline check-in and checkout still require a fresh, owner-matched snapshot.
- Use an unambiguous attendance retry control, whitespace-tolerant confirmation matching, completed-refresh sequencing and native network-state assertions in browser acceptance.
- Keep unavailable notification feedback after history refresh. Known delegated-case access denial uses the same controlled unavailable flow; network errors remain errors.
- Fetch linked tasks by exact ID through `operational_task_detail`, independently of the queue cap, with current read permission and optional workspace scope checks. Pin the authorized target above queue results; let users change tabs normally. Refresh clears unavailable targets.
- New attendance review notifications use `attendance_session` and the exact session ID. `/app/field/attendance/:sessionId` fetches an authorized workday through `attendance_session_detail` outside the default recent range. Pending device evidence is retained when the link requires reconnection.
- Historical assignment-based attendance links and notification history remain unchanged.

Forward migration: `20261013000480_attendance_notification_correctness.sql`. Existing authorization helpers remain authoritative; anonymous detail access is denied. No historical migration is edited and no notification creates an access grant.

Behavioral coverage includes rendered notification clicks, task tabs and revoked detail, historical workday rendering, actual database lookups beyond 500 tasks, scope/owner denial, exact review metadata and Chromium online/offline attendance flows.

The earlier 2.41.2 documentation describes its intended release contract. This patch restores strict native-network verification and fixes the online attendance behavior found in the supplied 2.41.3 ZIP.
