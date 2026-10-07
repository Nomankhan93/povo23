# FieldLance 2.41.11 — Canonical Routing & Production Domain Readiness

Baseline: FieldLance 2.41.10. This is a frontend/deployment routing patch; no database migration is added.

| Surface | 2.41.10 | 2.41.11 |
| --- | --- | --- |
| Email verification callback | Supabase redirects to `/auth/callback`, parser treats it as unknown | transient callback route recognized; successful session replaces callback with `/` before workspace resolution |
| Unknown nested workspace path | known prefix could return a workspace with `page = null` | invalid slug/extra segments return `unknown` and use the existing Page not found UI |
| Project tabs | arbitrary tab string accepted and UI silently fell back to Overview | only supported project tabs and exact entity shapes are accepted |
| Public certificate URL | `/?certificate=<code>` | canonical `/verify/<code>`; legacy query links remain supported and canonicalize in-browser |
| Vercel deep-link refresh | repository had no SPA fallback configuration | filesystem-first Vercel routing falls back remaining routes to `/index.html` |
| Project-scoped tool prefix | mixed `/projects/:id/*` and `/project/:id/*` semantics | compatibility retained; no forced bookmark migration in this release |

## Routing invariants

- Browser paths are not an authorization boundary.
- `my_workspace_access`, current project visibility and source-specific RPC/RLS checks remain authoritative.
- Unknown top-level and nested paths fail closed to the existing 404 experience.
- Browser history and unsaved-authoring protection continue to own navigation writes.
- Public certificate verification remains public only when the certificate holder enabled sharing; this patch changes URL shape, not data exposure.
- Static deployment assets must resolve before the SPA fallback.

## Production-domain target

The application is designed for a root-relative app origin such as `https://app.fieldlance.app`. A separate public site can later use `https://fieldlance.app`. The current app should not be mounted beneath a path prefix such as `/platform` because existing application URLs intentionally begin at `/app`, `/org`, `/staff`, `/projects`, `/access`, `/reset`, `/auth/callback` and `/verify`.

## Non-goals

No database/RLS/grant changes, no role changes, no Supabase hosted-setting mutation, no domain purchase or DNS mutation, no Vercel deployment, and no forced `/project` bookmark migration are included.
