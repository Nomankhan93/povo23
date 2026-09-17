-- POEM 2.14.0 — Project Team & Area Governance Foundation
-- Adds project-scoped staff roles and server-stamped operational geography.
-- Project Manager receives whole-project operational authority. Area Focal Person
-- receives only the explicitly assigned geography and its descendants.

create table public.project_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.survey_projects(id),
  user_id uuid not null references public.accounts(id),
  role text not null check(role in ('project_manager','area_focal_person')),
  status text not null default 'active' check(status in ('active','revoked')),
  starts_at date not null,
  ends_at date,
  assigned_by uuid not null references public.accounts(id),
  revoked_at timestamptz,
  revoked_by uuid references public.accounts(id),
  revoke_reason text not null default '' check(length(revoke_reason)<=2000),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at is null or ends_at>=starts_at),
  check((status='active' and revoked_at is null and revoked_by is null and revoke_reason='') or status='revoked')
);
create unique index project_staff_one_active_assignment
  on public.project_staff_assignments(project_id,user_id)
  where status='active';
create index project_staff_project on public.project_staff_assignments(project_id,status,role,starts_at,ends_at);
create index project_staff_user on public.project_staff_assignments(user_id,status,starts_at,ends_at);

create table public.project_staff_areas (
  assignment_id uuid not null references public.project_staff_assignments(id) on delete cascade,
  geography_id uuid not null references public.geographies(id),
  assigned_at timestamptz not null default now(),
  primary key(assignment_id,geography_id)
);
create index project_staff_areas_geography on public.project_staff_areas(geography_id,assignment_id);

-- Collection geography is a server-owned operational fact. Historical records that
-- predate 2.14 are conservatively backfilled from their existing project/household scope.
alter table public.work_assignments add column collection_geography_id uuid references public.geographies(id);
alter table public.survey_assignments add column collection_geography_id uuid references public.geographies(id);
alter table public.survey_responses add column collection_geography_id uuid references public.geographies(id);
alter table public.survey_capture_files add column collection_geography_id uuid references public.geographies(id);

update public.work_assignments w
set collection_geography_id=coalesce(
  (select o.geography_id from public.work_opportunities o where o.id=w.opportunity_id),
  (select p.geography_id from public.survey_projects p where p.id=w.survey_project_id)
)
where collection_geography_id is null;

update public.survey_assignments a
set collection_geography_id=coalesce(
  (select w.collection_geography_id
   from public.work_assignments w
   where w.survey_project_id=a.project_id and w.user_id=a.user_id
   order by case when w.status='active' then 0 when w.status='offered' then 1 else 2 end,w.created_at desc
   limit 1),
  (select p.geography_id from public.survey_projects p where p.id=a.project_id)
)
where collection_geography_id is null;

update public.survey_responses r
set collection_geography_id=coalesce(
  (select h.geography_id
   from public.registry_persons rp join public.registry_households h on h.id=rp.household_id
   where rp.id=r.person_id),
  (select p.geography_id from public.survey_projects p where p.id=r.project_id)
)
where collection_geography_id is null;

update public.survey_capture_files f
set collection_geography_id=coalesce(
  (select a.collection_geography_id from public.survey_assignments a where a.project_id=f.project_id and a.user_id=f.collector_id),
  (select p.geography_id from public.survey_projects p where p.id=f.project_id)
)
where collection_geography_id is null;

alter table public.work_assignments alter column collection_geography_id set not null;
alter table public.survey_assignments alter column collection_geography_id set not null;
alter table public.survey_responses alter column collection_geography_id set not null;
alter table public.survey_capture_files alter column collection_geography_id set not null;

create index work_assignments_collection_area on public.work_assignments(survey_project_id,collection_geography_id,status);
create index survey_assignments_collection_area on public.survey_assignments(project_id,collection_geography_id,active);
create index survey_responses_collection_area on public.survey_responses(project_id,collection_geography_id,status,created_at desc);
create index survey_capture_collection_area on public.survey_capture_files(project_id,collection_geography_id,created_at desc);

