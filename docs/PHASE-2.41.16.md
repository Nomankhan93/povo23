# FieldLance 2.41.16 — Production Web Security & Domain Launch

This release hardens the browser/deployment boundary needed before a custom production application domain is exposed.

## Delivered

- modern Vercel filesystem-first SPA rewrites;
- CSP, HSTS, frame, MIME, referrer, permissions and no-index response headers;
- explicit cache policy for app shell/service worker/manifest versus fingerprinted assets;
- optional canonical `VITE_PUBLIC_APP_ORIGIN` used by Auth and public certificate links;
- production-domain environment gate for HTTPS canonical app/Supabase configuration;
- exact hosted Supabase callback/reset launch checklist;
- targeted production web security regression.

## Boundaries

No PostgreSQL/RLS/RPC schema change is made. Migration head remains `20261013000580_project_lifecycle_e2e_integrity.sql`. The CSP intentionally retains the current pinned MapLibre runtime host and OpenFreeMap tile/style host. Backend authorization remains independent of browser headers and navigation.
