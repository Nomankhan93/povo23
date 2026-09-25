-- FieldLance 2.39.0 — Case Ownership & Delegated Field Operations
-- Adds named operational ownership to the existing beneficiary-case/follow-up stack.
-- Reuses beneficiary_cases, beneficiary_case_followups and operational_tasks.
-- It does not create a second case, task, beneficiary, assistance or finance system.

create table public.beneficiary_case_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.beneficiary_cases(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  geography_id uuid not null references public.geographies(id),
  user_id uuid not null references public.accounts(id),
  owner_role text not null check(owner_role in ('field_worker','area_focal_person')),
  status text not null default 'active' check(status in ('active','ended')),
  assigned_by uuid not null references public.accounts(id),
  assigned_at timestamptz not null default now(),
  ended_by uuid references public.accounts(id),
  ended_at timestamptz,
  end_reason text not null default '' check(length(end_reason)<=2000),
  version integer not null default 1 check(version>0),
  check(
    (status='active' and ended_by is null and ended_at is null and end_reason='')
    or
    (status='ended' and ended_at is not null and length(end_reason) between 5 and 2000)
  )
);

create unique index beneficiary_case_one_active_owner
  on public.beneficiary_case_assignments(case_id)
  where status='active';
create index beneficiary_case_assignments_user
  on public.beneficiary_case_assignments(user_id,status,project_id,assigned_at desc,id);
create index beneficiary_case_assignments_project
  on public.beneficiary_case_assignments(project_id,status,owner_role,assigned_at desc,id);

create table public.beneficiary_case_assignment_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.beneficiary_cases(id),
  assignment_id uuid references public.beneficiary_case_assignments(id),
  event_type text not null check(event_type in ('assigned','reassigned','unassigned','eligibility_ended','case_closed')),
  from_user_id uuid references public.accounts(id),
  from_role text check(from_role is null or from_role in ('field_worker','area_focal_person')),
  to_user_id uuid references public.accounts(id),
  to_role text check(to_role is null or to_role in ('field_worker','area_focal_person')),
  reason text not null check(length(reason) between 5 and 2000),
  actor_id uuid references public.accounts(id),
  recorded_at timestamptz not null default now()
);
create index beneficiary_case_assignment_history
  on public.beneficiary_case_assignment_events(case_id,recorded_at desc,id desc);

create function app_private.case_owner_eligible(p_case uuid,p_user uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.beneficiary_cases c
    join public.survey_projects p on p.id=c.project_id
    join public.organizations o on o.id=c.organization_id
    join public.accounts a on a.id=p_user
    where c.id=p_case
      and c.status<>'closed'
      and p.status='active'
      and o.status='active'
      and a.status='active'
      and (
        (
          p_role='field_worker'
          and exists(
            select 1 from public.survey_assignments sa
            where sa.project_id=c.project_id
              and sa.user_id=p_user
              and sa.active
              and app_private.geo_contains(sa.collection_geography_id,c.geography_id)
          )
        )
        or
        (
          p_role='area_focal_person'
          and exists(
            select 1
            from public.project_staff_assignments s
            join public.organization_memberships m
              on m.organization_id=c.organization_id and m.user_id=s.user_id
            where s.project_id=c.project_id
              and s.user_id=p_user
              and s.role='area_focal_person'
              and s.status='active'
              and s.starts_at<=(now() at time zone 'UTC')::date
              and (s.ends_at is null or s.ends_at>=(now() at time zone 'UTC')::date)
              and m.status='active'
              and m.role in ('ngo_admin','member')
              and exists(
                select 1 from public.project_staff_areas x
                where x.assignment_id=s.id
                  and app_private.geo_contains(x.geography_id,c.geography_id)
              )
          )
        )
      )
  );
$$;

create function app_private.case_delegate_active(p_case uuid,p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and exists(
    select 1
    from public.beneficiary_case_assignments a
    where a.case_id=p_case
      and a.user_id=p_user
      and a.status='active'
      and app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role)
  );
$$;

create function app_private.can_operate_beneficiary_case(p_case uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.beneficiary_cases c
    where c.id=p_case
      and (app_private.can_manage_project(c.project_id) or app_private.case_delegate_active(c.id,auth.uid()))
  );
$$;

create or replace function app_private.sync_case_followup_task()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_user uuid; owner_role text;
begin
  select a.user_id,a.owner_role into owner_user,owner_role
  from public.beneficiary_case_assignments a
  where a.case_id=new.case_id
    and a.status='active'
    and app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role)
  order by a.assigned_at desc,a.id desc limit 1;

  perform app_private.upsert_derived_operational_task(
    'beneficiary_case_followup','Complete beneficiary case follow-up',
    'Complete the scheduled follow-up in the beneficiary case workflow and record the outcome there.',
    'beneficiary_case_followup',new.id::text,'Beneficiary cases',new.organization_id,new.project_id,
    coalesce(owner_user,new.created_by),coalesce(owner_role,'case_followup'),'high',
    (new.due_on::timestamp+interval '17 hours') at time zone 'UTC',
    new.status='scheduled',jsonb_build_object('case_id',new.case_id,'followup_type',new.followup_type)
  );
  return new;
