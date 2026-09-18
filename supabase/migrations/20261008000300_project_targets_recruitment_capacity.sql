-- POEM 2.16.0 — Project Targets & Recruitment Capacity
-- Soft approved-response targets, explicit project recruitment capacity and server-enforced
-- recruitment/assignment gates that preserve already-created/offline field submissions.

alter table public.survey_projects
  add column required_volunteers integer check(required_volunteers between 1 and 5000),
  add column recruitment_status text not null default 'open' check(recruitment_status in ('open','closed')),
  add column recruitment_version integer not null default 1;

create index survey_projects_recruitment_state
  on public.survey_projects(status,recruitment_status,created_at desc);

create function app_private.project_approved_count(pid uuid)
returns integer language sql stable security definer set search_path='' as $$
  select count(*)::integer
  from public.survey_responses r
  where r.project_id=pid and r.status='approved';
$$;

create function app_private.project_committed_volunteer_count(pid uuid)
returns integer language sql stable security definer set search_path='' as $$
  select count(distinct x.user_id)::integer
  from (
    select w.user_id
    from public.work_assignments w
    where w.survey_project_id=pid and w.status in ('offered','active')
    union
    select a.user_id
    from public.survey_assignments a
    where a.project_id=pid and a.active
  ) x;
$$;

create function app_private.project_user_committed(pid uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.work_assignments w
    where w.survey_project_id=pid and w.user_id=p_user and w.status in ('offered','active')
  ) or exists(
    select 1 from public.survey_assignments a
    where a.project_id=pid and a.user_id=p_user and a.active
  );
$$;

create function app_private.project_recruitment_effective_open(pid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.survey_projects p
    where p.id=pid
      and p.status='active'
      and p.recruitment_status='open'
      and app_private.project_approved_count(p.id)<p.target
      and (
        p.required_volunteers is null
        or app_private.project_committed_volunteer_count(p.id)<p.required_volunteers
      )
  );
$$;

-- Project Managers need the same project-scoped recruitment read surface that the RPCs
-- already authorize. Volunteers still see opportunities only through the bounded discovery RPC.
drop policy if exists opportunity_read on public.work_opportunities;
create policy opportunity_read on public.work_opportunities
for select to authenticated
using(
  app_private.is_active() and (
    app_private.ngo_admin(organization_id)
    or app_private.can_manage_surveys()
    or (survey_project_id is not null and app_private.can_manage_project(survey_project_id))
    or app_private.is_invited(id)
  )
);

drop policy if exists work_application_read on public.work_applications;
create policy work_application_read on public.work_applications
for select to authenticated
using(
  app_private.is_active() and (
    user_id=auth.uid()
    or app_private.can_manage_project(survey_project_id)
  )
);

