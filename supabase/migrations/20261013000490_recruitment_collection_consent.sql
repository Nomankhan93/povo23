-- FieldLance 2.41.5: worker consent gates collection, never administration or review.
-- Preserve historical survey rows; no contracts or acceptance are manufactured.
create function app_private.has_accepted_collection_assignment(p_project uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.work_assignments w
   join public.survey_projects p on p.id=w.survey_project_id and p.organization_id=w.organization_id
   where w.survey_project_id=p_project and w.user_id=p_user
     and w.status='active' and w.responded_at is not null
 );
$$;
revoke all on function app_private.has_accepted_collection_assignment(uuid,uuid) from public,anon,authenticated;

-- All mutation paths, including definer RPCs and direct privileged writes, share this guard.
-- Deactivation always remains possible. No role exemption can create worker collection rights.
create function app_private.require_accepted_survey_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active and not app_private.has_accepted_collection_assignment(new.project_id,new.user_id) then
   raise exception 'Worker acceptance required: a formally accepted active work assignment must exist before collection access';
 end if;
 return new;
end;$$;
revoke all on function app_private.require_accepted_survey_assignment() from public,anon,authenticated;
create trigger survey_assignment_accepted_contract
before insert or update on public.survey_assignments
for each row execute function app_private.require_accepted_survey_assignment();

create or replace function public.set_survey_assignment(p_project uuid,p_user uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;
begin
 if not app_private.can_review_survey(p_project) then raise exception 'Project management permission required';end if;
 select * into p from public.survey_projects where id=p_project for update;
 if not found or p_active is null then raise exception 'Project and assignment decision required';end if;
 if p_active and p.status<>'active' then raise exception 'Active project required for assignment';end if;
 if p_active and not exists(
   select 1 from public.accounts a
   join public.volunteer_profiles v on v.user_id=a.id
   where a.id=p_user and a.status='active' and v.status='verified'
 ) then raise exception 'Assign a published active volunteer';end if;
 if p_active and not app_private.has_accepted_collection_assignment(p_project,p_user) then raise exception 'Worker acceptance required: select the application, send a formal offer and wait for acceptance';end if;
 if p_active and not app_private.project_recruitment_verification_ready(p_project,p_user) then raise exception 'Current project independent verification requirements are not satisfied';end if;
 insert into public.survey_assignments(project_id,user_id,active) values(p_project,p_user,p_active)
 on conflict(project_id,user_id) do update set active=excluded.active;
 insert into public.notifications(user_id,title,body) values(p_user,'Survey assignment updated','Open My Assigned Surveys to see your assigned field work.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),p_user,p.organization_id,'survey_assignment_changed',jsonb_build_object('project',p_project,'active',p_active,'access_model','assignment_scoped'));
end;$$;

create or replace function public.set_survey_assignment_scope(p_project uuid,p_user uuid,p_geography uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;
begin
  if not app_private.can_manage_project(p_project) then raise exception 'Project management permission required';end if;
  select * into p from public.survey_projects where id=p_project for update;
  if not found or p_active is null then raise exception 'Project and assignment decision required';end if;
  if not p_active then
    update public.survey_assignments set active=false where project_id=p_project and user_id=p_user;
    if not found then raise exception 'Survey assignment not found';end if;
  else
    if p.status<>'active' then raise exception 'Active project required for assignment';end if;
    if p_geography is null or not app_private.geo_active(p_geography) or not app_private.geo_contains(p.geography_id,p_geography) then raise exception 'Choose an active collection area inside this project';end if;
    if not exists(
      select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id
      where a.id=p_user and a.status='active' and v.status='verified'
    ) then raise exception 'Assign a published active volunteer';end if;
    if not app_private.has_accepted_collection_assignment(p_project,p_user) then raise exception 'Worker acceptance required: select the application, send a formal offer and wait for acceptance';end if;
    if not app_private.project_recruitment_verification_ready(p_project,p_user) then raise exception 'Current project independent verification requirements are not satisfied';end if;
    insert into public.survey_assignments(project_id,user_id,active,collection_geography_id)
    values(p_project,p_user,true,p_geography)
    on conflict(project_id,user_id) do update set active=true,collection_geography_id=excluded.collection_geography_id;
  end if;
  insert into public.notifications(user_id,title,body)
  values(p_user,'Survey assignment updated','Open My Assigned Surveys to see your current field assignment and collection area.');
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),p_user,p.organization_id,'survey_assignment_scope_changed',jsonb_build_object('project',p_project,'active',p_active,'collection_geography',case when p_active then p_geography else null end));
end;$$;

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
        and app_private.has_accepted_collection_assignment(pid,auth.uid())
        and exists(select 1 from public.work_assignments w
          where w.survey_project_id=pid and w.user_id=auth.uid() and w.status='active'
            and w.responded_at is not null
            and (now() at time zone 'UTC')::date between w.start_date and w.end_date)
    );
$$;


-- Self-only eligibility for field entry points; review permissions remain independent.
create function public.can_collect_project(p_project uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.can_collect(p_project);
$$;
revoke all on function public.can_collect_project(uuid) from public,anon;
grant execute on function public.can_collect_project(uuid) to authenticated;