end;$$;

create function app_private.refresh_case_followup_tasks(p_case uuid)
returns void language plpgsql security definer set search_path='' as $$
declare f public.beneficiary_case_followups;
begin
  for f in select * from public.beneficiary_case_followups where case_id=p_case and status='scheduled' loop
    perform app_private.upsert_derived_operational_task(
      'beneficiary_case_followup','Complete beneficiary case follow-up',
      'Complete the scheduled follow-up in the beneficiary case workflow and record the outcome there.',
      'beneficiary_case_followup',f.id::text,'Beneficiary cases',f.organization_id,f.project_id,
      (select a.user_id from public.beneficiary_case_assignments a where a.case_id=p_case and a.status='active' and app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role) order by a.assigned_at desc,a.id desc limit 1),
      (select a.owner_role from public.beneficiary_case_assignments a where a.case_id=p_case and a.status='active' and app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role) order by a.assigned_at desc,a.id desc limit 1),
      'high',(f.due_on::timestamp+interval '17 hours') at time zone 'UTC',true,
      jsonb_build_object('case_id',f.case_id,'followup_type',f.followup_type)
    );
  end loop;
end;$$;

create function app_private.end_case_owner(p_case uuid,p_reason text,p_event_type text,p_actor uuid default auth.uid())
returns void language plpgsql security definer set search_path='' as $$
declare current_owner public.beneficiary_case_assignments;
begin
  select * into current_owner
  from public.beneficiary_case_assignments
  where case_id=p_case and status='active'
  order by assigned_at desc,id desc limit 1 for update;
  if not found then return;end if;

  update public.beneficiary_case_assignments
  set status='ended',ended_by=p_actor,ended_at=now(),end_reason=trim(p_reason),version=version+1
  where id=current_owner.id;

  insert into public.beneficiary_case_assignment_events(
    case_id,assignment_id,event_type,from_user_id,from_role,reason,actor_id
  ) values(
    p_case,current_owner.id,p_event_type,current_owner.user_id,current_owner.owner_role,trim(p_reason),p_actor
  );

  insert into public.notifications(user_id,title,body)
  values(current_owner.user_id,'Case responsibility ended','A beneficiary case is no longer assigned to you. Open My Cases for your current responsibilities.');

  perform app_private.refresh_case_followup_tasks(p_case);
end;$$;

create function public.beneficiary_case_assignment_candidates(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.beneficiary_cases; result jsonb;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;

  with candidates as (
    select distinct a.id as user_id,a.full_name as name,'field_worker'::text owner_role,'Active Field Worker assignment'::text scope_label
    from public.survey_assignments sa
    join public.accounts a on a.id=sa.user_id and a.status='active'
    where sa.project_id=c.project_id and sa.active
      and app_private.geo_contains(sa.collection_geography_id,c.geography_id)
    union all
    select distinct a.id,a.full_name,'area_focal_person'::text,'Area Focal for this case geography'::text
    from public.project_staff_assignments s
    join public.accounts a on a.id=s.user_id and a.status='active'
    join public.organization_memberships m on m.organization_id=c.organization_id and m.user_id=s.user_id and m.status='active' and m.role in ('ngo_admin','member')
    where s.project_id=c.project_id and s.role='area_focal_person' and s.status='active'
      and s.starts_at<=(now() at time zone 'UTC')::date
      and (s.ends_at is null or s.ends_at>=(now() at time zone 'UTC')::date)
      and exists(select 1 from public.project_staff_areas x where x.assignment_id=s.id and app_private.geo_contains(x.geography_id,c.geography_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'name',name,'owner_role',owner_role,'scope_label',scope_label) order by owner_role,name,user_id),'[]'::jsonb)
  into result from candidates;
  return result;
end;$$;

create function public.beneficiary_case_ownership_detail(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.beneficiary_cases; result jsonb;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;

  select jsonb_build_object(
    'current_assignment',(
      select jsonb_build_object(
        'id',a.id,'user_id',a.user_id,'name',ac.full_name,'owner_role',a.owner_role,
        'status',a.status,'assigned_at',a.assigned_at,'version',a.version,
        'eligible',app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role)
      )
      from public.beneficiary_case_assignments a join public.accounts ac on ac.id=a.user_id
      where a.case_id=p_case and a.status='active'
      order by a.assigned_at desc,a.id desc limit 1
    ),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'event_type',e.event_type,'from_user_id',e.from_user_id,'from_name',fa.full_name,'from_role',e.from_role,
        'to_user_id',e.to_user_id,'to_name',ta.full_name,'to_role',e.to_role,'reason',e.reason,'actor_id',e.actor_id,'recorded_at',e.recorded_at
      ) order by e.recorded_at desc,e.id desc)
      from public.beneficiary_case_assignment_events e
      left join public.accounts fa on fa.id=e.from_user_id
      left join public.accounts ta on ta.id=e.to_user_id
      where e.case_id=p_case
    ),'[]'::jsonb),
    'candidates',public.beneficiary_case_assignment_candidates(p_case)
  ) into result;
  return result;
