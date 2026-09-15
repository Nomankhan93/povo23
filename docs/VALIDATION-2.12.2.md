# Validation — 2.12.2

Automated suite: `npm run preflight` (generated types, TypeScript, all existing SQL/helper tests, new template-library suite, production build and field-worker validation).

New scenarios cover ten built-ins through real existing SQL publication validation; independent copied IDs/condition remapping; incomplete draft save/publication rejection; optimistic version conflicts and immutable source context; cross-author RLS and RPC denial; idempotent publication and a single publish audit event; ordinary-account rejection; denied direct writes and size limits.

SQL runs on PGlite with the project's mocked Auth/Storage catalog. This is not a live Supabase API, Docker, browser or mobile verification. Native preview interactions and deployment remain manual checks. Existing large main bundle warning is not resolved by this patch.

## Manual browser checklist

1. POEM survey manager: open library; inspect all ten starters. Use Education; modify labels, add choices, duplicate a question and reorder with buttons.
2. Save an incomplete/blank draft, navigate away, return and open it. Verify fields and order persist.
3. Open the same draft in two tabs. Save one; the other's stale save must fail without overwriting.
4. Create a Yes/No parent and conditional child. Removing parent/moving child before it must be blocked. Clear condition, then remove. Preview condition switching.
5. Save valid draft then publish. Confirm version appears in published list and existing project still uses old version. Use next-version draft, edit and publish again.
6. Simulate a lost publication response after server commit; retry saved draft publication. Confirm only one new published version. Reload also shows draft marked Published and the published version list.
7. Switch to another survey manager: first author's saved drafts must be absent. NGO/volunteer must not gain template management access.
8. On mobile, inspect buttons and editing inputs. Preview is not full GPS/file/household capture; test those on an assigned project.
9. Confirm a built-in copy edit does not modify the library definition. Confirm leaving an unsaved draft warns on reload; save explicitly before in-app module navigation.
