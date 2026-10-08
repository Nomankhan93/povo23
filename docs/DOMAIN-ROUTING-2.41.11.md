# FieldLance production domain and route contract — 2.41.11

Recommended production layout:

```text
fieldlance.app              public/marketing site (or temporary redirect)
www.fieldlance.app          redirect to fieldlance.app
app.fieldlance.app          FieldLance application
app.fieldlance.app/verify/:code   public certificate verification while verification is hosted by the app
```

The application should keep one app origin for Field Worker, Organization and Staff roles. Do not split roles into separate subdomains; workspace authorization and route scope are already handled inside the app.

## Canonical application families

```text
/app/*
/org/:organizationId/*
/staff/*
/projects/:projectId/*       project workspace tabs/deep links
/project/:projectId/*        existing project-scoped tool compatibility routes
/access
/onboarding/organization
/auth/callback
/reset
/verify/:code
```

The singular `/project` compatibility family is retained because current semantics distinguish project-scoped tools from project-workspace tabs. A future unification must ship with explicit redirects and bookmark/notification compatibility instead of silently changing meanings.

## Vercel behavior

`vercel.json` checks the filesystem first, then returns `index.html` for remaining paths. This preserves generated `/assets/*`, manifest/icons and other static files while allowing direct refresh/bookmark access to SPA routes.

## Supabase Auth

Historical 2.41.11 source used `location.origin`. As of 2.41.16, callback/reset/certificate links use the optional canonical `VITE_PUBLIC_APP_ORIGIN` when configured and fall back to the active browser origin otherwise. Hosted Supabase Auth must independently allow the deployed production origin. For the recommended origin:

```text
Site URL: https://app.fieldlance.app
Redirect URLs:
https://app.fieldlance.app/auth/callback
https://app.fieldlance.app/reset
```

Retain local redirect origins required by development/testing.