end;$$;

create function public.set_beneficiary_case_owner(
  p_case uuid,p_user uuid,p_owner_role text,p_reason text,p_expected_assignment uuid,p_expected_version integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases; current_owner public.beneficiary_case_assignments; new_id uuid:=gen_random_uuid(); event_name text;
begin
  select * into c from public.beneficiary_cases where id=p_case for update;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  if c.status='closed' then raise exception 'Reopen the beneficiary case before assigning an owner';end if;
  if p_owner_role not in ('field_worker','area_focal_person') then raise exception 'Valid case owner role required';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Case assignment reason required';end if;
  if not app_private.case_owner_eligible(p_case,p_user,p_owner_role) then raise exception 'Case owner must have current project and geography authority';end if;

  select * into current_owner from public.beneficiary_case_assignments
  where case_id=p_case and status='active' order by assigned_at desc,id desc limit 1 for update;

  if found then
    if current_owner.user_id=p_user and current_owner.owner_role=p_owner_role then return current_owner.id;end if;
    if p_expected_assignment is distinct from current_owner.id or p_expected_version is distinct from current_owner.version then raise exception 'Case ownership changed. Reload before reassigning.';end if;
    update public.beneficiary_case_assignments
    set status='ended',ended_by=auth.uid(),ended_at=now(),end_reason=trim(p_reason),version=version+1
    where id=current_owner.id;
    event_name:='reassigned';
  else
    if p_expected_assignment is not null or p_expected_version is not null then raise exception 'Case ownership changed. Reload before assigning.';end if;
    event_name:='assigned';
  end if;

  insert into public.beneficiary_case_assignments(
    id,case_id,organization_id,project_id,geography_id,user_id,owner_role,assigned_by
  ) values(new_id,c.id,c.organization_id,c.project_id,c.geography_id,p_user,p_owner_role,auth.uid());

  insert into public.beneficiary_case_assignment_events(
    case_id,assignment_id,event_type,from_user_id,from_role,to_user_id,to_role,reason,actor_id
  ) values(
    c.id,new_id,event_name,
    case when event_name='reassigned' then current_owner.user_id else null end,
    case when event_name='reassigned' then current_owner.owner_role else null end,
    p_user,p_owner_role,trim(p_reason),auth.uid()
  );

  if event_name='reassigned' then
    insert into public.notifications(user_id,title,body)
    values(current_owner.user_id,'Case reassigned','A beneficiary case was reassigned. Open My Cases for your current responsibilities.');
  end if;
  insert into public.notifications(user_id,title,body)
  values(p_user,'Case assigned','A beneficiary case has been assigned to you. Open My Cases to review the responsibility and follow-ups.');
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),p_user,c.organization_id,'beneficiary_case_owner_'||event_name,jsonb_build_object('case',c.id,'assignment',new_id,'project',c.project_id,'owner_role',p_owner_role,'reason',trim(p_reason)));

  perform app_private.refresh_case_followup_tasks(c.id);
  return new_id;
end;$$;

create function public.clear_beneficiary_case_owner(
  p_case uuid,p_reason text,p_expected_assignment uuid,p_expected_version integer
) returns void language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases; current_owner public.beneficiary_case_assignments;
begin
  select * into c from public.beneficiary_cases where id=p_case for update;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Case unassignment reason required';end if;
  select * into current_owner from public.beneficiary_case_assignments where case_id=p_case and status='active' order by assigned_at desc,id desc limit 1 for update;
  if not found then raise exception 'Beneficiary case has no active owner';end if;
  if p_expected_assignment is distinct from current_owner.id or p_expected_version is distinct from current_owner.version then raise exception 'Case ownership changed. Reload before unassigning.';end if;

  update public.beneficiary_case_assignments
  set status='ended',ended_by=auth.uid(),ended_at=now(),end_reason=trim(p_reason),version=version+1
  where id=current_owner.id;
  insert into public.beneficiary_case_assignment_events(case_id,assignment_id,event_type,from_user_id,from_role,reason,actor_id)
  values(c.id,current_owner.id,'unassigned',current_owner.user_id,current_owner.owner_role,trim(p_reason),auth.uid());
  insert into public.notifications(user_id,title,body)
  values(current_owner.user_id,'Case responsibility ended','A beneficiary case was unassigned from you. Open My Cases for your current responsibilities.');
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),current_owner.user_id,c.organization_id,'beneficiary_case_owner_unassigned',jsonb_build_object('case',c.id,'assignment',current_owner.id,'project',c.project_id,'reason',trim(p_reason)));
  perform app_private.refresh_case_followup_tasks(c.id);
end;$$;

