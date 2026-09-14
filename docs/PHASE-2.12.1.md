# POEM 2.12.1 — Dependent area selection

Built against the supplied `poem-phase1.1-analysis(3).zip` (2.12.0), preserving its existing customizations.

## Changes

- Survey projects → Collection area: alphabetical dependent Province/Territory, Division, District, Taluka/Tehsil, Union Council and Village/Ward controls.
- Controls follow actual parent-child relationships. A configured district directly under a territory works without an invented division. Only configured child levels appear.
- Stop at District to cover the whole district; select the “Whole [parent] / no narrower selection” option to clear descendants. Changing any ancestor clears the old descendant selections immediately.
- Survey projects retain existing support for province/division-wide collection as well as narrower areas. New projects require an active, complete geography path. Existing project geography IDs are not rewritten.
- NGO operations: browse the same hierarchy, choose District or narrower, press Add area, review the selected list, and Save operations. Areas from multiple provinces remain selected. Remove affects only the selected area until Save operations commits.
- Exact duplicate IDs are prevented; maximum 100 selected areas matches the server. Parent/child coverage overlaps are not silently normalized, because that could remove existing choices.
- Existing inactive NGO areas remain visible and can be saved unchanged. New inactive areas cannot be added; after removing/saving an inactive area, it cannot be re-added until active again. Unknown/unloaded saved IDs display a fallback label and are not silently discarded by the UI.
- Existing profile-specific GeographyPicker is unchanged. The shared operational selector supports all configured active province roots, not only Pakistan reference-code roots.

## Database

One forward migration: `20260930000100_area_selection.sql`.

`save_ngo_operations` now accepts district/taluka/UC/village/ward, retains previously assigned inactive areas, and keeps existing POEM NGO-management permissions, version checks, atomic writes, program validation and audit behavior. It does not grant NGO Admins new write permissions. No geography rows are inserted, renamed, reordered in storage or deleted. Prior migrations remain unchanged.

## Testing

Nine helper/rendering scenarios cover alphabetical order, hierarchy filtering, whole-district selection, parent resets, configured UC/village/ward, skipped division, invalid/inactive ancestry, duplicate prevention, saved selection retention and the 100-area cap. Six SQL scenarios cover fine-grained areas, deduplication, stale updates, inactive preservation/re-add denial, invalid IDs and authorization.

Real browser/mobile interaction and hosted Supabase migration acceptance remain local checks. Server rendering does not prove dropdown interaction or mobile layout.

## Manual checklist

1. Apply migration and open Survey projects → Create project. Provinces must be alphabetical. Choose Sindh and follow the configured hierarchy to Umerkot.
2. Stop at Umerkot district and create a test project; verify the district ID is saved. Create another for Kunri taluka and, if configured, UC/village.
3. Change province while a village is selected; old division/district/taluka/UC/village values must clear.
4. Check a configured territory without a division. No empty mandatory division should block selection.
5. Partner NGOs → Operating areas/programs: existing saved areas must appear. Add areas from different provinces; select the same area again and check Add is disabled.
6. Remove one area and save; reopen and verify only that area was removed. Other selected IDs and programs remain.
7. Deactivate a previously saved area's ancestor in a test database. The saved area should remain labeled inactive; changing programs must preserve it. New selections under that ancestor must be unavailable.
8. Open operations in two tabs. Save in one, then try the stale tab; expect version conflict rather than lost selections.
9. Test keyboard Tab, native select keyboard controls and mobile widths. Check long selected-area paths wrap and Remove remains reachable.

Volunteer assignment visibility (Issue 2) is not changed by this area-selection patch.
