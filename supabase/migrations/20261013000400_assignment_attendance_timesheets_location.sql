-- FieldLance 2.38.0 — Assignment Attendance, Work Sessions, Timesheets,
-- Explicit Location Evidence & Daily-Payable Integration
--
-- Attendance is explicit and assignment-bound. FieldLance does not perform continuous/background
-- tracking. Raw capture timestamps and location evidence remain immutable; reviewer time corrections
-- are stored separately and only affect effective times before approval. Approved daily-rate
-- attendance creates/reuses the existing work-payable day unit; the payable ledger remains the
-- financial source of truth.

create function app_private.valid_iana_timezone(p_timezone text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_timezone is not null and exists(
    select 1 from pg_catalog.pg_timezone_names z where z.name=trim(p_timezone)
  );
$$;

create function app_private.validate_worker_availability_timezone()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not app_private.valid_iana_timezone(new.timezone) then
    raise exception 'Valid IANA timezone required';
  end if;
  return new;
end;
$$;

create trigger validate_worker_availability_timezone
before insert or update of timezone on public.worker_availability_preferences
for each row execute function app_private.validate_worker_availability_timezone();

create table public.project_attendance_policies (
  project_id uuid primary key references public.survey_projects(id) on delete cascade,
  timezone text not null default 'Asia/Karachi' check(length(timezone) between 3 and 100),
  location_policy text not null default 'preferred' check(location_policy in ('required','preferred','not_required')),
  max_accuracy_m numeric(8,2) not null default 250 check(max_accuracy_m between 5 and 5000),
  updated_by uuid references public.accounts(id),
  updated_at timestamptz not null default now()
);

insert into public.project_attendance_policies(project_id,timezone,location_policy,max_accuracy_m)
select id,'Asia/Karachi','preferred',250 from public.survey_projects
on conflict(project_id) do nothing;

create function app_private.seed_project_attendance_policy()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.project_attendance_policies(project_id,timezone,location_policy,max_accuracy_m)
  values(new.id,'Asia/Karachi','preferred',250)
  on conflict(project_id) do nothing;
  return new;
end;
$$;
create trigger seed_project_attendance_policy
after insert on public.survey_projects for each row execute function app_private.seed_project_attendance_policy();

create table public.assignment_work_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.work_assignments(id),
  project_id uuid not null references public.survey_projects(id),
  organization_id uuid not null references public.organizations(id),
  worker_id uuid not null references public.accounts(id),
  work_date date not null,
  timezone text not null check(length(timezone) between 3 and 100),
  location_policy_snapshot text not null check(location_policy_snapshot in ('required','preferred','not_required')),
  max_accuracy_m_snapshot numeric(8,2) not null check(max_accuracy_m_snapshot between 5 and 5000),
  check_in_captured_at timestamptz not null,
  check_in_received_at timestamptz not null default now(),
  check_out_captured_at timestamptz,
  check_out_received_at timestamptz,
  effective_check_in_at timestamptz not null,
  effective_check_out_at timestamptz,
  status text not null default 'open' check(status in ('open','submitted','approved','correction_required','rejected','voided')),
  worker_note text not null default '' check(length(worker_note)<=2000),
  submitted_at timestamptz,
  reviewed_by uuid references public.accounts(id),
  reviewed_at timestamptz,
  review_note text not null default '' check(length(review_note)<=2000),
  payable_unit_id uuid references public.work_payable_units(id),
  start_request_id uuid not null unique,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assignment_id,work_date),
  check(check_out_captured_at is null or check_out_captured_at>=check_in_captured_at),
  check(effective_check_out_at is null or effective_check_out_at>=effective_check_in_at)
);

create unique index assignment_work_session_one_open_per_worker
  on public.assignment_work_sessions(worker_id) where status='open';
create index assignment_work_sessions_project_status
  on public.assignment_work_sessions(project_id,status,work_date desc,id);
create index assignment_work_sessions_worker_date
  on public.assignment_work_sessions(worker_id,work_date desc,id);

create table public.assignment_session_locations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assignment_work_sessions(id) on delete cascade,
  event_type text not null check(event_type in ('check_in','check_out')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_m numeric(10,2),
  permission_state text not null check(permission_state in ('granted','denied','unavailable','not_requested')),
  quality text not null check(quality in ('acceptable','poor','missing','not_required')),
  note text not null default '' check(length(note)<=500),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  request_id uuid not null unique,
  unique(session_id,event_type),
  check(latitude is null or latitude between -90 and 90),
  check(longitude is null or longitude between -180 and 180),
  check(accuracy_m is null or accuracy_m between 0 and 100000),
  check((permission_state='granted' and latitude is not null and longitude is not null and accuracy_m is not null) or permission_state<>'granted')
);