create function public.my_delegated_case_queue(p_view text default 'all',p_project uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; lim integer:=least(greatest(coalesce(p_limit,100),1),200); today date:=(now() at time zone 'UTC')::date;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_view not in ('all','open','due_today','overdue','upcoming') then raise exception 'Valid delegated case view required';end if;

  with visible as (
    select c.*,a.owner_role,a.assigned_at,
      (select min(f.due_on) from public.beneficiary_case_followups f where f.case_id=c.id and f.status='scheduled') next_followup_on,
      (select count(*) from public.beneficiary_case_followups f where f.case_id=c.id and f.status='scheduled') scheduled_followups,
      (select count(*) from public.beneficiary_case_followups f where f.case_id=c.id and f.status='scheduled' and f.due_on<today) overdue_followups,
      (select count(*) from public.beneficiary_case_followups f where f.case_id=c.id and f.status='scheduled' and f.due_on=today) due_today_followups
    from public.beneficiary_cases c
    join public.beneficiary_case_assignments a on a.case_id=c.id and a.status='active' and a.user_id=auth.uid()
    where app_private.case_delegate_active(c.id,auth.uid())
      and (p_project is null or c.project_id=p_project)
  ), filtered as (
    select * from visible where
      p_view='all'
      or (p_view='open' and status in ('open','on_hold'))
      or (p_view='due_today' and due_today_followups>0)
      or (p_view='overdue' and overdue_followups>0)
      or (p_view='upcoming' and next_followup_on>today)
  ), limited as (
    select * from filtered
    order by case when overdue_followups>0 then 0 when due_today_followups>0 then 1 else 2 end,
      case priority when 'high' then 0 when 'medium' then 1 else 2 end,
      next_followup_on nulls last,updated_at desc,id
    limit lim
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'case_no',c.case_no,'project_id',c.project_id,'project_title',p.title,'organization_name',o.name,
      'beneficiary_name',rp.full_name,'registry_no',rp.registry_no,'geography_name',g.name,
      'title',c.title,'summary',c.summary,'priority',c.priority,'status',c.status,
      'owner_role',c.owner_role,'assigned_at',c.assigned_at,'next_followup_on',c.next_followup_on,
      'scheduled_followups',c.scheduled_followups,'overdue_followups',c.overdue_followups,'due_today_followups',c.due_today_followups
    ) order by case when c.overdue_followups>0 then 0 when c.due_today_followups>0 then 1 else 2 end,c.next_followup_on nulls last,c.id)
      from limited c join public.survey_projects p on p.id=c.project_id join public.organizations o on o.id=c.organization_id join public.registry_persons rp on rp.id=c.person_id join public.geographies g on g.id=c.geography_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'total',(select count(*) from visible),
      'open',(select count(*) from visible where status in ('open','on_hold')),
      'due_today',(select count(*) from visible where due_today_followups>0),
      'overdue',(select count(*) from visible where overdue_followups>0),
      'upcoming',(select count(*) from visible where next_followup_on>today)
    ),
    'utc_today',today,'limit',lim
  ) into result;
  return result;
end;$$;

create function public.my_delegated_followup_queue(p_view text default 'scheduled',p_project uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; lim integer:=least(greatest(coalesce(p_limit,100),1),200); today date:=(now() at time zone 'UTC')::date;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_view not in ('all','scheduled','due_today','overdue','upcoming','completed','cancelled') then raise exception 'Valid delegated follow-up view required';end if;

  with visible as (
    select f.*,c.case_no,c.title case_title,c.priority case_priority,a.owner_role,
      p.title project_title,o.name organization_name,rp.full_name beneficiary_name,rp.registry_no
    from public.beneficiary_case_followups f
    join public.beneficiary_cases c on c.id=f.case_id
    join public.beneficiary_case_assignments a on a.case_id=c.id and a.status='active' and a.user_id=auth.uid()
    join public.survey_projects p on p.id=f.project_id
    join public.organizations o on o.id=f.organization_id
    join public.registry_persons rp on rp.id=f.person_id
    where app_private.case_delegate_active(c.id,auth.uid())
      and (p_project is null or c.project_id=p_project)
  ), filtered as (
    select * from visible where
      p_view='all'
      or (p_view='scheduled' and status='scheduled')
      or (p_view='due_today' and status='scheduled' and due_on=today)
      or (p_view='overdue' and status='scheduled' and due_on<today)
      or (p_view='upcoming' and status='scheduled' and due_on>today)
      or (p_view='completed' and status='completed')
      or (p_view='cancelled' and status='cancelled')
  ), limited as (
    select * from filtered order by case when status='scheduled' and due_on<today then 0 when status='scheduled' and due_on=today then 1 else 2 end,due_on,id limit lim
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(x) order by case when x.status='scheduled' and x.due_on<today then 0 when x.status='scheduled' and x.due_on=today then 1 else 2 end,x.due_on,x.id) from limited x),'[]'::jsonb),
    'summary',jsonb_build_object(
      'scheduled',(select count(*) from visible where status='scheduled'),
      'due_today',(select count(*) from visible where status='scheduled' and due_on=today),
      'overdue',(select count(*) from visible where status='scheduled' and due_on<today),
      'upcoming',(select count(*) from visible where status='scheduled' and due_on>today),
      'completed',(select count(*) from visible where status='completed')
    ),'utc_today',today,'limit',lim
  ) into result;
  return result;
end;$$;

