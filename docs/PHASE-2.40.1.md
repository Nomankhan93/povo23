# FieldLance 2.40.1 — Field Evidence, Attendance & Release Stabilization

One forward migration fixes initial case-visit capture by incrementing the follow-up version before the existing revision trigger snapshots the row. New clients supply the expected version to `record_beneficiary_case_followup_location_versioned`. The old eight-argument endpoint remains compatible. Capture is allowed once for a scheduled field/office visit; edits are not silent overwrites. Exact retries require current case authorization, the original actor and unchanged evidence, and return the current follow-up version without another revision. The client retains the original capture request for retry after an uncertain response. Closing the page loses that in-memory retry; reload detail before capturing again.

Delegated case detail now includes explicit location fields. No background tracking, new attendance model, finance model or expanded role grants are introduced.

Attendance refresh has one policy loader, keyed to the active project, with stale response cancellation. Device evidence is encrypted before opening the IndexedDB write transaction. Queue operations verify the current owner; existing pending captures cannot be silently replaced. Compare-and-swap writes and deletes retain concurrent changes. Unreadable evidence and sync failures are surfaced. Offline retries retain request IDs and captured times. The existing survey device inventory/erase interface is not expanded by this patch.

Boundary validation rejects missing/null/malformed geometry. Legacy malformed stored geometry returns unknown geographic quality. This is structural validation, not full topology validation. Boundary history is preserved.

The example environment contains placeholders. A source release scan detects privileged JWTs, Supabase secret keys and private-key blocks without printing values. Detection is a release guard, not a substitute for credential rotation or a general secret-management system.

The 2.40 test fixtures now use explicit PostgreSQL parameter typing, a valid attendance policy, accuracy above the configured threshold, and assignment acceptance before check-in.

The 2.17.2 finance bridge fixture explicitly uses UTC attendance policy to match its UTC payment dates; this removes its after-19:00-UTC failure without changing finance behavior.
