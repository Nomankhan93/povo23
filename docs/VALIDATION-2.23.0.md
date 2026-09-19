# Validation — FieldLance 2.23.0

Validate:

- package/lock version `2.23.0`;
- generated database types match all migrations;
- migration head `20261009000700_tasks_sla_escalation_center.sql`;
- task tables use RLS and authenticated users cannot directly mutate them;
- task mutation occurs through guarded RPCs;
- derived task triggers do not mutate source workflows;
- Field Worker sees assigned personal tasks only;
- Organization/Project managers see authorized team tasks;
- FieldLance Staff queues remain role-aware;
- overdue/escalated views calculate correctly;
- completing a task leaves source application/survey/case/withdrawal state unchanged;
- legacy 2.20–2.22 workspace tests remain green.

Recommended local sequence:

```bash
npm run types:generate
npm run metadata:generate
npx supabase start
npx supabase migration up --local
npm run metadata:check
npm run check
npm run test:task-center
npm run preflight
npm run test:local
npm run test:operations
npx supabase migration list
```
