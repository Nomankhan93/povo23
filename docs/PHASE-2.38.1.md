# FieldLance 2.38.1 — Automatic Project Marketplace Publishing

FieldLance 2.38.1 makes the published survey project itself the primary workforce marketplace unit. Partner Organizations no longer need to create a separate public recruitment opportunity before Field Workers can discover a project, and Field Workers do not need to grant permanent Organization profile access before browsing or applying.

## Authoritative recruitment flow

`Published project → automatic marketplace listing → Field Worker application → Organization review/selection → formal offer → Field Worker acceptance → active assignment`

Organization-first worker search, shortlists and invitations remain available as optional secondary workflows. They are not prerequisites for project discovery or application.

## Marketplace behavior

Every active materialized/published `survey_projects` row receives one canonical **current** `project_auto` marketplace listing. The listing:

- is published automatically;
- has `visibility = all` so every active Field Worker account may discover it while project recruitment is effectively open;
- uses the project's geography, dates, purpose and current compensation defaults;
- stays hidden when project recruitment, target/capacity gates, moderation or lifecycle rules close recruitment;
- is controlled by the project recruitment plan rather than a separate opportunity-level close/reopen action;
- remains available through the project period instead of expiring at the project start date.

The Field Worker marketplace prefers the canonical automatic listing and does not require a manual public opportunity for the same project.

## Profile privacy

The existing recruitment privacy model remains authoritative:

- browsing requires no permanent `profile_shares` grant;
- applying requires an active/published Field Worker profile;
- application consent creates only the existing application-scoped recruitment profile snapshot;
- private documents, unrelated profile data, beneficiary data and other Organization data are not exposed through marketplace discovery;
- a permanent Organization profile share is not created by applying.

## Compensation snapshots

Marketplace listings remain contract-safe compensation snapshots. When project compensation defaults change, FieldLance closes the previous **current** automatic listing and creates a new current listing for future applicants. Historical applications keep their original opportunity relationship, and formal assignments continue to inherit the applicable immutable opportunity snapshot.

This prevents a later project-rate edit from silently changing terms under an existing application or assignment.

## Recruitment state

Automatic listings follow project authority:

- Project recruitment manually closed → listing is unavailable to new applicants.
- Project target/capacity reached → discovery is blocked by the existing effective recruitment gate.
- Temporary FieldLance moderation block → listing disappears until the project is restored and recruitment is otherwise open.
- Operational removal → forward recruitment remains closed; restoring content does not recreate cancelled assignments.
- Reopening project recruitment through the authorized project plan re-enables the automatic listing when all other gates permit it.

## Existing projects

The migration backfills a canonical automatic listing for every currently active project. Existing manual opportunities, applications, invitations and assignments are preserved for history and review. Field Worker discovery prefers the new canonical project listing.

## UI changes

### Field Worker

**Available opportunities** becomes **Available projects** and explicitly explains that every published project with open recruitment appears automatically. The page continues to show project area, dates, compensation, application status and application-scoped consent.

### Organization / Project workspace

The recruitment workspace explains that project marketplace publishing is automatic. **Find Field Workers** is labelled as an optional direct-recruitment workflow. Organizations may still create an optional targeted/manual campaign for specialized cases, but it is no longer required for normal recruitment.

## Data model

Forward migration:

`20261013000420_automatic_project_marketplace_publishing.sql`

New `work_opportunities` fields:

- `marketplace_origin`: `manual | project_auto`
- `marketplace_current`: identifies the one current automatic listing for a project

A partial unique index guarantees at most one current automatic listing per project.

## Out of scope

- Removing legacy/manual opportunity records.
- Removing Organization-side direct worker search or invitations.
- Automatically assigning a worker merely because they applied.
- Granting permanent Organization access to a Field Worker's full profile.
- Bypassing application review, formal offer or worker acceptance.
