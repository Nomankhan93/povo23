-- FieldLance 2.37.0 — Workforce Scheduling, Availability, Capacity & Assignment Safety
-- Structured worker availability stays private. Organizations receive only privacy-preserving
-- conflict/capacity summaries through guarded RPCs; existing assignments remain authoritative.

create table public.worker_availability_preferences (
  user_id uuid primary key references public.accounts(id) on delete cascade,
  timezone text not null default 'Asia/Karachi' check(length(timezone) between 3 and 100),
  max_active_projects integer not null default 2 check(max_active_projects between 1 and 10),
  max_days_per_week integer not null default 5 check(max_days_per_week between 1 and 7),
  preferred_shift text not null default 'flexible' check(preferred_shift in ('morning','afternoon','evening','flexible')),
  travel_willingness text not null default 'local' check(travel_willingness in ('none','local','district','province','national')),
  updated_at timestamptz not null default now()
);

create table public.worker_availability_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.accounts(id) on delete cascade,
  weekday smallint not null check(weekday between 1 and 7),
  is_available boolean not null default true,
  start_time text,
  end_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,weekday),
  check(
    (not is_available and start_time is null and end_time is null)
    or (is_available and start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and start_time::time<end_time::time)
  )
);

create table public.worker_unavailable_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.accounts(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null default '' check(length(reason)<=500),
  created_at timestamptz not null default now(),
  check(ends_on>=starts_on)
);

create index worker_availability_rules_user on public.worker_availability_rules(user_id,weekday);
create index worker_unavailable_periods_user_dates on public.worker_unavailable_periods(user_id,starts_on,ends_on);

alter table public.worker_availability_preferences enable row level security;
alter table public.worker_availability_rules enable row level security;
alter table public.worker_unavailable_periods enable row level security;

create policy worker_availability_preferences_read on public.worker_availability_preferences
for select to authenticated using(app_private.is_active() and user_id=auth.uid());
create policy worker_availability_rules_read on public.worker_availability_rules
for select to authenticated using(app_private.is_active() and user_id=auth.uid());
create policy worker_unavailable_periods_read on public.worker_unavailable_periods
for select to authenticated using(app_private.is_active() and user_id=auth.uid());

revoke all on public.worker_availability_preferences,public.worker_availability_rules,public.worker_unavailable_periods from anon;
revoke insert,update,delete on public.worker_availability_preferences,public.worker_availability_rules,public.worker_unavailable_periods from authenticated;
grant select on public.worker_availability_preferences,public.worker_availability_rules,public.worker_unavailable_periods to authenticated;