create function app_private.geo_contains(root uuid,candidate uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select root is not null and candidate is not null and exists(
    with recursive areas(id) as (
      select root
      union all
      select g.id from public.geographies g join areas a on g.parent_id=a.id
    )
    select 1 from areas where id=candidate
  );
$$;

create function app_private.project_staff_active(pid uuid,requested_role text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and exists(
    select 1
    from public.project_staff_assignments s
    join public.survey_projects p on p.id=s.project_id
    join public.organizations o on o.id=p.organization_id
    join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=s.user_id
    join public.accounts a on a.id=s.user_id
    where s.project_id=pid
      and s.user_id=auth.uid()
      and s.status='active'
      and s.starts_at<=(now() at time zone 'UTC')::date
      and (s.ends_at is null or s.ends_at>=(now() at time zone 'UTC')::date)
      and (requested_role is null or s.role=requested_role)
      and a.status='active'
      and o.status='active'
      and m.status='active'
      and m.role in ('ngo_admin','member')
  );
$$;

create function app_private.can_manage_project_team(pid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and exists(
    select 1 from public.survey_projects p
    where p.id=pid and (app_private.can_manage_surveys() or app_private.ngo_admin(p.organization_id))
  );
$$;

create function app_private.can_manage_project(pid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and exists(
    select 1 from public.survey_projects p
    where p.id=pid and (
      app_private.can_manage_surveys()
      or app_private.ngo_admin(p.organization_id)
      or app_private.project_staff_active(pid,'project_manager')
    )
  );
$$;

create function app_private.can_review_project_area(pid uuid,area uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.can_manage_project(pid)
  or (
    app_private.project_staff_active(pid,'area_focal_person')
    and exists(
      select 1
      from public.project_staff_assignments s
      join public.project_staff_areas a on a.assignment_id=s.id
      where s.project_id=pid
        and s.user_id=auth.uid()
        and s.role='area_focal_person'
        and s.status='active'
        and s.starts_at<=(now() at time zone 'UTC')::date
        and (s.ends_at is null or s.ends_at>=(now() at time zone 'UTC')::date)
        and app_private.geo_contains(a.geography_id,area)
    )
  );
$$;

create or replace function app_private.can_read_project(pid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and exists(
    select 1 from public.survey_projects p
    where p.id=pid and (
      app_private.can_manage_project(pid)
      or app_private.project_staff_active(pid,null)
      or (
        exists(select 1 from public.organizations o where o.id=p.organization_id and o.status='active')
        and exists(select 1 from public.survey_assignments a where a.project_id=pid and a.user_id=auth.uid() and a.active)
      )
    )
  );
$$;

create or replace function app_private.can_review_survey(pid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.can_manage_project(pid);
$$;

create or replace function app_private.can_read_person(person uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.registry_persons p
    where p.id=person
      and app_private.can_read_project(p.project_id)
      and (
        app_private.can_manage_project(p.project_id)
        or exists(
          select 1 from public.survey_responses r
          where r.person_id=p.id
            and (r.collector_id=auth.uid() or app_private.can_review_project_area(r.project_id,r.collection_geography_id))
        )
      )
  );
$$;

-- Validate and server-stamp workforce assignment collection area.
create function app_private.validate_work_assignment_collection_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare root uuid;fallback uuid;
begin
  select p.geography_id into root from public.survey_projects p where p.id=new.survey_project_id;
  if root is null then raise exception 'Survey project not found';end if;
  if new.collection_geography_id is null then
    select o.geography_id into fallback from public.work_opportunities o where o.id=new.opportunity_id;
    new.collection_geography_id:=coalesce(fallback,root);
  end if;
  if not app_private.geo_contains(root,new.collection_geography_id) then raise exception 'Assignment collection area must stay within the survey project area';end if;
  if tg_op='UPDATE' and old.collection_geography_id is distinct from new.collection_geography_id then raise exception 'Work assignment collection area is immutable; replace the assignment instead';end if;
  return new;
end;$$;
create trigger validate_work_assignment_collection_area
before insert or update on public.work_assignments
for each row execute function app_private.validate_work_assignment_collection_area();

create function app_private.validate_survey_assignment_collection_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare root uuid;fallback uuid;
begin
  select p.geography_id into root from public.survey_projects p where p.id=new.project_id;
  if root is null then raise exception 'Survey project not found';end if;
  if new.collection_geography_id is null then
    select w.collection_geography_id into fallback
    from public.work_assignments w
    where w.survey_project_id=new.project_id and w.user_id=new.user_id and w.status in ('active','offered')
    order by case when w.status='active' then 0 else 1 end,w.created_at desc limit 1;
    new.collection_geography_id:=coalesce(fallback,root);
  end if;
  if not app_private.geo_contains(root,new.collection_geography_id) then raise exception 'Survey assignment area must stay within the project area';end if;
  return new;
end;$$;
create trigger validate_survey_assignment_collection_area
before insert or update on public.survey_assignments
for each row execute function app_private.validate_survey_assignment_collection_area();

create function app_private.stamp_household_collection_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare assigned_area uuid;root uuid;
begin
  if tg_op='UPDATE' and old.geography_id is distinct from new.geography_id then raise exception 'Household collection geography is immutable';end if;
  if tg_op='INSERT' then
    select a.collection_geography_id into assigned_area
    from public.survey_assignments a
    where a.project_id=new.project_id and a.user_id=new.created_by and a.active;
    select p.geography_id into root from public.survey_projects p where p.id=new.project_id;
    new.geography_id:=coalesce(assigned_area,new.geography_id,root);
    if not app_private.geo_contains(root,new.geography_id) then raise exception 'Household collection area must stay within the project area';end if;
  end if;
  return new;
end;$$;
create trigger stamp_household_collection_area
before insert or update of geography_id on public.registry_households
for each row execute function app_private.stamp_household_collection_area();

create function app_private.stamp_response_collection_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare assigned_area uuid;root uuid;
begin
  if tg_op='UPDATE' then
    if old.collection_geography_id is distinct from new.collection_geography_id then raise exception 'Response collection geography is immutable';end if;
    return new;
  end if;
  select a.collection_geography_id into assigned_area
  from public.survey_assignments a
  where a.project_id=new.project_id and a.user_id=new.collector_id and a.active;
  select p.geography_id into root from public.survey_projects p where p.id=new.project_id;
  new.collection_geography_id:=coalesce(assigned_area,new.collection_geography_id,root);
  if not app_private.geo_contains(root,new.collection_geography_id) then raise exception 'Response collection area must stay within the project area';end if;
  return new;
end;$$;
create trigger stamp_response_collection_area
before insert or update of collection_geography_id on public.survey_responses
for each row execute function app_private.stamp_response_collection_area();

create function app_private.stamp_capture_collection_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare assigned_area uuid;root uuid;
begin
  if tg_op='UPDATE' then
    if old.collection_geography_id is distinct from new.collection_geography_id then raise exception 'Capture collection geography is immutable';end if;
    return new;
  end if;
  select a.collection_geography_id into assigned_area
  from public.survey_assignments a
  where a.project_id=new.project_id and a.user_id=new.collector_id and a.active;
  select p.geography_id into root from public.survey_projects p where p.id=new.project_id;
  new.collection_geography_id:=coalesce(assigned_area,new.collection_geography_id,root);
  if not app_private.geo_contains(root,new.collection_geography_id) then raise exception 'Capture collection area must stay within the project area';end if;
  return new;
end;$$;
create trigger stamp_capture_collection_area
before insert or update of collection_geography_id on public.survey_capture_files
for each row execute function app_private.stamp_capture_collection_area();

alter table public.project_staff_assignments enable row level security;
alter table public.project_staff_areas enable row level security;

create policy project_staff_assignment_read on public.project_staff_assignments
for select to authenticated using(
  app_private.is_active() and (user_id=auth.uid() or app_private.can_manage_project_team(project_id))
);
create policy project_staff_area_read on public.project_staff_areas
for select to authenticated using(
  exists(
    select 1 from public.project_staff_assignments s
    where s.id=assignment_id and (s.user_id=auth.uid() or app_private.can_manage_project_team(s.project_id))
  )
);

-- Existing RLS becomes area-aware without widening unrelated NGO capabilities.
drop policy if exists assignment_read on public.survey_assignments;
create policy assignment_read on public.survey_assignments for select to authenticated using(
  app_private.is_active() and (
    user_id=auth.uid() or app_private.can_review_project_area(project_id,collection_geography_id)
  )
);

drop policy if exists household_read on public.registry_households;
create policy household_read on public.registry_households for select to authenticated using(
  app_private.is_active() and app_private.can_read_project(project_id) and (
    app_private.can_review_project_area(project_id,geography_id)
    or exists(select 1 from public.registry_persons p where p.household_id=public.registry_households.id and app_private.can_read_person(p.id))
  )
);

drop policy if exists response_read on public.survey_responses;
create policy response_read on public.survey_responses for select to authenticated using(
  app_private.is_active() and (
    collector_id=auth.uid() or app_private.can_review_project_area(project_id,collection_geography_id)
  )
);

drop policy if exists capture_files_read on public.survey_capture_files;
create policy capture_files_read on public.survey_capture_files for select to authenticated using(
  app_private.is_active() and (
    collector_id=auth.uid() or app_private.can_review_project_area(project_id,collection_geography_id)
  )
);

drop policy if exists work_assignment_read on public.work_assignments;
create policy work_assignment_read on public.work_assignments for select to authenticated using(
  app_private.is_active() and (
    user_id=auth.uid()
    or app_private.can_review_project_area(survey_project_id,collection_geography_id)
  )
);

create or replace function app_private.can_access_capture_file(path text,writing boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.survey_capture_files f
    where f.object_name=path
      and case when writing
        then f.collector_id=auth.uid() and app_private.can_collect(f.project_id)
        else f.collector_id=auth.uid() or app_private.can_review_project_area(f.project_id,f.collection_geography_id)
      end
  );
$$;

create function public.assign_project_staff(
  p_project uuid,
  p_user uuid,
  p_role text,
  p_areas uuid[],
  p_starts date,
  p_ends date
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;new_id uuid;area uuid;area_count integer:=coalesce(cardinality(p_areas),0);
begin
  if not app_private.can_manage_project_team(p_project) then raise exception 'NGO Admin or POEM survey management permission required';end if;
  select * into p from public.survey_projects where id=p_project for update;
  if not found then raise exception 'Survey project not found';end if;
  if p_role not in ('project_manager','area_focal_person') then raise exception 'Valid project staff role required';end if;
  if p_starts is null or p_starts<p.start_date or p_starts>p.end_date or p_ends is not null and (p_ends<p_starts or p_ends>p.end_date) then raise exception 'Project staff dates must fit the survey project';end if;
  if not exists(
    select 1 from public.accounts a
    join public.organization_memberships m on m.user_id=a.id and m.organization_id=p.organization_id
    where a.id=p_user and a.status='active' and m.status='active' and m.role in ('member','ngo_admin')
  ) then raise exception 'Project staff must have an active membership in this Partner NGO';end if;
  if exists(select 1 from public.project_staff_assignments s where s.project_id=p_project and s.user_id=p_user and s.status='active') then raise exception 'This account already has an active project staff assignment';end if;
  if p_role='project_manager' and area_count<>0 then raise exception 'Project Manager covers the full project and must not have area scopes';end if;
  if p_role='area_focal_person' and area_count not between 1 and 25 then raise exception 'Area Focal Person requires 1 to 25 project areas';end if;
  if area_count<>(select count(distinct x) from unnest(coalesce(p_areas,array[]::uuid[])) x) then raise exception 'Project staff areas must be unique';end if;
  foreach area in array coalesce(p_areas,array[]::uuid[]) loop
    if not app_private.geo_active(area) or not app_private.geo_contains(p.geography_id,area) then raise exception 'Each focal area must be active and inside the survey project area';end if;
  end loop;
  insert into public.project_staff_assignments(project_id,user_id,role,starts_at,ends_at,assigned_by)
  values(p_project,p_user,p_role,p_starts,p_ends,auth.uid()) returning id into new_id;
  if p_role='area_focal_person' then
    insert into public.project_staff_areas(assignment_id,geography_id)
    select new_id,x from unnest(p_areas) x;
  end if;
  insert into public.notifications(user_id,title,body)
  values(p_user,'Project team assignment','You were assigned a project-scoped POEM role. Access is limited to this project and its authorized area.');
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),p_user,p.organization_id,'project_staff_assigned',jsonb_build_object('assignment',new_id,'project',p_project,'role',p_role,'areas',coalesce(p_areas,array[]::uuid[]),'starts_at',p_starts,'ends_at',p_ends));
  return new_id;
end;$$;

create function public.revoke_project_staff(p_id uuid,p_reason text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare s public.project_staff_assignments;p public.survey_projects;
begin
  select * into s from public.project_staff_assignments where id=p_id for update;
  if not found then raise exception 'Project staff assignment not found';end if;
  if not app_private.can_manage_project_team(s.project_id) then raise exception 'NGO Admin or POEM survey management permission required';end if;
  if s.status<>'active' or s.version is distinct from p_version then raise exception 'Project staff assignment changed. Reload.';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Revocation reason required';end if;
  update public.project_staff_assignments
  set status='revoked',revoked_at=now(),revoked_by=auth.uid(),revoke_reason=trim(p_reason),version=version+1,updated_at=now()
  where id=p_id;
  select * into p from public.survey_projects where id=s.project_id;
  insert into public.notifications(user_id,title,body)
  values(s.user_id,'Project team access ended','Your project-scoped POEM staff assignment was revoked.');
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),s.user_id,p.organization_id,'project_staff_revoked',jsonb_build_object('assignment',p_id,'project',s.project_id,'role',s.role,'reason',trim(p_reason),'previous_version',p_version));
end;$$;

create function public.project_staff_roster(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.can_read_project(p_project) then raise exception 'Project access required';end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'user_id',s.user_id,
    'name',a.full_name,
    'role',s.role,
    'status',s.status,
    'starts_at',s.starts_at,
    'ends_at',s.ends_at,
    'version',s.version,
    'areas',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind) order by g.name) from public.project_staff_areas x join public.geographies g on g.id=x.geography_id where x.assignment_id=s.id),'[]'::jsonb)
  ) order by s.created_at,s.id),'[]'::jsonb)
  into result
  from public.project_staff_assignments s
  join public.accounts a on a.id=s.user_id
  where s.project_id=p_project
    and (app_private.can_manage_project(p_project) or app_private.can_manage_project_team(p_project) or s.user_id=auth.uid());
  return result;
