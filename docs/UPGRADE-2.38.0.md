# Upgrade to FieldLance 2.38.0

Upgrade from the validated FieldLance 2.37.0 baseline. Do not reset the database.

## WSL upgrade

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run types:check
npm run test:attendance-238
npm run preflight
npm run test:local
```

The forward migration is:

`20261013000400_assignment_attendance_timesheets_location.sql`

After all local checks pass, push the migration to the linked Supabase project:

```bash
npx supabase db push
```

## Migration behavior

- Existing projects receive a default attendance policy of `Asia/Karachi`, preferred location evidence and 250m accuracy threshold; authorized Organization Admin / Project Manager can change it before operational use.
- New projects receive the default attendance policy automatically.
- Existing worker availability timezone values become subject to valid-IANA-timezone validation on future insert/update.
- Existing assignments, survey responses, payables, finance journals and historical records are not rewritten into attendance sessions.
- Existing daily-rate payable units are preserved. New daily-rate workday creation through `claim_work_payable` requires an approved attendance session for that assignment/date.

## Operational rollout

Before asking workers to use attendance, confirm each project's timezone and location policy. Browser geolocation requires user permission and may also require a secure browser context in production. If a project sets location to **required**, denied/unavailable location prevents check-in/out; **preferred** allows a documented exception.

The offline attendance queue protects already-loaded sessions during temporary connectivity loss. It is not cold-start offline application support and does not replace the existing survey offline subsystem.