create or replace function app_private.worker_assignment_conflict_summary(
  p_user uuid,
  p_start date,
  p_end date,
  p_project uuid default null,
  p_exclude_assignment uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  pref public.worker_availability_preferences;
  max_projects integer:=2;
  max_days integer:=5;
  overlap_count integer:=0;
  rule_count integer:=0;
  available_days integer:=null;
  unavailable_days integer:=0;
  proposed_concurrent integer:=1;
  capacity_pct integer:=50;
  state text:='clear';
  reasons jsonb:='[]'::jsonb;
  range_days integer;
begin
  if p_user is null or p_start is null or p_end is null or p_end<p_start then
    raise exception 'Valid worker and assignment dates required';
  end if;
  range_days:=(p_end-p_start)+1;
  if range_days>3660 then raise exception 'Assignment date range is too large';end if;

  select * into pref from public.worker_availability_preferences where user_id=p_user;
  if found then max_projects:=pref.max_active_projects;max_days:=pref.max_days_per_week;end if;

  select count(*)::integer into overlap_count
  from public.work_assignments w
  where w.user_id=p_user
    and w.status in ('offered','active')
    and (p_project is null or w.survey_project_id<>p_project)
    and (p_exclude_assignment is null or w.id<>p_exclude_assignment)
    and w.start_date<=p_end and w.end_date>=p_start;

  select count(*)::integer into rule_count
  from public.worker_availability_rules r where r.user_id=p_user;

  select count(*)::integer into unavailable_days
  from generate_series(p_start,p_end,interval '1 day') g(day)
  where exists(
    select 1 from public.worker_unavailable_periods u
    where u.user_id=p_user and g.day::date between u.starts_on and u.ends_on
  );

  if rule_count>0 then
    select count(*)::integer into available_days
    from generate_series(p_start,p_end,interval '1 day') g(day)
    join public.worker_availability_rules r
      on r.user_id=p_user
     and r.weekday=extract(isodow from g.day)::integer
     and r.is_available
    where not exists(
      select 1 from public.worker_unavailable_periods u
      where u.user_id=p_user and g.day::date between u.starts_on and u.ends_on
    );
  end if;

  proposed_concurrent:=overlap_count+1;
  capacity_pct:=least(100,ceil((proposed_concurrent::numeric/greatest(max_projects,1))*100)::integer);

  if proposed_concurrent>max_projects then
    state:='hard_conflict';
    reasons:=reasons||jsonb_build_array(format('Worker maximum parallel-project capacity is %s.',max_projects));
  end if;
  if rule_count>0 and coalesce(available_days,0)=0 then
    state:='hard_conflict';
    reasons:=reasons||jsonb_build_array('No configured available workday falls inside these assignment dates.');
  end if;
  if overlap_count>0 then
    if state='clear' then state:='warning';end if;
    reasons:=reasons||jsonb_build_array(format('%s existing commitment%s overlap these dates.',overlap_count,case when overlap_count=1 then '' else 's' end));
  end if;
  if unavailable_days>0 then
    if state='clear' then state:='warning';end if;
    reasons:=reasons||jsonb_build_array(format('%s date%s in this range %s marked unavailable.',unavailable_days,case when unavailable_days=1 then '' else 's' end,case when unavailable_days=1 then 'is' else 'are' end));
  end if;
  if rule_count=0 then
    if state='clear' then state:='warning';end if;
    reasons:=reasons||jsonb_build_array('Structured weekly availability is not configured; confirm dates with the Field Worker.');
  end if;

  return jsonb_build_object(
    'status',state,
    'headline',case state when 'hard_conflict' then 'Assignment conflicts with the worker schedule' when 'warning' then 'Review worker availability before offering' else 'No scheduling conflict detected' end,
    'reasons',reasons,
    'schedule_configured',rule_count>0,
    'overlapping_commitments',overlap_count,
    'unavailable_days',unavailable_days,
    'estimated_available_days',available_days,
    'range_days',range_days,
    'max_active_projects',max_projects,
    'max_days_per_week',max_days,
    'proposed_concurrent_projects',proposed_concurrent,
    'capacity_pct',capacity_pct
  );
end;
$$;

create or replace function public.worker_availability_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  pref public.worker_availability_preferences;
  rules jsonb;
  periods jsonb;
  commitments integer;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  select * into pref from public.worker_availability_preferences where user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(r) order by r.weekday),'[]'::jsonb) into rules
  from public.worker_availability_rules r where r.user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(u) order by u.starts_on,u.id),'[]'::jsonb) into periods
  from public.worker_unavailable_periods u where u.user_id=auth.uid() and u.ends_on>=current_date-30;
  select count(*)::integer into commitments from public.work_assignments
  where user_id=auth.uid() and status in ('offered','active') and end_date>=current_date;
  return jsonb_build_object(
    'preferences',jsonb_build_object(
      'timezone',coalesce(pref.timezone,'Asia/Karachi'),
      'max_active_projects',coalesce(pref.max_active_projects,2),
      'max_days_per_week',coalesce(pref.max_days_per_week,5),
      'preferred_shift',coalesce(pref.preferred_shift,'flexible'),
      'travel_willingness',coalesce(pref.travel_willingness,'local'),
      'configured',pref.user_id is not null
    ),
    'rules',rules,
    'unavailable_periods',periods,
    'current_commitments',commitments,
    'capacity_pct',least(100,ceil((commitments::numeric/greatest(coalesce(pref.max_active_projects,2),1))*100)::integer)
  );
end;
$$;

