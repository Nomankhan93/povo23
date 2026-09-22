# Validation — FieldLance 2.36.1

## Automated

Run:

```bash
npm run types:check
npm run test:self-publish-2361
npm run test
npm run check
npm run release:consistency
npm run preflight
```

The 2.36.1 regression verifies the source contract. Updated 2.15/2.15.1 database regressions apply the complete migration chain and verify actual self-publication, cross-Organization isolation, moderation authorization, template-to-project cascade and legacy approval retirement.

## Manual acceptance

### Partner Organization — template

1. Sign in as an active Organization Admin.
2. Create/save a survey-template draft.
3. Publish it directly.
4. Confirm no FieldLance approval step appears and the immutable version is immediately usable by that Organization.
5. Confirm another Organization cannot read the private Organization-owned template.

### Partner Organization — project

1. Create/save a project draft using an allowed FieldLance or own-Organization published template.
2. Publish it directly.
3. Confirm the operational project appears immediately in the Organization project list and in authorized FieldLance project visibility.
4. Confirm no NGO project-review queue is required.

### FieldLance moderation

1. As FieldLance Survey Manager/Admin, block a published Organization project with a reason.
2. Confirm the Organization sees the reason and historical project records remain available.
3. Confirm recruitment/new assignment actions/new field collection are unavailable while blocked, without destructive rewriting of existing commitment status.
4. Restore the temporary block; confirm preserved commitments can resume subject to normal project rules.
5. Use **Remove from operation**; confirm forward recruitment/opportunity/direct-assignment/formal-assignment state is closed/cancelled while history remains. Restore it and confirm closed/cancelled work is not silently recreated.
6. Repeat block/remove/restore for a published template; confirm moderation cascades only to dependent projects.
7. Confirm an Organization Admin cannot call platform moderation RPCs.

### Isolation and legacy

- Organization A cannot read/edit Organization B drafts/private templates.
- Project Manager/Area Focal receive no new template/project publication authority.
- Existing historical review events remain visible only within their existing authorized scope.
- Legacy review RPCs fail closed rather than recreate pre-approval.