create function public.my_delegated_case_detail(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.beneficiary_cases; result jsonb;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.case_delegate_active(p_case,auth.uid()) then raise exception 'Assigned beneficiary case access required';end if;

  select jsonb_build_object(
    'case',jsonb_build_object('id',c.id,'case_no',c.case_no,'title',c.title,'summary',c.summary,'priority',c.priority,'status',c.status,'follow_up_on',c.follow_up_on,'geography_id',c.geography_id,'version',c.version),
    'person',(select jsonb_build_object('id',p.id,'registry_no',p.registry_no,'full_name',p.full_name) from public.registry_persons p where p.id=c.person_id),
    'project',(select jsonb_build_object('id',p.id,'title',p.title) from public.survey_projects p where p.id=c.project_id),
    'organization',(select jsonb_build_object('id',o.id,'name',o.name) from public.organizations o where o.id=c.organization_id),
    'geography',(select jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind) from public.geographies g where g.id=c.geography_id),
    'assignment',(select jsonb_build_object('id',a.id,'owner_role',a.owner_role,'assigned_at',a.assigned_at) from public.beneficiary_case_assignments a where a.case_id=c.id and a.user_id=auth.uid() and a.status='active' order by a.assigned_at desc limit 1),
    'needs',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'category',n.category,'description',n.description,'priority',n.priority,'status',n.status,'follow_up_on',n.follow_up_on) order by case n.priority when 'high' then 0 when 'medium' then 1 else 2 end,n.created_at,n.id) from public.beneficiary_needs n join public.beneficiary_case_needs l on l.need_id=n.id where l.case_id=c.id and l.active),'[]'::jsonb),
    'followups',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'parent_followup_id',f.parent_followup_id,'need_id',f.need_id,'followup_type',f.followup_type,'due_on',f.due_on,'status',f.status,
      'outcome_status',f.outcome_status,'observations',f.observations,'beneficiary_feedback',f.beneficiary_feedback,'next_action',f.next_action,'next_follow_up_on',f.next_follow_up_on,
      'last_reason',f.last_reason,'version',f.version,'created_at',f.created_at,'completed_at',f.completed_at,'cancellation_reason',f.cancellation_reason
    ) order by case when f.status='scheduled' then 0 else 1 end,f.due_on,f.id) from public.beneficiary_case_followups f where f.case_id=c.id),'[]'::jsonb)
  ) into result;
  return result;
end;$$;

-- Managers keep the existing full case queue, now with explicit ownership metadata.
create or replace function public.beneficiary_case_queue(
  p_organization uuid default null,
  p_project uuid default null,
  p_status text default null,
  p_priority text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;lim integer:=least(greatest(coalesce(p_limit,100),1),200);
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_organization is not null and not app_private.can_manage_surveys() and not app_private.ngo_admin(p_organization) and not exists(
    select 1 from public.survey_projects p where p.organization_id=p_organization and app_private.can_manage_project(p.id)
  ) then raise exception 'Beneficiary case management permission required';end if;
  if p_status is not null and p_status not in ('open','on_hold','closed') then raise exception 'Valid case status filter required';end if;
  if p_priority is not null and p_priority not in ('low','medium','high') then raise exception 'Valid case priority filter required';end if;
  if p_project is not null and not app_private.can_manage_project(p_project) then raise exception 'Beneficiary case management permission required';end if;

  with visible as (
    select c.* from public.beneficiary_cases c
    where app_private.can_manage_project(c.project_id)
      and (p_organization is null or c.organization_id=p_organization)
      and (p_project is null or c.project_id=p_project)
      and (p_status is null or c.status=p_status)
      and (p_priority is null or c.priority=p_priority)
  ), limited as (
    select * from visible
    order by case priority when 'high' then 0 when 'medium' then 1 else 2 end,
      case status when 'open' then 0 when 'on_hold' then 1 else 2 end,
      follow_up_on nulls last,updated_at desc,id
    limit lim
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'case_no',c.case_no,'organization_id',c.organization_id,'organization_name',o.name,
      'project_id',c.project_id,'project_title',p.title,'person_id',c.person_id,'beneficiary_name',rp.full_name,'registry_no',rp.registry_no,
      'title',c.title,'summary',c.summary,'priority',c.priority,'status',c.status,'follow_up_on',c.follow_up_on,'version',c.version,
      'updated_at',c.updated_at,
      'owner_user_id',(select a.user_id from public.beneficiary_case_assignments a where a.case_id=c.id and a.status='active' order by a.assigned_at desc limit 1),
      'owner_name',(select ac.full_name from public.beneficiary_case_assignments a join public.accounts ac on ac.id=a.user_id where a.case_id=c.id and a.status='active' order by a.assigned_at desc limit 1),
      'owner_role',(select a.owner_role from public.beneficiary_case_assignments a where a.case_id=c.id and a.status='active' order by a.assigned_at desc limit 1),
      'owner_eligible',(select app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role) from public.beneficiary_case_assignments a where a.case_id=c.id and a.status='active' order by a.assigned_at desc limit 1),
      'active_needs',(select count(*) from public.beneficiary_case_needs l where l.case_id=c.id and l.active),
      'draft_requests',(select count(*) from public.assistance_requests r where r.case_id=c.id and r.status='draft'),
      'submitted_requests',(select count(*) from public.assistance_requests r where r.case_id=c.id and r.status='submitted'),
      'approved_requests',(select count(*) from public.assistance_requests r where r.case_id=c.id and r.status='approved')
    ) order by case c.priority when 'high' then 0 when 'medium' then 1 else 2 end,c.updated_at desc,c.id)
    from limited c join public.organizations o on o.id=c.organization_id join public.survey_projects p on p.id=c.project_id join public.registry_persons rp on rp.id=c.person_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'total',(select count(*) from visible),
      'open',(select count(*) from visible where status='open'),
      'on_hold',(select count(*) from visible where status='on_hold'),
      'closed',(select count(*) from visible where status='closed'),
      'assigned',(select count(*) from visible c where exists(select 1 from public.beneficiary_case_assignments a where a.case_id=c.id and a.status='active')),
      'unassigned',(select count(*) from visible c where c.status<>'closed' and not exists(select 1 from public.beneficiary_case_assignments a where a.case_id=c.id and a.status='active')),
      'high_priority_open',(select count(*) from visible where priority='high' and status='open'),
      'submitted_requests',(select count(*) from public.assistance_requests r join visible c on c.id=r.case_id where r.status='submitted'),
      'approved_requests',(select count(*) from public.assistance_requests r join visible c on c.id=r.case_id where r.status='approved')
    ),
    'limit',lim
  ) into result;
  return result;
