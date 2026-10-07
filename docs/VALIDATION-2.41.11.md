# FieldLance 2.41.11 validation

## Required checks

| Check | Required result |
| --- | --- |
| `npm run test:routing-domain-24111` | PASS |
| `npm run test:routing-236` | PASS |
| `npm run test:notification-routing-2413` | PASS |
| `npm run release:consistency` | PASS |
| `npm run check` | PASS |
| `npm run preflight` | PASS |
| `git diff --check` | PASS |

## Dedicated routing regression

The 2.41.11 regression verifies:

- exact `/auth/callback` recognition and successful-session cleanup;
- canonical `/verify/:code` generation/parsing plus legacy `?certificate=` compatibility;
- strict rejection of unknown workspace slugs and malformed extra path segments;
- strict project workspace tab/entity patterns;
- representative route generator/parser round trips for personal, organization, staff and project-scoped workspaces;
- compatibility of existing `/project/:id/*` tool links;
- filesystem-first Vercel SPA fallback.

## Manual deployed acceptance

After a separately authorized Vercel deployment/custom-domain connection, manually open or refresh representative deep links instead of navigating to them from inside the SPA:

```text
/app/home
/app/work/applications/<authorized-id>
/org/<authorized-org-id>/home
/staff/home
/projects/<authorized-project-id>/overview
/auth/callback   (through a real verification flow)
/verify/<shared-certificate-code>
```

Valid authorized paths must load the SPA directly. Invalid paths such as `/app/not-a-page` and `/projects/<id>/not-a-tab` must show Page not found rather than Overview.

## Patch-build boundary

A local static routing regression can run without Supabase. Full `preflight` still depends on the normal project dependencies/environment and must be confirmed in the user's WSL development environment before deployment.
