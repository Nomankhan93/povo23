-- FieldLance 2.41.5: restore the inclusive UTC project window lost in 00490.
-- Preserve accepted contracts, governance wrappers, review rights and historical reads.
create or replace function app_private.can_collect_before_governance(pid uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active()
    and app_private.project_effectively_allowed(pid)
    and exists(
      select 1
      from public.survey_assignments a
      join public.survey_projects p on p.id=a.project_id
      join public.organizations o on o.id=p.organization_id
      join public.volunteer_profiles v on v.user_id=a.user_id
      where p.id=pid
        and a.user_id=auth.uid()
        and a.active
        and p.status='active'
        and o.status='active'
        and v.status<>'suspended'
        and (now() at time zone 'UTC')::date between p.start_date and p.end_date
        and app_private.has_accepted_collection_assignment(pid,auth.uid())
        and exists(select 1 from public.work_assignments w
          where w.survey_project_id=pid and w.user_id=auth.uid() and w.status='active'
            and w.responded_at is not null
            and (now() at time zone 'UTC')::date between w.start_date and w.end_date)
    );
$$;
