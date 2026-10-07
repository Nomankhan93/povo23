# FieldLance 2.41.10 validation

Patch-build validation establishes the intended source/migration delta and adds a dedicated catalog regression. Full acceptance must be run in the normal FieldLance WSL/local-Supabase environment after applying the patch.

## Required checks

| Check | Required result |
| --- | --- |
| `npx supabase migration up --local` | PASS; applies only `20261013000570_security_advisor_rpc_surface_hardening.sql` |
| `npm run test:security-advisor-24110` | PASS |
| `npm run test:sql-authorization` | PASS |
| `npm run test:recruitment-hardening-2415` | PASS |
| `npm run test:collection-dates-2415` | PASS |
| `npm run types:check` | PASS |
| `npm run release:consistency` | PASS |
| `npm run check` | PASS |
| `npm run preflight` | PASS |
| `git diff --check` | PASS |
| `npx supabase db push --dry-run` | Only intended pending migration |

## Dedicated security regression

The new test checks effective catalog privileges rather than only migration text. It verifies the intentional anonymous certificate allowlist, explicit `search_path` on signed-in public definers, invoker conversion of the three safe wrappers, revocation of the historical candidate-search RPC, non-exposure of `app_private`, and retention of representative high-impact guarded owner-context RPCs.

## Hosted verification

After a separately authorized hosted migration, re-run Security Advisor. Also enable leaked-password protection in Auth password-security settings when supported. The intentional public certificate verifier can continue to be reported by Advisor; its existence is documented and tested rather than silently disabled.

## Patch-build boundary

The analysis ZIP intentionally excluded `node_modules` and a running local Supabase stack. The generated patch therefore does not claim a full local/preflight PASS until the commands above are executed in the user's normal development environment.
