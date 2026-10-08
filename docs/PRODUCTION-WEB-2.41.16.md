# Production Web Security & Domain Launch — FieldLance 2.41.16

FieldLance remains one SPA origin for Field Worker, Organization and Staff workspaces. The recommended production layout is:

```text
fieldlance.app              public/marketing site
www.fieldlance.app          redirect to fieldlance.app
app.fieldlance.app          FieldLance application
app.fieldlance.app/verify/:code   certificate verification while hosted by the app
```

## Browser security baseline

`vercel.json` now uses higher-level filesystem-first SPA rewrites and applies production response headers to all application responses:

- Content Security Policy with `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'` and no `unsafe-eval`;
- only the current Supabase, OpenFreeMap and pinned MapLibre/unpkg runtime origins are allowlisted;
- `Permissions-Policy` disables camera/microphone/payment/USB and limits geolocation to FieldLance itself;
- HSTS, `nosniff`, frame denial, referrer policy and no-index response headers;
- app shell/service worker/manifest revalidate, while Vite fingerprinted assets may be cached immutably.

The field app still needs geolocation for explicit attendance/map evidence. This patch does not add continuous/background location access.

## Canonical application origin

`VITE_PUBLIC_APP_ORIGIN` is optional in local development and Vercel previews. When set in production it becomes the canonical origin used for:

- signup confirmation redirect: `/auth/callback`;
- password recovery redirect: `/reset`;
- public certificate verification links.

If the variable is absent the browser origin remains the compatibility fallback. Set the production Vercel value to the exact custom app origin before domain cutover:

```text
VITE_PUBLIC_APP_ORIGIN=https://app.fieldlance.app
```

Do not put a path, query, fragment or secret in this value.

## Supabase hosted Auth launch settings

Hosted Auth is configured separately from `supabase/config.toml`. Before switching the production domain:

```text
Site URL
https://app.fieldlance.app

Exact production Redirect URLs
https://app.fieldlance.app/auth/callback
https://app.fieldlance.app/reset
```

Keep explicit local/preview redirects only where they are genuinely required. Production should prefer exact redirect paths rather than a broad wildcard.

Also review/enable in hosted Auth:

- Confirm Email;
- secure/recent-password reauthentication for normal password changes;
- leaked-password protection where the Supabase plan supports it;
- production SMTP and sender identity;
- anonymous sign-in disabled unless intentionally introduced;
- appropriate Auth rate limits/CAPTCHA before public exposure.

## Domain cutover

1. Add `app.fieldlance.app` to the Vercel project and follow Vercel's current DNS verification records.
2. Set `VITE_PUBLIC_APP_ORIGIN` for the Vercel Production environment.
3. Configure hosted Supabase Site URL + exact callback/reset redirects.
4. Deploy and verify response headers plus `/auth/callback`, `/reset`, `/verify/:code`, `/app/*`, `/org/*`, `/staff/*` direct-open and refresh behavior.
5. Only after the app origin is healthy, point public marketing/root-domain navigation at the application where appropriate.

Do not split Field Worker, Organization and Staff roles across separate subdomains; authorization remains workspace/RPC/RLS based inside the same application origin.