end;$$;

-- Existing follow-up RPCs now allow only the explicitly delegated case owner in addition to current project managers.
create or replace function public.create_beneficiary_case_followup(
  p_id uuid,p_case uuid,p_need uuid,p_assistance uuid,p_type text,p_due_on date,p_reason text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases;existing public.beneficiary_case_followups;
begin
  if p_id is null then raise exception 'Follow-up ID required';end if;
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_operate_beneficiary_case(c.id) then raise exception 'Beneficiary case follow-up permission required';end if;
  if p_type is null or p_type not in ('phone','field_visit','office_visit','partner_feedback','document_review','other')
    or p_due_on is null or not isfinite(p_due_on) or p_due_on<'1900-01-01'::date
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
  then raise exception 'Valid follow-up type, due date and reason required';end if;
  select * into existing from public.beneficiary_case_followups where id=p_id;
  if found then
    if existing.created_by=auth.uid() and existing.case_id=p_case
      and existing.need_id is not distinct from p_need and existing.assistance_id is not distinct from p_assistance
      and existing.followup_type=p_type and existing.due_on=p_due_on and existing.last_reason=trim(p_reason)
    then return existing.id;end if;
    raise exception 'Follow-up ID already used with different details';
  end if;
  select * into c from public.beneficiary_cases where id=p_case for update;
  if c.status='closed' then raise exception 'Reopen the beneficiary case before scheduling follow-up';end if;
  if not exists(select 1 from public.organizations where id=c.organization_id and status='active') then raise exception 'Active NGO required for beneficiary follow-up';end if;
  if p_need is not null and not exists(
    select 1 from public.beneficiary_case_needs l join public.beneficiary_needs n on n.id=l.need_id
    where l.case_id=c.id and l.need_id=p_need and l.active and n.project_id=c.project_id and n.person_id=c.person_id
  ) then raise exception 'Follow-up need must be actively linked to this beneficiary case';end if;
  if p_assistance is not null and not exists(
    select 1 from public.assistance_distribution_deliveries d join public.assistance_entries a on a.id=d.assistance_id
    where d.assistance_id=p_assistance and d.case_id=c.id and d.project_id=c.project_id and d.person_id=c.person_id and d.status='recorded' and a.status='recorded'
  ) then raise exception 'Follow-up assistance must be a recorded delivery for this beneficiary case';end if;
  insert into public.beneficiary_case_followups(id,case_id,organization_id,project_id,person_id,need_id,assistance_id,followup_type,due_on,last_reason,created_by,updated_by)
  values(p_id,c.id,c.organization_id,c.project_id,c.person_id,p_need,p_assistance,p_type,p_due_on,trim(p_reason),auth.uid(),auth.uid());
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'beneficiary_case_followup_scheduled',jsonb_build_object('followup',p_id,'case',c.id,'need',p_need,'assistance',p_assistance,'due_on',p_due_on,'type',p_type));
  return p_id;
end;$$;

