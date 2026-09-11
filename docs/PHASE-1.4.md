# Phase 1.4 — Verified Experience & NGO Invitations

## Delivered

Volunteer work experience has its own organization, role, start/end dates, work description and version. Save privately as unverified or explicitly request NGO confirmation. Requests reveal only that entry and the account name to the selected NGO's active admins; they do not grant full-CV/document access. Only an active admin of that NGO can confirm/reject, and never their own record. POEM staff cannot impersonate a confirming NGO. A confirmed entry displays NGO and date on an authorized profile. Editing resets the review and badge; organization is immutable for an existing entry. Create another entry for another NGO. Rejection requires an owner resubmission before another decision.

In the NGO workspace, create an opportunity with immutable title/tasks, area, start/end dates, reply deadline and proposed paid/unpaid terms. Close and recreate if terms change. Invite from the volunteer directory after shortlisting. Both active NGO-admin membership and current explicit profile sharing are required. One invitation per opportunity/person is allowed; repeated sending produces an error rather than another notification.

Volunteers accept/decline through their personal Invitations page. The database checks expiry and current status/version. NGO admins can cancel pending invitations. Closing an opportunity cancels pending invitations and preserves accepted/declined history. Sharing revocation also cancels pending invitations and hides invitation records from the NGO until access is granted again. Accepted historical responses remain visible to the recipient; they do not constitute an active assignment. Opportunity details remain available to previously invited recipients as history. Expired is computed from the server-enforced deadline; no background scheduler updates the stored pending status.

In-app notifications cover confirmation requests/reviews, new invitations, responses, cancellations and opportunity closure. Audit events record these actions. NGO shortlist notes remain private and are not sent with invitations. No external email/SMS/WhatsApp delivery is introduced.

## First-use workflow

1. Volunteer switches to My volunteer workspace → Work experience → Add experience. Select an active NGO, enter past/current dates, describe work and tick Request NGO confirmation.
2. Relevant NGO Admin switches to that NGO → Work experience and confirms/rejects with a reason. The owner sees the result; authorized profiles show confirmed entries.
3. NGO Admin opens Invitations and creates an opportunity. Enter reply deadline in the browser's local time; it is stored as an absolute timestamp. Date validation uses UTC server date.
4. Volunteer shares their profile with this NGO. NGO opens Volunteers, adds the person to its shortlist, then selects Invite to opportunity.
5. Volunteer opens personal Invitations, reads the immutable terms, and accepts/declines. NGO can see the response while profile access remains authorized.

## Boundaries

Acceptance indicates interest. It does not create a contract, payable amount, survey assignment, work completion, verified performance or additional document access. Payment terms are proposals only. This release includes no actual payout or gateway.

Experience confirmation is a historical NGO assertion, not legal identity verification or universal POEM endorsement. No evidence upload is required by this module. Entries have no public discovery. Audit snapshots preserve prior claimed facts and review history; private unsubmitted entries are not visible in NGO experience queues. No general purge or retention automation is added.

New experience/invitation/opportunity lists use 50-record pagination. Supporting organizations/accounts/geography selectors retain Phase 1.3 limits. Staff who also act for an NGO must switch workspaces; a platform role alone grants no invitation-management privilege. Personal experience and invitations are available from My volunteer workspace.

New tables: volunteer_experiences, work_opportunities, work_invitations. New migration: 20260914000100_phase14_experience_invitations.sql. Previous migrations remain unchanged. All business writes use guarded RPCs; no client direct table writes.

## Manual acceptance

- Verify personal and NGO workspace navigation, including a person with multiple NGO memberships.
- Save an unrequested experience and confirm NGO cannot see it. Submit and confirm only the relevant NGO sees the request, without CV or files.
- Confirm, edit and resubmit experience; badge disappears until fresh approval. Test rejection and stale tabs.
- Create paid/unpaid opportunities, invalid dates, missing paid terms and invalid deadline.
- Invite a shortlisted shared profile; repeat send and other-NGO send must fail.
- Accept/decline; second response fails. Confirm notification in NGO workspace.
- Close/cancel, expire a deadline, revoke sharing and suspend membership. Future actions must be blocked appropriately.
- Confirm accepting/declining/closing does not create any payment or assignment.
- Test filters, long titles, forms and page controls on mobile.

Automated tests run real migrations/RLS in PGlite with simulated Auth and Storage. Real Docker Auth/Storage HTTP and browser/mobile flows must be tested on the local stack. No production deployment is performed.