end;$$;

create function public.set_survey_assignment_scope(p_project uuid,p_user uuid,p_geography uuid,p_active boolean)
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
    if not app_private.can_manage_surveys() and not (
      exists(select 1 from public.work_applications a where a.survey_project_id=p_project and a.user_id=p_user and a.status='selected')
      or exists(select 1 from public.work_invitations i join public.work_opportunities o on o.id=i.opportunity_id where o.survey_project_id=p_project and i.user_id=p_user and i.status='accepted')
      or exists(select 1 from public.work_assignments w where w.survey_project_id=p_project and w.user_id=p_user and w.status in ('offered','active'))
      or exists(select 1 from public.profile_shares s where s.user_id=p_user and s.organization_id=p.organization_id)
    ) then raise exception 'Volunteer must be connected through a selected application, accepted invitation or assignment';end if;
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

create or replace function public.review_survey_response(p_id uuid,p_status text,p_note text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.survey_responses;org uuid;
begin
  select * into r from public.survey_responses where id=p_id for update;
  if not found or not app_private.can_review_project_area(r.project_id,r.collection_geography_id) then raise exception 'Project/area review permission required';end if;
  if r.collector_id=auth.uid() then raise exception 'Cannot review your own survey';end if;
  if r.status<>'submitted' or r.version is distinct from p_version then raise exception 'Only current submitted responses can be reviewed';end if;
  if p_status is null or p_status not in ('approved','correction_required','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Review decision and note required';end if;
  update public.survey_responses set status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),version=version+1,updated_at=now() where id=p_id;
  select organization_id into org from public.survey_projects where id=r.project_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),org,'survey_response_reviewed',jsonb_build_object('id',p_id,'status',p_status,'previous_version',p_version,'collection_geography',r.collection_geography_id));
  insert into public.notifications(user_id,title,body) values(r.collector_id,'Survey review','A response was reviewed. Open its survey project for feedback.');
