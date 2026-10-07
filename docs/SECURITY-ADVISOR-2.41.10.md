# FieldLance 2.41.10 Security Advisor decision record

The 2.41.9 Security Advisor export contained one anonymous `SECURITY DEFINER` warning, a large set of signed-in `SECURITY DEFINER` warnings, and the Auth leaked-password-protection warning. A warning is treated as an execution-surface review signal, not automatically as a vulnerability.

## Changed now

1. `review_template_draft` and `review_project_draft` require no owner privilege because they only return the explicit retired-workflow exception. They are converted to `SECURITY INVOKER` while keeping authenticated execution for old-client compatibility.
2. `can_collect_project` is a self-only wrapper around `app_private.can_collect(uuid)`. The helper already has authenticated execution and derives identity from `auth.uid()`, so the public wrapper is converted to `SECURITY INVOKER`.
3. `survey_assignment_candidates` belongs to the historical permanent-profile-share candidate-discovery model and has no current source consumer. Browser execution is revoked without deleting the historical function.
4. The public certificate verifier is explicitly preserved as the anonymous exception because certificate holders opt into public sharing and the verifier returns the bounded public certificate projection.

## Intentionally retained warnings

Guarded finance, funding, payable, wallet, attendance, document, beneficiary/canonical and project-management RPCs are not converted just to reduce the warning count. Their bodies use explicit authorization/ownership checks and an empty function `search_path`; many need owner context to access protected rows while enforcing the application policy inside the RPC.

Examples retained by regression guard include `act_work_payable`, `approve_manual_e_wallet_withdrawal` and `release_project_funding`.

## Regression policy

`test-security-advisor-24110.mjs` fails when:

- another anonymous public `SECURITY DEFINER` function becomes executable;
- an authenticated public `SECURITY DEFINER` function lacks explicit `search_path` configuration;
- the three low-risk wrappers regain owner-context execution;
- the retired survey candidate RPC becomes browser executable;
- the certificate verifier loses its supported public contract;
- `app_private` becomes an exposed PostgREST schema; or
- representative high-impact guarded RPCs are accidentally changed away from their established owner-context contract.
