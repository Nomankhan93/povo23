-- POEM 2.13.1 hotfix
-- Separate NGO operational invitation history from current volunteer-profile access.

create or replace function app_private.ngo_scoped_profile_access(
  org uuid,
  subject uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    exists(
      select 1
      from public.accounts a
      join public.volunteer_profiles v on v.user_id=a.id
      where a.id=subject
        and a.status='active'
        and v.status<>'suspended'
    )
    and (
      -- Formal workforce relationship.
      exists(
        select 1
        from public.work_assignments w
        where w.organization_id=org
          and w.user_id=subject
          and w.status in ('offered','active')
      )

      -- Active survey collection relationship.
      or exists(
        select 1
        from public.survey_assignments sa
        join public.survey_projects p on p.id=sa.project_id
        where p.organization_id=org
          and sa.user_id=subject
          and sa.active
      )

      -- Invitation is only a short-lived recruitment relationship.
      -- Historical accepted invitations must not become permanent profile grants.
      or exists(
        select 1
        from public.work_invitations i
        join public.work_opportunities o on o.id=i.opportunity_id
        where i.organization_id=org
          and i.user_id=subject
          and i.status in ('pending','accepted')
          and o.status='open'
          and o.reply_by > now()
      )
    );
$$;

-- Invitation rows are organization operational/audit history.
-- Reading them must not depend on current full-profile access.
drop policy if exists invitation_read on public.work_invitations;

create policy invitation_read
on public.work_invitations
for select
to authenticated
using(
  app_private.is_active()
  and (
    user_id=auth.uid()
    or app_private.ngo_admin(organization_id)
    or app_private.can_manage_surveys()
  )
);

revoke all
on function app_private.ngo_scoped_profile_access(uuid,uuid)
from public,anon,authenticated;

grant execute
on function app_private.ngo_scoped_profile_access(uuid,uuid)
to authenticated;