create table public.attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assignment_work_sessions(id) on delete cascade,
  previous_check_in_at timestamptz not null,
  previous_check_out_at timestamptz,
  effective_check_in_at timestamptz not null,
  effective_check_out_at timestamptz,
  reason text not null check(length(reason) between 5 and 2000),
  actor_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now()
);
create index attendance_adjustments_session on public.attendance_adjustments(session_id,created_at,id);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assignment_work_sessions(id) on delete cascade,
  event_type text not null check(event_type in ('session_started','session_checked_out','submitted','correction_requested','resubmitted','approved','rejected','time_adjusted','voided','payable_linked')),
  actor_id uuid references public.accounts(id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index attendance_events_session on public.attendance_events(session_id,created_at,id);

create function app_private.can_manage_attendance_project(p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and exists(
    select 1 from public.survey_projects p
    where p.id=p_project and (
      app_private.ngo_admin(p.organization_id)
      or app_private.project_staff_active(p_project,'project_manager')
    )
  );
$$;

create function app_private.can_read_attendance_assignment(p_assignment uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and exists(
    select 1 from public.work_assignments w
    where w.id=p_assignment
      and (w.user_id=auth.uid() or app_private.can_manage_project(w.survey_project_id))
  );
$$;

create function app_private.can_read_attendance_project(p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and (
    app_private.can_manage_project(p_project)
    or exists(
      select 1 from public.work_assignments w
      where w.survey_project_id=p_project and w.user_id=auth.uid() and w.status in ('active','completed','cancelled')
    )
  );
$$;

alter table public.project_attendance_policies enable row level security;
alter table public.assignment_work_sessions enable row level security;
alter table public.assignment_session_locations enable row level security;
alter table public.attendance_adjustments enable row level security;
alter table public.attendance_events enable row level security;

create policy project_attendance_policy_read on public.project_attendance_policies
for select to authenticated using(app_private.can_read_attendance_project(project_id));
create policy assignment_work_session_read on public.assignment_work_sessions
for select to authenticated using(app_private.can_read_attendance_assignment(assignment_id));
create policy assignment_session_location_read on public.assignment_session_locations
for select to authenticated using(exists(
  select 1 from public.assignment_work_sessions s where s.id=session_id and app_private.can_read_attendance_assignment(s.assignment_id)
));
create policy attendance_adjustment_read on public.attendance_adjustments
for select to authenticated using(exists(
  select 1 from public.assignment_work_sessions s where s.id=session_id and app_private.can_read_attendance_assignment(s.assignment_id)
));
create policy attendance_event_read on public.attendance_events
for select to authenticated using(exists(
  select 1 from public.assignment_work_sessions s where s.id=session_id and app_private.can_read_attendance_assignment(s.assignment_id)
));

revoke all on public.project_attendance_policies,public.assignment_work_sessions,public.assignment_session_locations,public.attendance_adjustments,public.attendance_events from public,anon,authenticated;
grant select on public.project_attendance_policies,public.assignment_work_sessions,public.assignment_session_locations,public.attendance_adjustments,public.attendance_events to authenticated;

create function app_private.attendance_location_quality(
  p_policy text,p_accuracy numeric,p_permission text,p_max_accuracy numeric
) returns text language sql immutable set search_path='' as $$
  select case
    when p_policy='not_required' and p_permission<>'granted' then 'not_required'
    when p_permission<>'granted' then 'missing'
    when p_accuracy is null then 'missing'
    when p_accuracy<=p_max_accuracy then 'acceptable'
    else 'poor'
  end;
$$;

create function public.project_attendance_policy(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.project_attendance_policies;
begin
  if not app_private.can_read_attendance_project(p_project) then raise exception 'Project attendance access required';end if;
  select * into p from public.project_attendance_policies where project_id=p_project;
  if not found then raise exception 'Project attendance policy missing';end if;
  return jsonb_build_object(
    'project_id',p.project_id,'timezone',p.timezone,'location_policy',p.location_policy,
    'max_accuracy_m',p.max_accuracy_m,'updated_at',p.updated_at,
    'can_manage',app_private.can_manage_attendance_project(p_project)
  );
end;
$$;

create function public.set_project_attendance_policy(
  p_project uuid,p_timezone text,p_location_policy text,p_max_accuracy_m numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;
begin
  if not app_private.can_manage_attendance_project(p_project) then raise exception 'Organization Admin or Project Manager attendance permission required';end if;
  select * into p from public.survey_projects where id=p_project for update;
  if not found then raise exception 'Project not found';end if;
  if not app_private.valid_iana_timezone(p_timezone) then raise exception 'Valid IANA timezone required';end if;
  if p_location_policy not in ('required','preferred','not_required') then raise exception 'Valid location policy required';end if;
  if p_max_accuracy_m is null or p_max_accuracy_m not between 5 and 5000 then raise exception 'Accuracy threshold must be between 5 and 5000 metres';end if;
  insert into public.project_attendance_policies(project_id,timezone,location_policy,max_accuracy_m,updated_by,updated_at)
  values(p_project,trim(p_timezone),p_location_policy,p_max_accuracy_m,auth.uid(),now())
  on conflict(project_id) do update set timezone=excluded.timezone,location_policy=excluded.location_policy,max_accuracy_m=excluded.max_accuracy_m,updated_by=auth.uid(),updated_at=now();
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'project_attendance_policy_updated',jsonb_build_object('project',p.id,'timezone',trim(p_timezone),'location_policy',p_location_policy,'max_accuracy_m',p_max_accuracy_m));
  return public.project_attendance_policy(p_project);
end;
$$;

create function app_private.attendance_insert_location(
  p_session uuid,p_event text,p_lat numeric,p_lng numeric,p_accuracy numeric,p_permission text,p_note text,p_captured timestamptz,p_request uuid,p_policy text,p_max_accuracy numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;quality text;note_value text:=trim(coalesce(p_note,''));
begin
  if p_request is null then raise exception 'Location request ID required';end if;
  if p_permission not in ('granted','denied','unavailable','not_requested') then raise exception 'Valid location permission state required';end if;
  if p_permission='granted' then
    if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 100000 then raise exception 'Valid location coordinates and accuracy required';end if;
  elsif p_lat is not null or p_lng is not null or p_accuracy is not null then
    raise exception 'Coordinates require granted location permission';
  end if;
  if p_policy='required' and p_permission<>'granted' then raise exception 'Location permission is required by this project';end if;
  if p_policy='preferred' and p_permission<>'granted' and length(note_value) not between 2 and 500 then raise exception 'Explain why preferred location evidence is unavailable';end if;
  if length(note_value)>500 then raise exception 'Location note is too long';end if;
  quality:=app_private.attendance_location_quality(p_policy,p_accuracy,p_permission,p_max_accuracy);
  insert into public.assignment_session_locations(session_id,event_type,latitude,longitude,accuracy_m,permission_state,quality,note,captured_at,request_id)
  values(p_session,p_event,p_lat,p_lng,p_accuracy,p_permission,quality,note_value,p_captured,p_request)
  returning id into result;
  return result;
end;
$$;

create function public.start_assignment_work_session(
  p_assignment uuid,p_captured_at timestamptz,p_latitude numeric,p_longitude numeric,p_accuracy_m numeric,
  p_permission_state text,p_location_note text,p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.work_assignments;p public.survey_projects;policy public.project_attendance_policies;s public.assignment_work_sessions;workday date;max_days integer:=7;used_days integer:=0;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  select * into s from public.assignment_work_sessions where start_request_id=p_request;
  if found then
    if s.worker_id<>auth.uid() or s.assignment_id<>p_assignment then raise exception 'Request ID reused with different attendance details';end if;
    return jsonb_build_object('id',s.id,'status',s.status,'work_date',s.work_date,'timezone',s.timezone,'version',s.version,'offline_delay_seconds',greatest(0,extract(epoch from s.check_in_received_at-s.check_in_captured_at)::integer));
  end if;
  select * into w from public.work_assignments where id=p_assignment for update;
  if not found or w.user_id<>auth.uid() then raise exception 'Own assignment required';end if;
  if w.status<>'active' or w.responded_at is null then raise exception 'Active accepted assignment required';end if;
  select * into p from public.survey_projects where id=w.survey_project_id;
  if not found or p.status<>'active' or p.moderation_status<>'allowed' then raise exception 'Active allowed project required for new attendance';end if;
  select * into policy from public.project_attendance_policies where project_id=w.survey_project_id;
  if not found then raise exception 'Project attendance policy missing';end if;
  if not app_private.valid_iana_timezone(policy.timezone) then raise exception 'Project attendance timezone is invalid';end if;
  if p_captured_at is null or p_captured_at>now()+interval '5 minutes' or p_captured_at<now()-interval '72 hours' then raise exception 'Check-in capture time must be within the allowed offline window';end if;
  workday:=(p_captured_at at time zone policy.timezone)::date;
  if workday not between w.start_date and w.end_date or p_captured_at<w.responded_at then raise exception 'Check-in must fall within the accepted assignment dates';end if;
  if w.cancelled_at is not null and p_captured_at>w.cancelled_at then raise exception 'Cancelled assignment cannot start a new work session';end if;
  select coalesce(max(max_days_per_week),7) into max_days from public.worker_availability_preferences where user_id=w.user_id;
  select count(distinct work_date)::integer into used_days
  from public.assignment_work_sessions
  where worker_id=w.user_id
    and status not in ('rejected','voided')
    and date_trunc('week',work_date::timestamp)=date_trunc('week',workday::timestamp)
    and work_date<>workday;
  if used_days>=max_days then raise exception 'Weekly availability limit reached';end if;
  if exists(select 1 from public.assignment_work_sessions where worker_id=w.user_id and status='open') then raise exception 'End the current field session before starting another';end if;
  if exists(select 1 from public.assignment_work_sessions where assignment_id=w.id and work_date=workday) then raise exception 'Attendance already exists for this assignment workday';end if;

  insert into public.assignment_work_sessions(
    assignment_id,project_id,organization_id,worker_id,work_date,timezone,location_policy_snapshot,max_accuracy_m_snapshot,
    check_in_captured_at,effective_check_in_at,start_request_id
  ) values(
    w.id,w.survey_project_id,w.organization_id,w.user_id,workday,policy.timezone,policy.location_policy,policy.max_accuracy_m,
    p_captured_at,p_captured_at,p_request
  ) returning * into s;

  perform app_private.attendance_insert_location(s.id,'check_in',p_latitude,p_longitude,p_accuracy_m,p_permission_state,p_location_note,p_captured_at,p_request,policy.location_policy,policy.max_accuracy_m);
  insert into public.attendance_events(session_id,event_type,actor_id,detail)
  values(s.id,'session_started',auth.uid(),jsonb_build_object('captured_at',p_captured_at,'received_at',s.check_in_received_at,'work_date',workday,'location_policy',policy.location_policy));
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),auth.uid(),w.organization_id,'attendance_session_started',jsonb_build_object('session',s.id,'assignment',w.id,'project',w.survey_project_id,'work_date',workday));
  return jsonb_build_object('id',s.id,'status',s.status,'work_date',s.work_date,'timezone',s.timezone,'version',s.version,'offline_delay_seconds',greatest(0,extract(epoch from s.check_in_received_at-s.check_in_captured_at)::integer));
end;
$$;

create function public.checkout_assignment_work_session(
  p_session uuid,p_captured_at timestamptz,p_latitude numeric,p_longitude numeric,p_accuracy_m numeric,
  p_permission_state text,p_location_note text,p_worker_note text,p_request uuid,p_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.assignment_work_sessions;w public.work_assignments;loc public.assignment_session_locations;note_value text:=trim(coalesce(p_worker_note,''));
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  select * into loc from public.assignment_session_locations where request_id=p_request;
  if found then
    select * into s from public.assignment_work_sessions where id=loc.session_id;
    if s.id<>p_session or s.worker_id<>auth.uid() or loc.event_type<>'check_out' then raise exception 'Request ID reused with different attendance details';end if;
    return jsonb_build_object('id',s.id,'status',s.status,'work_date',s.work_date,'version',s.version);
  end if;
  select * into s from public.assignment_work_sessions where id=p_session for update;
  if not found or s.worker_id<>auth.uid() then raise exception 'Own attendance session required';end if;
  if s.version is distinct from p_version then raise exception 'Attendance changed; reload before checkout';end if;
  if s.status<>'open' or s.check_out_captured_at is not null then raise exception 'Open attendance session required';end if;
  if p_captured_at is null or p_captured_at<s.check_in_captured_at or p_captured_at>s.check_in_captured_at+interval '36 hours' or p_captured_at>now()+interval '5 minutes' or p_captured_at<now()-interval '72 hours' then raise exception 'Valid checkout capture time required';end if;
  if length(note_value) not between 2 and 2000 then raise exception 'Workday note required';end if;
  select * into w from public.work_assignments where id=s.assignment_id;

  perform app_private.attendance_insert_location(s.id,'check_out',p_latitude,p_longitude,p_accuracy_m,p_permission_state,p_location_note,p_captured_at,p_request,s.location_policy_snapshot,s.max_accuracy_m_snapshot);
  update public.assignment_work_sessions
  set check_out_captured_at=p_captured_at,check_out_received_at=now(),effective_check_out_at=p_captured_at,
      worker_note=note_value,status='submitted',submitted_at=now(),updated_at=now(),version=version+1
  where id=s.id returning * into s;
  insert into public.attendance_events(session_id,event_type,actor_id,detail)
  values(s.id,'session_checked_out',auth.uid(),jsonb_build_object('captured_at',p_captured_at,'received_at',s.check_out_received_at));
  insert into public.attendance_events(session_id,event_type,actor_id,detail)
  values(s.id,'submitted',auth.uid(),jsonb_build_object('worker_note',note_value));
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),auth.uid(),w.organization_id,'attendance_submitted',jsonb_build_object('session',s.id,'assignment',w.id,'work_date',s.work_date));
  return jsonb_build_object('id',s.id,'status',s.status,'work_date',s.work_date,'version',s.version);
end;
$$;

create function public.resubmit_attendance_session(p_session uuid,p_worker_note text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.assignment_work_sessions;note_value text:=trim(coalesce(p_worker_note,''));
begin
  select * into s from public.assignment_work_sessions where id=p_session for update;
  if not found or s.worker_id<>auth.uid() or not app_private.is_active() then raise exception 'Own attendance session required';end if;
  if s.version is distinct from p_version then raise exception 'Attendance changed; reload';end if;
  if s.status<>'correction_required' or s.check_out_captured_at is null then raise exception 'Correction-requested checked-out session required';end if;
  if length(note_value) not between 2 and 2000 then raise exception 'Updated workday note required';end if;
  update public.assignment_work_sessions set worker_note=note_value,status='submitted',submitted_at=now(),reviewed_by=null,reviewed_at=null,review_note='',updated_at=now(),version=version+1 where id=s.id returning * into s;
  insert into public.attendance_events(session_id,event_type,actor_id,detail) values(s.id,'resubmitted',auth.uid(),jsonb_build_object('worker_note',note_value));
  return jsonb_build_object('id',s.id,'status',s.status,'version',s.version);
end;
$$;

create function public.adjust_attendance_times(
  p_session uuid,p_check_in timestamptz,p_check_out timestamptz,p_reason text,p_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.assignment_work_sessions;w public.work_assignments;reason_value text:=trim(coalesce(p_reason,''));workday date;
begin
  select * into s from public.assignment_work_sessions where id=p_session for update;
  if not found or not app_private.can_manage_attendance_project(s.project_id) then raise exception 'Organization Admin or Project Manager attendance permission required';end if;
  if s.version is distinct from p_version then raise exception 'Attendance changed; reload';end if;
  if s.status not in ('submitted','correction_required') then raise exception 'Only unapproved submitted attendance can be adjusted';end if;
  if p_check_in is null or p_check_out is null or p_check_out<p_check_in or p_check_out>p_check_in+interval '36 hours' then raise exception 'Valid effective check-in and checkout required';end if;
  workday:=(p_check_in at time zone s.timezone)::date;
  if workday<>s.work_date then raise exception 'Effective check-in must remain on the recorded work date';end if;
  select * into w from public.work_assignments where id=s.assignment_id;
  if workday not between w.start_date and w.end_date then raise exception 'Effective attendance must stay within assignment dates';end if;
  if length(reason_value) not between 5 and 2000 then raise exception 'Adjustment reason required';end if;
  insert into public.attendance_adjustments(session_id,previous_check_in_at,previous_check_out_at,effective_check_in_at,effective_check_out_at,reason,actor_id)
  values(s.id,s.effective_check_in_at,s.effective_check_out_at,p_check_in,p_check_out,reason_value,auth.uid());
  update public.assignment_work_sessions set effective_check_in_at=p_check_in,effective_check_out_at=p_check_out,updated_at=now(),version=version+1 where id=s.id returning * into s;
  insert into public.attendance_events(session_id,event_type,actor_id,detail) values(s.id,'time_adjusted',auth.uid(),jsonb_build_object('reason',reason_value,'effective_check_in_at',p_check_in,'effective_check_out_at',p_check_out));
  return jsonb_build_object('id',s.id,'status',s.status,'version',s.version);
end;
$$;

-- Daily-rate work is now attendance-backed. Fixed completion remains unchanged and approved survey
-- units continue to be generated by the existing survey-payable reconciliation path.
create or replace function public.claim_work_payable(p_assignment uuid,p_day date,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.work_assignments;u uuid;k text;s public.assignment_work_sessions;
begin
  select * into w from public.work_assignments where id=p_assignment for update;
  if not found or not app_private.is_active() or not (auth.uid()=w.user_id or app_private.ngo_admin(w.organization_id)) then raise exception 'Assignment access required';end if;
  if not exists(select 1 from public.organizations where id=w.organization_id and status='active') then raise exception 'Active organization required';end if;
  if w.work_mode<>'paid' or w.responded_at is null or w.status not in ('active','completed','cancelled') then raise exception 'Accepted paid assignment required';end if;
  if p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Work evidence note required (5–2000 characters)';end if;
  k:=case w.compensation_type when 'daily_rate' then 'day' when 'fixed_assignment' then 'fixed' else null end;
  if k is null then raise exception 'Surveys generate units from approval';end if;
  if k='fixed' and (w.status<>'completed' or w.completed_at is null or p_day is distinct from least((w.completed_at at time zone 'UTC')::date,w.end_date)) then raise exception 'Completed assignment required for fixed payment';end if;
  if p_day is null or p_day not between w.start_date and w.end_date or p_day>(now() at time zone 'UTC')::date or p_day<(w.responded_at at time zone 'UTC')::date or (w.cancelled_at is not null and p_day>(w.cancelled_at at time zone 'UTC')::date) then raise exception 'Eligible work date required';end if;
  if k='day' then
    select * into s from public.assignment_work_sessions where assignment_id=w.id and work_date=p_day and status='approved';
    if not found then raise exception 'Approved attendance required for daily-rate payable';end if;
  end if;
  select id into u from public.work_payable_units where assignment_id=w.id and source_kind=k and (k='fixed' or work_date=p_day);
  if u is null then
    insert into public.work_payable_units(assignment_id,source_kind,work_date,rate,currency,terms_snapshot,note,created_by)
    values(w.id,k,p_day,(app_private.payable_effective_terms(w,p_day)->>'rate')::numeric,w.currency,app_private.payable_effective_terms(w,p_day),trim(p_note),auth.uid()) returning id into u;
    insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
    values(auth.uid(),w.user_id,w.organization_id,'work_payable_claimed',jsonb_build_object('unit',u,'kind',k,'day',p_day));
  end if;
  if k='day' and s.payable_unit_id is distinct from u then
    update public.assignment_work_sessions set payable_unit_id=u,updated_at=now() where id=s.id;
    insert into public.attendance_events(session_id,event_type,actor_id,detail) values(s.id,'payable_linked',auth.uid(),jsonb_build_object('unit',u));
  end if;
  return u;
end;
$$;

create function app_private.ensure_attendance_daily_payable(p_session uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.assignment_work_sessions;w public.work_assignments;u uuid;
begin
  select * into s from public.assignment_work_sessions where id=p_session for update;
  if not found or s.status<>'approved' then raise exception 'Approved attendance required';end if;
  select * into w from public.work_assignments where id=s.assignment_id;
  if w.work_mode<>'paid' or w.compensation_type<>'daily_rate' then return null;end if;
  select id into u from public.work_payable_units where assignment_id=w.id and source_kind='day' and work_date=s.work_date;
  if u is null then
    insert into public.work_payable_units(assignment_id,source_kind,work_date,rate,currency,terms_snapshot,note,created_by)
    values(w.id,'day',s.work_date,(app_private.payable_effective_terms(w,s.work_date)->>'rate')::numeric,w.currency,app_private.payable_effective_terms(w,s.work_date),'Approved attendance session '||s.id::text,auth.uid()) returning id into u;
    insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
    values(auth.uid(),w.user_id,w.organization_id,'work_payable_claimed',jsonb_build_object('unit',u,'kind','day','day',s.work_date,'attendance_session',s.id));
  end if;
  if s.payable_unit_id is distinct from u then
    update public.assignment_work_sessions set payable_unit_id=u,updated_at=now() where id=s.id;
    insert into public.attendance_events(session_id,event_type,actor_id,detail) values(s.id,'payable_linked',auth.uid(),jsonb_build_object('unit',u));
  end if;
  return u;
end;
$$;

create function public.review_attendance_session(
  p_session uuid,p_action text,p_note text,p_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.assignment_work_sessions;w public.work_assignments;note_value text:=trim(coalesce(p_note,''));unit_id uuid;event_name text;
begin
  select * into s from public.assignment_work_sessions where id=p_session for update;
  if not found or not app_private.can_manage_attendance_project(s.project_id) then raise exception 'Organization Admin or Project Manager attendance permission required';end if;
  if s.worker_id=auth.uid() then raise exception 'Independent reviewer required';end if;
  if s.version is distinct from p_version then raise exception 'Attendance changed; reload';end if;
  if s.status<>'submitted' then raise exception 'Submitted attendance required';end if;
  if p_action not in ('approve','correction_required','reject') then raise exception 'Valid attendance review action required';end if;
  if p_action<>'approve' and length(note_value) not between 5 and 2000 then raise exception 'Review reason required';end if;
  if length(note_value)>2000 then raise exception 'Review note is too long';end if;
  select * into w from public.work_assignments where id=s.assignment_id;
  update public.assignment_work_sessions
  set status=case p_action when 'approve' then 'approved' when 'correction_required' then 'correction_required' else 'rejected' end,
      reviewed_by=auth.uid(),reviewed_at=now(),review_note=note_value,updated_at=now(),version=version+1
  where id=s.id returning * into s;
  event_name:=case p_action when 'approve' then 'approved' when 'correction_required' then 'correction_requested' else 'rejected' end;
  insert into public.attendance_events(session_id,event_type,actor_id,detail) values(s.id,event_name,auth.uid(),jsonb_build_object('note',note_value));
  if p_action='approve' and w.work_mode='paid' and w.compensation_type='daily_rate' then
    unit_id:=app_private.ensure_attendance_daily_payable(s.id);
    update public.assignment_work_sessions set payable_unit_id=unit_id,updated_at=now() where id=s.id;
  end if;
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),s.worker_id,s.organization_id,'attendance_'||p_action,jsonb_build_object('session',s.id,'assignment',s.assignment_id,'work_date',s.work_date,'payable_unit',unit_id));
  insert into public.notifications(user_id,title,body)
  values(s.worker_id,'Attendance updated',case p_action when 'approve' then 'Your submitted workday was approved.' when 'correction_required' then 'Your submitted workday needs a correction. Open My attendance for details.' else 'Your submitted workday was rejected. Open My attendance for the review reason.' end);
  return jsonb_build_object('id',s.id,'status',s.status,'version',s.version,'payable_unit_id',coalesce(unit_id,s.payable_unit_id));
end;
$$;

create function public.attendance_workspace(
  p_project uuid default null,p_from date default current_date-30,p_to date default current_date,
  p_status text default null,p_page integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows_json jsonb;summary jsonb;total integer;can_manage boolean:=false;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required';end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Attendance range must be between 1 and 367 days';end if;
  if p_page is null or p_page not between 0 and 100000 then raise exception 'Valid page required';end if;
  if p_status is not null and p_status not in ('open','submitted','approved','correction_required','rejected','voided') then raise exception 'Valid attendance status required';end if;
  if p_project is not null then
    if not app_private.can_read_attendance_project(p_project) then raise exception 'Project attendance access required';end if;
    can_manage:=app_private.can_manage_attendance_project(p_project);
  end if;

  select count(*)::integer into total
  from public.assignment_work_sessions s
  where (p_project is null and s.worker_id=auth.uid() or p_project is not null and s.project_id=p_project)
    and s.work_date between p_from and p_to
    and (p_status is null or s.status=p_status);

  select jsonb_build_object(
    'open',count(*) filter(where s.status='open'),
    'submitted',count(*) filter(where s.status='submitted'),
    'approved',count(*) filter(where s.status='approved'),
    'correction_required',count(*) filter(where s.status='correction_required'),
    'rejected',count(*) filter(where s.status='rejected')
  ) into summary
  from public.assignment_work_sessions s
  where (p_project is null and s.worker_id=auth.uid() or p_project is not null and s.project_id=p_project)
    and s.work_date between p_from and p_to;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date desc,x.check_in_captured_at desc,x.id),'[]'::jsonb) into rows_json from (
    select s.id,s.assignment_id,s.project_id,s.organization_id,s.worker_id,s.work_date,s.timezone,s.location_policy_snapshot,s.max_accuracy_m_snapshot,
      s.check_in_captured_at,s.check_in_received_at,s.check_out_captured_at,s.check_out_received_at,s.effective_check_in_at,s.effective_check_out_at,
      s.status,s.worker_note,s.submitted_at,s.reviewed_by,s.reviewed_at,s.review_note,s.payable_unit_id,s.version,s.created_at,s.updated_at,
      w.volunteer_name,w.organization_name,w.project_title,w.work_mode,w.compensation_type,w.currency,w.rate,w.start_date as assignment_start_date,w.end_date as assignment_end_date,
      case when s.effective_check_out_at is null then null else greatest(0,floor(extract(epoch from (s.effective_check_out_at-s.effective_check_in_at))/60)::integer) end duration_minutes,
      ci.latitude check_in_latitude,ci.longitude check_in_longitude,ci.accuracy_m check_in_accuracy_m,ci.permission_state check_in_permission_state,ci.quality check_in_quality,ci.note check_in_location_note,
      co.latitude check_out_latitude,co.longitude check_out_longitude,co.accuracy_m check_out_accuracy_m,co.permission_state check_out_permission_state,co.quality check_out_quality,co.note check_out_location_note
    from public.assignment_work_sessions s
    join public.work_assignments w on w.id=s.assignment_id
    left join public.assignment_session_locations ci on ci.session_id=s.id and ci.event_type='check_in'
    left join public.assignment_session_locations co on co.session_id=s.id and co.event_type='check_out'
    where (p_project is null and s.worker_id=auth.uid() or p_project is not null and s.project_id=p_project)
      and s.work_date between p_from and p_to
      and (p_status is null or s.status=p_status)
    order by s.work_date desc,s.check_in_captured_at desc,s.id
    limit 50 offset p_page*50
  ) x;
  return jsonb_build_object('rows',rows_json,'count',total,'summary',coalesce(summary,'{}'::jsonb),'can_manage',can_manage,'page',p_page,'from',p_from,'to',p_to);
end;
$$;

create function public.attendance_session_history(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare events jsonb;adjustments jsonb;
begin
  if not exists(select 1 from public.assignment_work_sessions s where s.id=p_session and app_private.can_read_attendance_assignment(s.assignment_id)) then raise exception 'Attendance access required';end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'::jsonb) into events from public.attendance_events e where e.session_id=p_session;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]'::jsonb) into adjustments from public.attendance_adjustments a where a.session_id=p_session;
  return jsonb_build_object('events',events,'adjustments',adjustments);
end;
$$;

revoke all on function app_private.valid_iana_timezone(text),app_private.validate_worker_availability_timezone(),app_private.seed_project_attendance_policy(),app_private.can_manage_attendance_project(uuid),app_private.can_read_attendance_assignment(uuid),app_private.can_read_attendance_project(uuid),app_private.attendance_location_quality(text,numeric,text,numeric),app_private.attendance_insert_location(uuid,text,numeric,numeric,numeric,text,text,timestamptz,uuid,text,numeric),app_private.ensure_attendance_daily_payable(uuid) from public,anon,authenticated;
revoke all on function public.project_attendance_policy(uuid),public.set_project_attendance_policy(uuid,text,text,numeric),public.start_assignment_work_session(uuid,timestamptz,numeric,numeric,numeric,text,text,uuid),public.checkout_assignment_work_session(uuid,timestamptz,numeric,numeric,numeric,text,text,text,uuid,integer),public.resubmit_attendance_session(uuid,text,integer),public.adjust_attendance_times(uuid,timestamptz,timestamptz,text,integer),public.review_attendance_session(uuid,text,text,integer),public.attendance_workspace(uuid,date,date,text,integer),public.attendance_session_history(uuid) from public,anon,authenticated;
grant execute on function public.project_attendance_policy(uuid),public.set_project_attendance_policy(uuid,text,text,numeric),public.start_assignment_work_session(uuid,timestamptz,numeric,numeric,numeric,text,text,uuid),public.checkout_assignment_work_session(uuid,timestamptz,numeric,numeric,numeric,text,text,text,uuid,integer),public.resubmit_attendance_session(uuid,text,integer),public.adjust_attendance_times(uuid,timestamptz,timestamptz,text,integer),public.review_attendance_session(uuid,text,text,integer),public.attendance_workspace(uuid,date,date,text,integer),public.attendance_session_history(uuid) to authenticated;
