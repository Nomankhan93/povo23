Current release: [Phase 1.3 staff permission matrix](PHASE-1.3.md). Legacy roles below retain their prior permissions; Volunteer Manager now also reviews documents, NGO Manager manages geography/NGOs and Auditor reads audit events.

# POEM Phase 1.2 permission matrix

Permissions are enforced in PostgreSQL, not by hidden navigation alone. All public mutation RPCs verify the current `auth.uid()` and account status. Browser users have SELECT grants only on tables; all business changes use guarded functions.

| Action | Volunteer | NGO Admin | POEM Admin | POEM Super Admin |
| --- | --- | --- | --- | --- |
| Read/edit own CV profile | Yes, if not profile-suspended | Yes | Yes | Yes |
| Submit own profile | Yes | Yes | Yes | Yes |
| Read another volunteer | No | Only explicit grant to active NGO with active membership | Yes | Yes |
| Review another profile | No | No | Yes | Yes |
| Review own profile | No | No | No | No |
| Create/edit NGOs | No | No | Yes | Yes |
| Assign registered users to NGOs | No | No | Yes | Yes |
| Change platform role / account suspension | No | No | No | Yes, other accounts only |
| Grant/revoke own NGO profile access | Yes | Yes | Yes | Yes |
| View active partner directory | Yes | Yes | Yes | Yes |
| View profile audit | Own events | Own events | All events | All events |
| Direct table mutation / forged audit | No | No | No | No |

POEM Admin and Super Admin are platform roles. NGO Admin is a membership of a specific organization; it never grants platform roles. All registered accounts also have a personal volunteer profile.

## Access revocation

- Account suspended: protected table reads and all application mutations are denied on future requests; only own account status remains readable for the suspension screen.
- NGO suspended/inactive: NGO-based access to shared volunteer profiles stops.
- NGO membership suspended: that user's NGO access stops.
- Profile grant revoked: that NGO's administrators lose future access to the profile.
- Volunteer profile suspended: NGOs cannot view it and the owner cannot edit it; POEM admins can review it.

These controls cannot erase information a viewer already saw or copied. Refresh/reload to discard previously rendered data. Cross-NGO beneficiary sharing and fine-grained export controls are not implemented here.

## First-admin bootstrap

Signup metadata is untrusted. The Auth trigger copies only a bounded display name and email; platform role is always the database default `volunteer`.

The local bootstrap script requires direct access to the project's named PostgreSQL Docker container. It only promotes a confirmed account when no active Super Admin exists, acquires a transaction lock, and appends an audit event. It is not exposed as an anonymous/public RPC.

## Verification workflow

Draft → submitted (`pending`) → verified / correction required / suspended.

A draft cannot be approved. Every review requires a note and exact current version. Every profile save increments version and clears old approval; saving as draft returns to draft, submission returns to pending. A suspended profile must first be released by a POEM reviewer. Verified means reviewed CV information, not identity-document or field-performance certification.

## Phase 1.2 additions

| Action | Owner | NGO via profile share | POEM Admin / Super Admin |
| --- | --- | --- | --- |
| Read geographic hierarchy | Active account | Active account | Yes |
| Create/edit geography | No | No | Yes |
| Upload/remove own supporting files | Active account and allowed profile state | No additional rights | Own only |
| Read another user's document metadata/bytes | No | No | Yes |
| Review documents | No self-review | No | Other profiles only |
| Read/mark notifications | Own only | Own only | Own only |

Storage object writes are the exception to the public-table SELECT-only rule: Storage API INSERT/DELETE are authorized by RLS against reserved document metadata. There is no object UPDATE policy. Profile suspension blocks new uploads/finalization, while owner removal and reading remain available to an active account. Account suspension blocks all document access. Public URLs and NGO grants do not grant file access. Application download requests are audited, but direct authorized Storage reads require separate infrastructure logging.