create or replace function public.complete_beneficiary_case_followup(
  p_id uuid,p_outcome text,p_observations text,p_feedback text,p_next_action text,p_next_follow_up date,p_need_status text,p_reason text,p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare f public.beneficiary_case_followups;c public.beneficiary_cases;n public.beneficiary_needs;
begin
  select * into f from public.beneficiary_case_followups where id=p_id;
  if not found or not app_private.can_operate_beneficiary_case(f.case_id) then raise exception 'Beneficiary case follow-up permission required';end if;
  select * into c from public.beneficiary_cases where id=f.case_id for update;
  select * into f from public.beneficiary_case_followups where id=p_id for update;
  if f.version is distinct from p_version then raise exception 'Follow-up changed. Reload before completing.';end if;
  if f.status<>'scheduled' then raise exception 'Only a scheduled follow-up can be completed';end if;
  if c.status='closed' then raise exception 'Reopen the beneficiary case before recording a follow-up outcome';end if;
  if p_outcome is null or p_outcome not in ('resolved','partially_resolved','unresolved','further_assistance_required','referred','unable_to_verify')
    or p_observations is null or length(trim(p_observations)) not between 5 and 4000
    or (p_feedback is not null and length(trim(p_feedback))>4000)
    or p_next_action is null or length(trim(p_next_action)) not between 3 and 2000
    or (p_next_follow_up is not null and (not isfinite(p_next_follow_up) or p_next_follow_up<(now() at time zone 'UTC')::date))
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
  then raise exception 'Valid outcome, observations, next action, optional next follow-up and reason required';end if;
  if f.need_id is null and p_need_status is not null then raise exception 'Need status can only be changed by a follow-up linked to an assessed need';end if;
  if f.need_id is not null then
    select * into n from public.beneficiary_needs where id=f.need_id for update;
    if n.id is null or n.project_id<>f.project_id or n.person_id<>f.person_id or not exists(select 1 from public.beneficiary_case_needs l where l.case_id=f.case_id and l.need_id=f.need_id and l.active) then raise exception 'Follow-up assessed need is no longer active in this beneficiary case';end if;
    if p_need_status is not null and p_need_status not in ('open','in_progress','met','closed','needs_review') then raise exception 'Valid assessed-need status required';end if;
    if p_need_status is not null then
      if p_outcome='resolved' and p_need_status not in ('met','closed') then raise exception 'Resolved outcome requires assessed need to be met or closed';end if;
      if p_outcome='partially_resolved' and p_need_status<>'in_progress' then raise exception 'Partially resolved outcome requires assessed need to remain in progress';end if;
      if p_outcome in ('unresolved','further_assistance_required','unable_to_verify') and p_need_status not in ('in_progress','needs_review') then raise exception 'Unresolved outcome requires assessed need to remain in progress or needs review';end if;
      if p_outcome='referred' and p_need_status not in ('in_progress','closed') then raise exception 'Referred outcome requires assessed need to remain in progress or close as referred';end if;
      if p_need_status='met' and (
        not exists(select 1 from public.need_assistance_links l join public.assistance_entries a on a.id=l.assistance_id where l.need_id=n.id and l.active and a.status='recorded')
        or exists(select 1 from public.need_assistance_links l join public.assistance_entries a on a.id=l.assistance_id where l.need_id=n.id and l.active and a.status='void')
      ) then raise exception 'Met requires recorded linked assistance. Remove voided links before confirming.';end if;
      if n.status is distinct from p_need_status then
        update public.beneficiary_needs set status=p_need_status,follow_up_on=p_next_follow_up,version=version+1,last_reason='Follow-up outcome: '||trim(p_reason),updated_by=auth.uid(),updated_at=now() where id=n.id;
      elsif n.follow_up_on is distinct from p_next_follow_up then
        update public.beneficiary_needs set follow_up_on=p_next_follow_up,version=version+1,last_reason='Follow-up schedule: '||trim(p_reason),updated_by=auth.uid(),updated_at=now() where id=n.id;
      end if;
    end if;
  end if;
  update public.beneficiary_case_followups set status='completed',outcome_status=p_outcome,observations=trim(p_observations),beneficiary_feedback=nullif(trim(coalesce(p_feedback,'')),''),next_action=trim(p_next_action),next_follow_up_on=p_next_follow_up,last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now(),completed_by=auth.uid(),completed_at=now() where id=p_id;
  if p_next_follow_up is not null then
    insert into public.beneficiary_case_followups(id,case_id,organization_id,project_id,person_id,need_id,assistance_id,parent_followup_id,followup_type,due_on,last_reason,created_by,updated_by)
    values(gen_random_uuid(),f.case_id,f.organization_id,f.project_id,f.person_id,f.need_id,f.assistance_id,f.id,f.followup_type,p_next_follow_up,'Scheduled from completed follow-up '||f.id::text,auth.uid(),auth.uid());
  end if;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),f.organization_id,'beneficiary_case_followup_completed',jsonb_build_object('followup',f.id,'case',f.case_id,'need',f.need_id,'assistance',f.assistance_id,'outcome',p_outcome,'next_follow_up_on',p_next_follow_up,'need_status',p_need_status));
end;$$;

