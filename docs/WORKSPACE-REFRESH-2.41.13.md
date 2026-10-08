# Workspace bootstrap and refresh contract — FieldLance 2.41.13

## Full workspace load

The full shell load remains the source for data that affects broad navigation and cross-workspace presentation: signed-in account, own profile, authorized organizations/memberships, recent activity, notification badge data, active project assignments and workspace access. It no longer waits for the full geography reference or account directory.

## Foreground refresh

Returning to a visible browser tab is a security/access freshness event, not a request to reload every authorized collection. The foreground path refreshes:

- the current account and suspension state;
- `my_workspace_access()` and resolved workspace;
- notification badge rows;
- active project staff assignments and their project rows;
- recent authorized audit activity (4 rows, or 100 when Activity is open);
- the current user's organization context used to preserve valid workspace labels/membership state.

The refresh intentionally does not fetch all geographies, all organizations, all memberships, or the account directory.

## Demand-loaded reference data

Geographies are loaded the first time a page that needs geography labels/pickers/maps opens. The in-memory cache is reused across workspace mutations and foreground events. Geography Manager explicitly invalidates the cache after a reference-data change.

The account directory is loaded only for Memberships, Accounts and Activity. Activity starts with a four-row recent preview and upgrades to the latest 100 authorized events only on the Activity page.

## Refresh deduplication

Browsers commonly emit both `visibilitychange` and `focus` when a tab returns to the foreground. A 1.5-second deduplication window prevents those paired events from duplicating the same access refresh while preserving later freshness checks.

## Authorization

This optimization never treats cached UI data as authorization. RLS/guarded RPCs remain authoritative, and foreground access revalidation continues before the existing workspace resolver applies the current scope.
