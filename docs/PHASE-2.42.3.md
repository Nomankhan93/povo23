# FieldLance 2.42.3 — Survey Collection & Response Review UX

## Scope

Presentation/UI-architecture refactor only for the existing Survey Collection Form, Capture Fields, Survey Responses/Response Review and Survey Review Queue. Survey engine semantics, callbacks, values, authorization, offline/retry behavior and database behavior are unchanged.

## Survey collection

`SurveyForm.tsx` keeps the existing presentation-section calculation and mobile stepping model but uses a focused desktop workspace: a compact progress navigator alongside the current section. Existing Consent, Person, generated `Questions N–M` groups and Review/Submit ordering remain intact. A compact status header surfaces only already-available project/template, connectivity, section progress, answered progress and local-draft/save state.

## Capture fields

`CaptureFields.tsx` keeps the same stored values and callbacks while improving the presentation of attachment evidence, GPS values, repeating household members and choice controls. Attachment authorization/staging, file constraints, geolocation options, household member limit/value shape and option answer values are unchanged. Rendered choice rows use presentation keys that do not rely solely on duplicate-visible option labels.

## Response review

`SurveyProjectDetail.tsx` retains standalone project context in `workspaceMode="full"` and suppresses duplicate Project Workspace context in `field-work` and `responses` modes. Response review uses the existing selected-response state and query as a desktop list/detail workspace, with a narrow-screen list-to-detail presentation that does not add a route. Normal answers receive readable type-aware presentation; unknown structured values and raw consent/identity audit payloads remain available through safe fallback/disclosure. Secure attachment viewing continues through the existing `AttachmentView`. Review statuses, note constraints, revision history and `review_survey_response` wiring are unchanged.

## Review queue

`SurveyReviewQueue.tsx` presents the existing paginated review query as a clearer inbox with project context, response ID, status, submitted timestamp and the same Review action. No person-name dependency or new data query is introduced.

## CSS architecture

The new `SurveyForm.module.css`, `CaptureFields.module.css`, `SurveyResponses.module.css` and `SurveyReviewQueue.module.css` own feature-local structure/responsive composition only. Shared 2.42.0 `--fl-*` tokens and UI primitives continue to own colors, typography and common control visuals. Survey Template Builder and Offline Field Workspace styling remain isolated and unchanged.

## Backend boundary

No migration, schema, RLS, grant or RPC implementation change is included.
