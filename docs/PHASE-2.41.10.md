# FieldLance 2.41.10 — Security Advisor RPC Surface Hardening

Baseline: FieldLance 2.41.9. This patch is a narrow database authorization-surface cleanup driven by the Supabase Security Advisor review. It does not mass-convert guarded RPCs or weaken server-side authorization merely to clear warnings.

| Surface | 2.41.9 | 2.41.10 |
| --- | --- | --- |
| `review_template_draft` | `SECURITY DEFINER` compatibility failure | `SECURITY INVOKER`; signed-in compatibility failure preserved |
| `review_project_draft` | `SECURITY DEFINER` compatibility failure | `SECURITY INVOKER`; signed-in compatibility failure preserved |
| `can_collect_project` | public self-only `SECURITY DEFINER` wrapper | `SECURITY INVOKER`; delegates to the existing authenticated `app_private.can_collect` helper |
| `survey_assignment_candidates` | historical signed-in RPC | browser execution revoked; historical function retained for migration/test reproducibility |
| `verify_field_worker_certificate` | anonymous + signed-in public verifier | unchanged intentional public verifier; grant re-stated and regression-allowlisted |
| Finance/funding/admin/payable RPCs | guarded `SECURITY DEFINER` | unchanged; authorization model retained |

## Security invariants

- No role receives broader privileges.
- The anonymous public `SECURITY DEFINER` allowlist contains only `verify_field_worker_certificate(text)`.
- Authenticated public `SECURITY DEFINER` RPCs must have an explicit function `search_path` configuration.
- `app_private` stays outside the PostgREST exposed schema list.
- High-impact finance/funding/payable/admin RPCs retain owner context because their existing authorization checks and protected-table access depend on the guarded RPC boundary.
- Current field collection still derives the caller from `auth.uid()` through `app_private.can_collect`; the public wrapper does not accept a worker identity.
- Permanent profile-share candidate discovery remains historical compatibility data, not a current workforce marketplace prerequisite.

## Hosted Auth warning

Supabase leaked-password protection is a hosted Auth setting rather than a SQL migration. Enable it separately in the project Auth password-security settings when supported by the project plan. The database patch does not claim to change that hosted control.

## Non-goals

No mass `SECURITY INVOKER` conversion, no broad function revoke, no RLS redesign, no frontend workflow change, no wallet/funding/payable behavior change, no certificate-data expansion, no hosted migration push, and no deployment are included.
