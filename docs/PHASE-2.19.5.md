# FieldLance 2.19.5 — Complete Rebrand & Product Positioning

FieldLance 2.19.5 replaces the user-facing POEM product identity with **FieldLance** while preserving historical database/migration compatibility.

## Identity
- Brand: **FieldLance**
- Tagline: **Field Opportunities. Real Earnings. Real Impact.**
- Positioning: FieldLance is a field-work marketplace that connects organizations with verified people for surveys, community outreach, assessments, monitoring, data collection, and other field assignments — while enabling workers and volunteers to build experience and earn income.

## Included
- New FieldLance icon and wordmark supplied by the product owner.
- FieldLance browser title, favicon, mobile icon, manifest and offline-shell branding.
- FieldLance login/workspace/organization/finance/beneficiary/volunteer copy throughout the runtime UI.
- Navy/blue/green brand palette aligned with the supplied identity.
- `FL-BEN-########` beneficiary display identifier in the runtime UI.
- Forward compatibility migration so canonical search accepts both new `FL-BEN-` and historical `POEM-BEN-` identifiers.
- Package identity changes from `poem-phase1-1` to `fieldlance-platform`.

## Compatibility boundary
The following historical/internal identifiers are intentionally NOT renamed: applied migration filenames, `poem_*` database columns/statuses/event names/policies/bucket names, legacy local-storage keys, audit action identifiers and old historical release documents. Renaming them would create needless data/migration risk and is not required for the FieldLance product identity.