create function public.project_recruitment_status(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.survey_projects;approved integer;pending integer;correction integer;rejected integer;committed integer;
begin
  if not app_private.can_manage_project(p_project) then raise exception 'Project management permission required';end if;
  select * into p from public.survey_projects where id=p_project;
  if not found then raise exception 'Survey project not found';end if;

  approved:=app_private.project_approved_count(p.id);
  committed:=app_private.project_committed_volunteer_count(p.id);
  select
    count(*) filter(where r.status='submitted')::integer,
    count(*) filter(where r.status='correction_required')::integer,
    count(*) filter(where r.status='rejected')::integer
  into pending,correction,rejected
  from public.survey_responses r where r.project_id=p.id;

  return jsonb_build_object(
    'project_id',p.id,
    'target',p.target,
    'approved',approved,
    'pending_review',coalesce(pending,0),
    'correction_required',coalesce(correction,0),
    'rejected',coalesce(rejected,0),
    'remaining_target',greatest(p.target-approved,0),
    'over_target',greatest(approved-p.target,0),
    'target_reached',approved>=p.target,
    'required_volunteers',p.required_volunteers,
    'committed_volunteers',committed,
    'remaining_capacity',case when p.required_volunteers is null then null else greatest(p.required_volunteers-committed,0) end,
    'capacity_reached',p.required_volunteers is not null and committed>=p.required_volunteers,
    'manual_status',p.recruitment_status,
    'effective_open',app_private.project_recruitment_effective_open(p.id),
    'version',p.recruitment_version
  );
end;$$;

create function public.set_project_recruitment_plan(
  p_project uuid,p_target integer,p_required_volunteers integer,p_status text,p_reason text,p_version integer
) returns integer language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;approved integer;committed integer;next_version integer;reason text:=trim(coalesce(p_reason,''));
begin
  if not app_private.can_manage_project(p_project) then raise exception 'Project management permission required';end if;
  select * into p from public.survey_projects where id=p_project for update;
  if not found then raise exception 'Survey project not found';end if;
  if p.status<>'active' then raise exception 'Active project required';end if;
  if p.recruitment_version is distinct from p_version then raise exception 'Recruitment plan changed. Reload';end if;
  if p_target is null or p_target not between 1 and 1000000 then raise exception 'Valid approved-response target required';end if;
  if p_target<p.target then raise exception 'Operational target can only be increased in this release';end if;
  if p_required_volunteers is null or p_required_volunteers not between 1 and 5000 then raise exception 'Required volunteers must be between 1 and 5000';end if;
  if p_status not in ('open','closed') then raise exception 'Recruitment status must be open or closed';end if;
  if length(reason) not between 3 and 1000 then raise exception 'Reason is required';end if;

  approved:=app_private.project_approved_count(p.id);
  committed:=app_private.project_committed_volunteer_count(p.id);
  if p_target<approved then raise exception 'Target cannot be below already approved responses';end if;
  if p_required_volunteers<committed then raise exception 'Volunteer capacity cannot be below current offered/active assignments';end if;

  update public.survey_projects
  set target=p_target,
      required_volunteers=p_required_volunteers,
      recruitment_status=p_status,
      recruitment_version=recruitment_version+1
  where id=p.id
  returning recruitment_version into next_version;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'project_recruitment_plan_changed',jsonb_build_object(
    'project',p.id,
    'previous_target',p.target,
    'target',p_target,
    'previous_required_volunteers',p.required_volunteers,
    'required_volunteers',p_required_volunteers,
    'previous_status',p.recruitment_status,
    'status',p_status,
    'approved',approved,
    'committed_volunteers',committed,
    'reason',reason,
    'previous_version',p_version,
    'version',next_version
  ));
  return next_version;
end;$$;

-- Recruitment publication can remain drafted while a project is blocked, but opening
-- applications is prohibited once the manual gate, accepted target or capacity closes.
create function app_private.validate_project_recruitment_opportunity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.survey_project_id is not null and new.applications_open
     and not app_private.project_recruitment_effective_open(new.survey_project_id)
  then raise exception 'Project recruitment is closed by project status, target, capacity or manager';end if;
  return new;
end;$$;
create trigger validate_project_recruitment_opportunity
before insert or update of applications_open,publication_state,status,survey_project_id
on public.work_opportunities
for each row execute function app_private.validate_project_recruitment_opportunity();

-- New invitations are recruitment activity; existing invitations remain historical and may
-- still be responded to, but no fresh invitations are created while the project gate is closed.
create function app_private.validate_project_recruitment_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
  select o.survey_project_id into pid from public.work_opportunities o where o.id=new.opportunity_id;
  if pid is not null and not app_private.project_recruitment_effective_open(pid)
  then raise exception 'Project recruitment is closed by target, capacity or manager';end if;
  return new;
end;$$;
create trigger validate_project_recruitment_invitation
before insert on public.work_invitations
for each row execute function app_private.validate_project_recruitment_invitation();

