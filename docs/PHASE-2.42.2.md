# FieldLance 2.42.2 — Survey Template Builder Redesign

## Scope

Presentation/UI-architecture refactor only. The Survey Template Builder now uses the shared 2.42.0 Operational SaaS primitives and a feature-local CSS Module. It separates the starter library, saved drafts, focused builder and published/moderation views instead of rendering every authoring surface at once.

## Builder structure

Desktop uses three coordinated regions:

- Questions navigator: ordered question list, selected state, type/required/conditional context and low-priority actions through `ActionMenu`.
- Survey canvas: selected-question prompt editing plus collector preview.
- Question settings: existing answer type/options, validation and conditional-logic controls.

Tablet hides the settings region behind the shared Drawer. Mobile keeps the canvas primary, moves Questions to `BottomSheet`, moves settings to `Drawer`, preserves 44px touch targets and uses the existing safe-area-aware overlay primitives.

## Preserved behavior

No changes to routes, capabilities, question-type identifiers, template/draft data model, dependency semantics, save/version rules, publish/moderation RPC names, RLS, migration history or authoring-navigation protection.

Survey Form, Survey Project Detail/Responses, Survey Review Queue and Offline Field Workspace remain outside this migration.

## CSS architecture

`src/features/surveys/SurveyTemplates.module.css` owns only Survey Template Builder structure and responsive layout. Shared colors, typography, controls, buttons, cards, badges, overlays and semantic states continue to come from `src/styles/fieldlance-2420.css` and `src/components/ui/FieldLanceUI.tsx`.