create or replace function public.save_worker_availability(
  p_timezone text,
  p_max_active_projects integer,
  p_max_days_per_week integer,
  p_preferred_shift text,
  p_travel_willingness text,
  p_rules jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;wd integer;available boolean;start_value text;end_value text;seen integer[]:='{}';
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  if p_timezone is null or length(trim(p_timezone)) not between 3 and 100 then raise exception 'Valid timezone required';end if;
  if p_max_active_projects is null or p_max_active_projects not between 1 and 10 then raise exception 'Maximum active projects must be between 1 and 10';end if;
  if p_max_days_per_week is null or p_max_days_per_week not between 1 and 7 then raise exception 'Maximum workdays must be between 1 and 7';end if;
  if p_preferred_shift not in ('morning','afternoon','evening','flexible') then raise exception 'Valid preferred shift required';end if;
  if p_travel_willingness not in ('none','local','district','province','national') then raise exception 'Valid travel willingness required';end if;
  if p_rules is null or jsonb_typeof(p_rules)<>'array' or jsonb_array_length(p_rules)>7 then raise exception 'Weekly availability must be an array of up to seven weekdays';end if;

  insert into public.worker_availability_preferences(user_id,timezone,max_active_projects,max_days_per_week,preferred_shift,travel_willingness,updated_at)
  values(auth.uid(),trim(p_timezone),p_max_active_projects,p_max_days_per_week,p_preferred_shift,p_travel_willingness,now())
  on conflict(user_id) do update set timezone=excluded.timezone,max_active_projects=excluded.max_active_projects,max_days_per_week=excluded.max_days_per_week,preferred_shift=excluded.preferred_shift,travel_willingness=excluded.travel_willingness,updated_at=now();

  delete from public.worker_availability_rules where user_id=auth.uid();
  for item in select value from jsonb_array_elements(p_rules) loop
    wd:=(item->>'weekday')::integer;
    if wd is null or wd not between 1 and 7 or wd=any(seen) then raise exception 'Each weekday may appear once';end if;
    seen:=array_append(seen,wd);
    available:=coalesce((item->>'is_available')::boolean,false);
    if available then
      start_value:=item->>'start_time';
      end_value:=item->>'end_time';
      if start_value is null or end_value is null or start_value!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or end_value!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or start_value::time>=end_value::time then raise exception 'Available weekdays require valid start and end times';end if;
    else start_value:=null;end_value:=null;end if;
    insert into public.worker_availability_rules(user_id,weekday,is_available,start_time,end_time)
    values(auth.uid(),wd,available,start_value,end_value);
  end loop;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'worker_availability_updated',jsonb_build_object('max_active_projects',p_max_active_projects,'max_days_per_week',p_max_days_per_week,'preferred_shift',p_preferred_shift,'travel_willingness',p_travel_willingness));
  return public.worker_availability_profile();
end;
$$;

create or replace function public.add_worker_unavailable_period(p_start date,p_end date,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Unavailable period must be a valid range of up to 366 days';end if;
  if p_reason is null or length(trim(p_reason)) not between 2 and 500 then raise exception 'Unavailable reason required';end if;
  insert into public.worker_unavailable_periods(user_id,starts_on,ends_on,reason)
  values(auth.uid(),p_start,p_end,trim(p_reason)) returning id into result;
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'worker_unavailable_period_added',jsonb_build_object('id',result,'start',p_start,'end',p_end));
  return result;
end;
$$;

create or replace function public.remove_worker_unavailable_period(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare removed public.worker_unavailable_periods;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  delete from public.worker_unavailable_periods where id=p_id and user_id=auth.uid() returning * into removed;
  if not found then raise exception 'Unavailable period not found';end if;
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'worker_unavailable_period_removed',jsonb_build_object('id',p_id,'start',removed.starts_on,'end',removed.ends_on));
end;
$$;

