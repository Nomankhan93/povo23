# FieldLance 2.42.2 validation

## Dedicated regression

`npm run test:survey-template-builder-2422` verifies:

- no database migration was added;
- routes and capability implementation remain byte-identical;
- survey question model/type identifiers remain byte-identical;
- template-library and unsaved-authoring guard implementations remain unchanged;
- existing draft save, publish and moderation RPC callbacks remain wired;
- add/remove/duplicate/reorder, validation and conditional-logic behavior remain wired;
- preview and publish action wiring remains present;
- library, drafts, builder and published-version presentation are separated;
- desktop Questions / Canvas / Settings regions exist;
- mobile/tablet use shared sheet/drawer primitives;
- `SurveyTemplates.module.css` uses shared `--fl-*` tokens, contains no feature palette, no broad global selectors and no operational typography below 12px;
- Survey Form, Survey Project Detail, Survey Review Queue and Offline Field Workspace remain byte-identical;
- Supabase client and migration authorization surface remain unchanged.

## Compatibility regressions

Also run the 2.42.1 Project Workspace, 2.42.0 foundation, navigation/capability, routing and accessibility targeted regressions plus release consistency, typecheck, build and `git diff --check`.

## Environment caveat

If project dependencies are not available in the validation environment, do not claim `npm run check` or `npm run build` passed. Run those two commands on the normal FieldLance workstation after `npm ci`.
