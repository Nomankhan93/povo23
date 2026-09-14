# POEM 2.10 — Advanced survey capture

Upgrade baseline: 2.9.0. This release extends the existing survey domain and applies one forward migration. Existing published templates, project assignments, canonical identities, governance policies and historical response versions remain intact. Volunteer publication remains independent from identity verification.

## Delivered

- Twelve question types: text, number, date, choice, yes/no, multiple choice, phone, 13-digit identity number, reported household members, GPS, photo and document.
- Conditions reference an earlier choice or yes/no question. They can cascade; forward references, cycles and invalid condition values cannot publish. The client removes hidden answers immediately when a controlling answer changes. The server rejects submitted hidden keys, including stale device payloads, rather than silently retaining them.
- Number bounds and an on-or-after date comparison against an earlier date question. Multiple selections must be unique listed choices. Phone and identity formats are validated without claiming external identity verification.
- Household repeats capture name, birth date (optional if unknown) and relationship, up to 30 members. Invalid or incomplete rows must be corrected or removed before saving. A minor/unknown-age member requires representative name and relationship even when the primary respondent is an adult. Members remain reported survey answers; they do not automatically create or merge registry identities.
- GPS includes latitude, longitude, accuracy in metres and device capture time, or an explicit unavailable reason. GPS is device-reported evidence, not proof of attendance or an independently verified location.
- Private JPG/PNG photographs and JPG/PNG/PDF documents up to 5 MiB per question. The client checks file signatures; the server checks permitted question, current collector/project access, policy token, consent authority, and an actual storage object with matching size/MIME metadata before accepting its reference.
- Upload consent captures adult subject versus named guardian/representative authority, notice, purpose, version and time. The private object cannot be overwritten or deleted by ordinary users. Each reference is scoped to its collector, project and question.
- Authorized survey review displays structured answers and can request a short-lived private attachment link. The UI authorization is audited. Storage RLS also applies to direct SDK reads; those direct reads do not individually create this UI audit event. Signed URLs remain bearer links until their 60-second expiry.
- A final answer review and respondent-review checkbox before submission. Drafts can omit required survey answers but still require consent and valid identity/household inputs. Malformed supplied answers are rejected even in drafts.
- File validation extracted into a shared helper; no new PhaseXX.tsx modules, dependency upgrades, background jobs or changes to the existing receipt/retry pipeline.

## Operational boundaries

Photo/document bytes upload online in 2.10. Upload failure retains the original file outside the app; retry by selecting it again. The UI shows in-progress/success/error states, not percentage/resumable progress. Reservation records from failed uploads and detached evidence are retained for explicit operator cleanup; there is no automatic deletion or orphan purge. Existing encrypted device drafts/queues store uploaded references and JSON answers, not pending file bytes. Full offline attachment storage and resumable recovery belong to 2.11.

Household rows have a fixed three-field schema in this release; arbitrary nested repeat builders, independently conditional sections, signatures and configurable regex/calculated fields are not included. Apply the same condition to individual fields to group their visibility. Published templates remain immutable; cloning creates a new draft/version without changing old projects.

No malware scanner or issuer lookup is included. Browser file-header checks and MIME limits are not server-side content scanning. Keep sensitive uploads within the controlled pilot until the production file-security gate is complete. Retention remains governed by the existing manual review policy, not automated erasure.

Policy/assignment changes after an upload can prevent the subsequent response save. Refresh and resolve the access/policy issue; do not reset the database. Existing acknowledged request replay behavior is unchanged.
