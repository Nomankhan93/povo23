# POEM 2.11 validation

Build-workspace result: preflight passed. Final targeted TypeScript/recovery checks and production build passed after the navigation/auth-message refinements. Eight guarded installer cases passed. Real Supabase integration could not start because Docker/local Supabase is unavailable; browser/mobile acceptance remains pending.

Automated checks include generated database types, TypeScript, prior regression suites, 13 new SQL scenarios, eight resumable-upload/navigation scenarios, five encrypted-storage scenarios, and three built service-worker scenarios. Installer tests cover eight guarded upgrade cases.

SQL: authorized bounded bundle, owner/template/policy snapshot, idempotent file reservation, changed metadata/consent conflict, actual object acknowledgement, collector-only reference data, foreign access denial, renewed consent, stale template token, policy change, paused-project exact receipt replay, mutation/RLS and anonymous denial.

Protocol: lost PATCH acknowledgement, server-offset continuation, expired upload URL, quota failure before upload, untrusted URL rejection, invalid offset, expired credentials and awaited draft navigation. Storage: atomic encrypted metadata/bytes, owner isolation, offline marker and lock, receipt cleanup preserving drafts and owner-only explicit erase. Worker: static asset installation, no interception of private/API/auth requests and unrelated cache retention.

These are PGlite, mock transport, real WebCrypto/serialized IDB-model and worker-VM checks. They do not validate a real browser's IndexedDB implementation, storage eviction, Supabase HTTP/TUS server, camera or GPS. Docker and a browser executable are unavailable in this build environment. The WSL/device acceptance below remains required; no production deployment or hosted migration was performed.

## Real WSL and device acceptance

1. Run guarded `--check`, apply on 2.10.0, migrate without reset and execute preflight/local/operations checks. Verify an existing 2.10 draft and queued request survive the IndexedDB v2 upgrade. Close older POEM tabs if the upgrade reports it is blocked.
2. Build/preview, use the exact root URL on one origin, sign in and wait for **Offline app files installed**. Download an assigned project. An unassigned or suspended account must not download it.
3. Inspect the downloaded template/version, consent/policy, geography and own reference limits. Confirm NGO B and another collector do not receive the first collector's references.
4. Enable airplane mode, close/reopen the root page and open the downloaded project. Create a survey with household data and photo/PDF attachments. Wait for local save confirmation. Reopen the draft and confirm all answers and retained files are available.
5. Queue two different surveys in succession. Reconnect and use Sync now. Confirm each produces one response and the device inventory shows synchronized receipt IDs. Repeat sync/reload and verify no duplicate response.
6. On real Supabase Storage, interrupt an attachment transfer and reopen. Inspect HEAD/Upload-Offset and verify resume, not overwrite. Simulate a lost response after completion: committed-object acknowledgement should prevent creating another object. Test a stale/expired TUS URL, 401/403, unsupported HEAD/PATCH and low-storage failures. Original encrypted data must remain inspectable.
7. Change policy while a device is disconnected. Sync old work; a confirmed conflict must remain in attention. Refresh, recover for editing, obtain current consent and renew device file consent where needed. Verify the original request/reservation remains unchanged. Test stale template token rejection and immutable published versions.
8. Revoke assignment or pause the project: fresh upload/save/download must fail. An already acknowledged survey retry must still resolve its original receipt. Re-enable only through authorized governance workflows; no reset.
9. Expire the cached lease: collection must stop until refresh, while queued work is retained. A lost network event must not navigate away from an active online form and discard its edits.
10. Navigate away/close the form immediately after editing and reopen. Latest draft should have been flushed. Simulate abrupt browser termination separately and compare the last confirmed saved time; do not assume an in-flight write survived.
11. Sign out with pending work, reopen and sign in as another account: the previous owner's copies must be inaccessible. Sign back in as the owner to recover. On a shared device, close other tabs and test explicit erase; confirm other owners and server records remain intact.
12. Cleanup must refuse attachment deletion while drafts/queued requests exist. After successful sync, clean acknowledged local copies and verify server evidence is still available. Test browser quota/persistence refusal and ensure failed writes never display success.
13. Close the app during sync and reopen: foreground/manual sync resumes. Do not expect closed-browser background execution. Test two tabs, including a browser without Web Locks, for duplicate-safe server behavior.
14. Deploy a second static build in the test environment while a field form is open. An update may wait but must not force reload. Finish work, close tabs and reopen to activate it. Confirm API/auth/file data never enters Cache Storage.

Record browser/device, Supabase/Storage version, test origin, individual results and outstanding failures before widening the pilot.