create or replace function public.worker_schedule(p_from date default current_date,p_days integer default 35)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare assignments jsonb;periods jsonb;profile jsonb;until_date date;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  if p_from is null or p_days is null or p_days not between 1 and 180 then raise exception 'Schedule window must be between 1 and 180 days';end if;
  until_date:=p_from+(p_days-1);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.start_date,x.project_title,x.id),'[]'::jsonb) into assignments from (
    select id,survey_project_id,organization_id,project_title,organization_name,status,start_date,end_date,target_surveys,work_mode,compensation_type,currency,rate
    from public.work_assignments
    where user_id=auth.uid() and status in ('offered','active') and start_date<=until_date and end_date>=p_from
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_on,x.id),'[]'::jsonb) into periods from (
    select id,starts_on,ends_on,reason from public.worker_unavailable_periods
    where user_id=auth.uid() and starts_on<=until_date and ends_on>=p_from
  ) x;
  profile:=public.worker_availability_profile();
  return jsonb_build_object('from',p_from,'to',until_date,'assignments',assignments,'unavailable_periods',periods,'availability',profile);
end;
$$;

create or replace function public.check_work_assignment_conflicts(
  p_project uuid,p_user uuid,p_start date,p_end date,p_target_surveys integer default 1
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.survey_projects;result jsonb;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  select * into p from public.survey_projects where id=p_project;
  if not found then raise exception 'Project not found';end if;
  if auth.uid()<>p_user and not app_private.can_review_survey(p_project) then raise exception 'Project workforce management permission required';end if;
  if auth.uid()<>p_user and not app_private.can_manage_surveys() and not (
    exists(select 1 from public.work_applications a where a.survey_project_id=p_project and a.user_id=p_user and a.organization_id=p.organization_id and a.status='selected')
    or exists(select 1 from public.work_invitations i join public.work_opportunities o on o.id=i.opportunity_id where i.user_id=p_user and i.organization_id=p.organization_id and i.status='accepted' and o.survey_project_id=p_project)
    or exists(select 1 from public.volunteer_shortlists s where s.organization_id=p.organization_id and s.user_id=p_user and s.status='selected' and app_private.ngo_profile_access(p.organization_id,p_user))
    or exists(select 1 from public.work_assignments w where w.survey_project_id=p_project and w.user_id=p_user)
  ) then raise exception 'Selected project candidate required for scheduling check';end if;
  if not exists(select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.id=p_user and a.status='active' and v.status='verified') then raise exception 'Published active Field Worker required';end if;
  if p_target_surveys is null or p_target_surveys not between 1 and 1000000 then raise exception 'Valid survey target required';end if;
  if p_start is null or p_end is null or p_end<p_start or p_start<p.start_date or p_end>p.end_date then raise exception 'Assignment dates must fit the project';end if;
  result:=app_private.worker_assignment_conflict_summary(p_user,p_start,p_end,p_project,null);
  return result||jsonb_build_object('target_surveys',p_target_surveys);
end;
$$;

create or replace function app_private.guard_work_assignment_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare summary jsonb;
begin
  if new.status not in ('offered','active') then return new;end if;
  summary:=app_private.worker_assignment_conflict_summary(new.user_id,new.start_date,new.end_date,new.survey_project_id,case when tg_op='UPDATE' then new.id else null end);
  if summary->>'status'='hard_conflict' then
    raise exception '%',coalesce(summary->>'headline','Worker schedule has a hard conflict');
  end if;
  return new;
end;
$$;

create trigger guard_work_assignment_capacity
before insert or update of user_id,start_date,end_date,status,survey_project_id on public.work_assignments
for each row execute function app_private.guard_work_assignment_capacity();

revoke all on function app_private.worker_assignment_conflict_summary(uuid,date,date,uuid,uuid),app_private.guard_work_assignment_capacity() from public,anon,authenticated;
revoke all on function public.worker_availability_profile(),public.save_worker_availability(text,integer,integer,text,text,jsonb),public.add_worker_unavailable_period(date,date,text),public.remove_worker_unavailable_period(uuid),public.worker_schedule(date,integer),public.check_work_assignment_conflicts(uuid,uuid,date,date,integer) from public,anon,authenticated;
grant execute on function public.worker_availability_profile(),public.save_worker_availability(text,integer,integer,text,text,jsonb),public.add_worker_unavailable_period(date,date,text),public.remove_worker_unavailable_period(uuid),public.worker_schedule(date,integer),public.check_work_assignment_conflicts(uuid,uuid,date,date,integer) to authenticated;