-- Extend the existing assignment-area trigger so every new formal offer also reserves against
-- project capacity. Updating/accepting an existing offer does not consume a second slot.
create or replace function app_private.validate_work_assignment_collection_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;fallback uuid;approved integer;committed integer;
begin
  select * into p from public.survey_projects where id=new.survey_project_id for update;
  if not found then raise exception 'Survey project not found';end if;
  if new.collection_geography_id is null then
    select o.geography_id into fallback from public.work_opportunities o where o.id=new.opportunity_id;
    new.collection_geography_id:=coalesce(fallback,p.geography_id);
  end if;
  if not app_private.geo_contains(p.geography_id,new.collection_geography_id) then raise exception 'Assignment collection area must stay within the survey project area';end if;
  if tg_op='UPDATE' and old.collection_geography_id is distinct from new.collection_geography_id then raise exception 'Work assignment collection area is immutable; replace the assignment instead';end if;

  if tg_op='INSERT' then
    approved:=app_private.project_approved_count(p.id);
    committed:=app_private.project_committed_volunteer_count(p.id);
    if p.status<>'active' or p.recruitment_status<>'open' or approved>=p.target then
      raise exception 'New assignment offers are closed because the project target/status is closed';
    end if;
    if p.required_volunteers is not null
       and not app_private.project_user_committed(p.id,new.user_id)
       and committed>=p.required_volunteers
    then raise exception 'Project volunteer capacity is full';end if;
  end if;
  return new;
end;$$;

-- Direct survey assignment activation consumes capacity only when no existing formal offer has
-- already reserved the volunteer. This preserves acceptance of offers created before a soft close.
create or replace function app_private.validate_survey_assignment_collection_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;fallback uuid;reserved boolean:=false;approved integer;committed integer;was_active boolean:=false;
begin
  select * into p from public.survey_projects where id=new.project_id for update;
  if not found then raise exception 'Survey project not found';end if;
  if new.collection_geography_id is null then
    select w.collection_geography_id into fallback
    from public.work_assignments w
    where w.survey_project_id=new.project_id and w.user_id=new.user_id and w.status in ('active','offered')
    order by case when w.status='active' then 0 else 1 end,w.created_at desc limit 1;
    new.collection_geography_id:=coalesce(fallback,p.geography_id);
  end if;
  if not app_private.geo_contains(p.geography_id,new.collection_geography_id) then raise exception 'Survey assignment area must stay within the project area';end if;

  if tg_op='UPDATE' then was_active:=coalesce(old.active,false);end if;
  if new.active and not was_active then
    select exists(
      select 1 from public.work_assignments w
      where w.survey_project_id=new.project_id and w.user_id=new.user_id and w.status in ('offered','active')
    ) into reserved;
    if not reserved then
      approved:=app_private.project_approved_count(p.id);
      committed:=app_private.project_committed_volunteer_count(p.id);
      if p.status<>'active' or p.recruitment_status<>'open' or approved>=p.target then
        raise exception 'New survey assignments are closed because the project target/status is closed';
      end if;
      if p.required_volunteers is not null
         and not app_private.project_user_committed(p.id,new.user_id)
         and committed>=p.required_volunteers
      then raise exception 'Project volunteer capacity is full';end if;
    end if;
  end if;
  return new;
end;$$;

-- Volunteer discovery is a live recruitment surface. Once the soft operational gate closes,
-- published opportunity rows remain intact for history but disappear from new-application search.
create or replace function app_private.work_opportunity_visible(p_opportunity uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from public.work_opportunities o
  join public.accounts a on a.id=p_user and a.status='active'
  where o.id=p_opportunity
    and o.survey_project_id is not null
    and o.publication_state='published'
    and o.applications_open
    and o.status='open'
    and o.reply_by>now()
    and app_private.project_recruitment_effective_open(o.survey_project_id)
    and (
      o.visibility in ('all','area')
      or (o.visibility='invite_only' and exists(
        select 1 from public.work_invitations i
        where i.opportunity_id=o.id and i.user_id=p_user and i.status in ('pending','accepted')
      ))
    )
 );
$$;

revoke all on function app_private.project_approved_count(uuid),app_private.project_committed_volunteer_count(uuid),app_private.project_user_committed(uuid,uuid),app_private.project_recruitment_effective_open(uuid) from public,anon,authenticated;
revoke all on function app_private.validate_project_recruitment_opportunity(),app_private.validate_project_recruitment_invitation() from public,anon,authenticated;

revoke all on function public.project_recruitment_status(uuid),public.set_project_recruitment_plan(uuid,integer,integer,text,text,integer) from public,anon,authenticated;
grant execute on function public.project_recruitment_status(uuid),public.set_project_recruitment_plan(uuid,integer,integer,text,text,integer) to authenticated;
