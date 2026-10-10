# FieldLance 2.42.9 — Beneficiary Cases

2.42.9 modernizes Beneficiary Cases and delegated case operations while preserving the existing case, assistance, distribution, follow-up, duplicate-support, ownership and closure contracts.

## Manager / organization case workspace

- Adds shared 2.42 operational summary metrics.
- Separates the main operational queues into **Cases**, **Distribution** and **Follow-ups** tabs.
- Uses shared `DataTable` presentation on desktop and `MobileRecordCard` presentation on narrow screens.
- Keeps the selected case detail and all existing needs, assistance request, distribution-plan, delivery, follow-up, ownership and closure actions intact.
- Keeps server-provided closure eligibility authoritative.

## Safe create retries

The backend already accepts caller-supplied identifiers for idempotent case, assistance-request, distribution-plan and follow-up creation. 2.42.9 now keeps one UUID for one exact create payload until success. A retry of the same payload therefore reuses the same identifier instead of manufacturing a second business record. Changing the form payload creates a new intent identifier.

Delivered-assistance recording retains its existing `deliveryId` behavior and duplicate-support preview/override contract.

## Delegated cases

Field Worker / Area Focal delegated views now use the same desktop/mobile operational presentation while preserving the restricted data boundary. Delegated users continue to receive only their explicitly assigned case context, needs and follow-up operations. Assistance approval, delivery recording, finance and organization administration are not added.

## Database / authorization

No migration is included. No RLS, grant, RPC signature, capability, route or Project Workspace integration changes are included. PostgreSQL authorization remains authoritative.
