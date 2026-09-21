# Upgrade to FieldLance 2.30.0

Apply FieldLance 2.29.0 first.

## Files and migration

2.30.0 adds one forward migration:

`20261012000100_project_workspace_completion.sql`

The migration creates the project-document registry/storage policy layer and the guarded project activity feed. Existing migrations must not be renamed or edited.

## Recommended local upgrade

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run types:generate
npm run metadata:generate
npm run preflight
```

For a linked cloud project, review local migration/test results before running:

```bash
npx supabase db push
```

The patch installer itself does not run migrations or push the cloud database.

## Smoke-test roles

Use separate sessions for:

1. NGO Admin — open a project workspace, manage Team/Recruitment/Cases/Documents and project Finance.
2. FieldLance survey authority — open a project workspace across organizations and inspect management Activity.
3. FieldLance finance authority — verify project-locked finance access.
4. Project Manager — recruitment/cases/documents/activity allowed; project-staff administration and finance remain unavailable unless another role grants them.
5. Area Focal Person — scoped field/review views and document read; no broad manager tabs or document mutation.

Also test a logged-in user with no project access to confirm direct table/storage/RPC access is denied by the database.