end;$$;

revoke all on public.project_staff_assignments,public.project_staff_areas from anon,authenticated;
grant select on public.project_staff_assignments,public.project_staff_areas to authenticated;
grant all on public.project_staff_assignments,public.project_staff_areas to service_role;

revoke all on function app_private.geo_contains(uuid,uuid),app_private.project_staff_active(uuid,text),app_private.can_manage_project_team(uuid),app_private.can_manage_project(uuid),app_private.can_review_project_area(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.geo_contains(uuid,uuid),app_private.project_staff_active(uuid,text),app_private.can_manage_project_team(uuid),app_private.can_manage_project(uuid),app_private.can_review_project_area(uuid,uuid) to authenticated;
revoke all on function app_private.validate_work_assignment_collection_area(),app_private.validate_survey_assignment_collection_area(),app_private.stamp_household_collection_area(),app_private.stamp_response_collection_area(),app_private.stamp_capture_collection_area() from public,anon,authenticated;

revoke all on function public.assign_project_staff(uuid,uuid,text,uuid[],date,date),public.revoke_project_staff(uuid,text,integer),public.project_staff_roster(uuid),public.set_survey_assignment_scope(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.assign_project_staff(uuid,uuid,text,uuid[],date,date),public.revoke_project_staff(uuid,text,integer),public.project_staff_roster(uuid),public.set_survey_assignment_scope(uuid,uuid,uuid,boolean) to authenticated;