create or replace function public.cancel_beneficiary_case_followup(p_id uuid,p_reason text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare f public.beneficiary_case_followups;c public.beneficiary_cases;
begin
  select * into f from public.beneficiary_case_followups where id=p_id;
  if not found or not app_private.can_operate_beneficiary_case(f.case_id) then raise exception 'Beneficiary case follow-up permission required';end if;
  select * into c from public.beneficiary_cases where id=f.case_id for update;
  select * into f from public.beneficiary_case_followups where id=p_id for update;
  if f.version is distinct from p_version then raise exception 'Follow-up changed. Reload before cancellation.';end if;
  if f.status<>'scheduled' then raise exception 'Only a scheduled follow-up can be cancelled';end if;
  if c.status='closed' then raise exception 'Closed cases cannot change follow-up schedules';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Follow-up cancellation reason required';end if;
  update public.beneficiary_case_followups set status='cancelled',last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now(),cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=trim(p_reason) where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),f.organization_id,'beneficiary_case_followup_cancelled',jsonb_build_object('followup',f.id,'case',f.case_id,'previous_version',p_version));
end;$$;

create function app_private.sync_case_owner_on_case_close()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status is distinct from new.status and new.status='closed' then
    perform app_private.end_case_owner(new.id,'Case closed; live delegated ownership ended.','case_closed',auth.uid());
  end if;
  return new;
end;$$;
create trigger beneficiary_case_owner_close
  after update of status on public.beneficiary_cases
  for each row execute function app_private.sync_case_owner_on_case_close();

create function app_private.sync_case_owner_on_survey_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
  if old.active is distinct from new.active or old.collection_geography_id is distinct from new.collection_geography_id then
    for item in
      select a.case_id from public.beneficiary_case_assignments a
      where a.project_id=new.project_id and a.user_id=new.user_id and a.owner_role='field_worker' and a.status='active'
        and not app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role)
    loop
      perform app_private.end_case_owner(item.case_id,'Field Worker project or collection-area authority ended.','eligibility_ended',auth.uid());
    end loop;
  end if;
  return new;
end;$$;
create trigger beneficiary_case_owner_survey_assignment
  after update of active,collection_geography_id on public.survey_assignments
  for each row execute function app_private.sync_case_owner_on_survey_assignment();

create function app_private.sync_case_owner_on_project_staff()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
  if old.status is distinct from new.status or old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at then
    for item in
      select a.case_id from public.beneficiary_case_assignments a
      where a.project_id=new.project_id and a.user_id=new.user_id and a.owner_role='area_focal_person' and a.status='active'
        and not app_private.case_owner_eligible(a.case_id,a.user_id,a.owner_role)
    loop
      perform app_private.end_case_owner(item.case_id,'Area Focal project authority ended.','eligibility_ended',auth.uid());
    end loop;
  end if;
  return new;
end;$$;
create trigger beneficiary_case_owner_project_staff
  after update of status,starts_at,ends_at on public.project_staff_assignments
  for each row execute function app_private.sync_case_owner_on_project_staff();

alter table public.beneficiary_case_assignments enable row level security;
alter table public.beneficiary_case_assignment_events enable row level security;

create policy beneficiary_case_assignments_read on public.beneficiary_case_assignments
for select to authenticated using(user_id=auth.uid() or app_private.can_manage_project(project_id));
create policy beneficiary_case_assignment_events_read on public.beneficiary_case_assignment_events
for select to authenticated using(
  exists(select 1 from public.beneficiary_cases c where c.id=case_id and app_private.can_manage_project(c.project_id))
);

revoke all on public.beneficiary_case_assignments,public.beneficiary_case_assignment_events from public,anon,authenticated;
grant select on public.beneficiary_case_assignments,public.beneficiary_case_assignment_events to authenticated;
grant all on public.beneficiary_case_assignments,public.beneficiary_case_assignment_events to service_role;

revoke all on function app_private.case_owner_eligible(uuid,uuid,text),app_private.case_delegate_active(uuid,uuid),app_private.can_operate_beneficiary_case(uuid),app_private.refresh_case_followup_tasks(uuid),app_private.end_case_owner(uuid,text,text,uuid),app_private.sync_case_owner_on_case_close(),app_private.sync_case_owner_on_survey_assignment(),app_private.sync_case_owner_on_project_staff() from public,anon,authenticated;

revoke all on function public.beneficiary_case_assignment_candidates(uuid),public.beneficiary_case_ownership_detail(uuid),public.set_beneficiary_case_owner(uuid,uuid,text,text,uuid,integer),public.clear_beneficiary_case_owner(uuid,text,uuid,integer),public.my_delegated_case_queue(text,uuid,integer),public.my_delegated_followup_queue(text,uuid,integer),public.my_delegated_case_detail(uuid) from public,anon,authenticated;
grant execute on function public.beneficiary_case_assignment_candidates(uuid),public.beneficiary_case_ownership_detail(uuid),public.set_beneficiary_case_owner(uuid,uuid,text,text,uuid,integer),public.clear_beneficiary_case_owner(uuid,text,uuid,integer),public.my_delegated_case_queue(text,uuid,integer),public.my_delegated_followup_queue(text,uuid,integer),public.my_delegated_case_detail(uuid) to authenticated;

insert into public.audit_events(actor_id,action,detail)
values(null,'fieldlance_2_39_case_ownership_enabled',jsonb_build_object('case_ownership',true,'delegated_followup_operations',true));
