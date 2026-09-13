# Phase 2.7.1 — Pakistan geography reference & volunteer address

This patch replaces the volunteer-facing empty/test geography experience with the project-supplied Pakistan administrative reference hierarchy.

## Volunteer location workflow

- Province / Territory — seeded dropdown with exactly seven roots: Sindh, Punjab, Khyber Pakhtunkhwa (KP), Balochistan, Islamabad Capital Territory, Azad Jammu & Kashmir (AJK), and Gilgit-Baltistan (GB).
- Division — filtered by the selected Province / Territory.
- District — filtered by the selected Division. Islamabad Capital Territory skips Division and links directly to Islamabad District.
- Taluka / Tehsil / Subdivision — filtered by District and required for profile submission.
- Union Council — volunteer-entered text, optional.
- Full address — volunteer-entered text, mandatory.

The reference seed contains only the hierarchy supplied for this project. It does not add UC/village reference rows. Existing synthetic/test geographies remain in the database for referential safety but are excluded from the volunteer picker.

## Compatibility

Existing `details.area` is retained as a compatibility mirror of the new mandatory `details.address`, so directory/workforce views that still read `area` continue to work. Existing profiles with a legacy geography must re-select a seeded Pakistan reference location before their next submitted profile update.
