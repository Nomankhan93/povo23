-- POEM 2.19.1 — Assistance Distribution Planning
-- Converts an approved assistance request into a controlled operational plan.
-- This phase does NOT record delivery and does NOT create assistance_entries.
-- Worker payables, project finance, e-wallets and withdrawal settlement are untouched.

create table public.assistance_distribution_plans (
  id uuid primary key,
  plan_no bigint generated always as identity unique,
  request_id uuid not null references public.assistance_requests(id),
  case_id uuid not null references public.beneficiary_cases(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  person_id uuid not null references public.registry_persons(id),
  need_id uuid not null references public.beneficiary_needs(id),
  geography_id uuid not null references public.geographies(id),
  request_version integer not null check(request_version > 0),
  request_snapshot jsonb not null check(jsonb_typeof(request_snapshot)='object'),
  distribution_mode text not null check(distribution_mode in ('distribution_site','home_delivery','service_referral','field_visit','other')),
  location_label text not null check(length(location_label) between 2 and 300),
  responsible_party text not null check(length(responsible_party) between 2 and 160),
  instructions text not null check(length(instructions) between 5 and 2000),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'draft' check(status in ('draft','scheduled','ready','cancelled')),
  last_reason text not null check(length(last_reason) between 5 and 2000),
  version integer not null default 1 check(version > 0),
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  updated_at timestamptz not null default now(),
  scheduled_by uuid references public.accounts(id),
  scheduled_at timestamptz,
  ready_by uuid references public.accounts(id),
  ready_at timestamptz,
  cancelled_by uuid references public.accounts(id),
  cancelled_at timestamptz,
  cancellation_reason text,
  check(scheduled_start is null or isfinite(scheduled_start)),
  check(scheduled_end is null or isfinite(scheduled_end)),
  check(scheduled_end is null or (scheduled_start is not null and scheduled_end > scheduled_start)),
  check(
    (status='draft' and scheduled_start is null and scheduled_end is null and scheduled_by is null and scheduled_at is null and ready_by is null and ready_at is null)
    or
    (status='scheduled' and scheduled_start is not null and scheduled_by is not null and scheduled_at is not null and ready_by is null and ready_at is null)
    or
    (status='ready' and scheduled_start is not null and scheduled_by is not null and scheduled_at is not null and ready_by is not null and ready_at is not null)
    or
    (status='cancelled' and cancelled_by is not null and cancelled_at is not null and cancellation_reason is not null and length(cancellation_reason) between 5 and 2000)
  ),
  check(
    (status='cancelled')
    or (cancelled_by is null and cancelled_at is null and cancellation_reason is null)
  )
);

-- One approved request has at most one current operational plan. A cancelled plan
-- remains immutable history and permits a replacement plan if the request is still approved.
create unique index assistance_distribution_one_active_plan
  on public.assistance_distribution_plans(request_id)
  where status <> 'cancelled';
create index assistance_distribution_scope
  on public.assistance_distribution_plans(organization_id,project_id,status,scheduled_start,id);
create index assistance_distribution_case
  on public.assistance_distribution_plans(case_id,status,created_at desc,id);
create index assistance_distribution_person
  on public.assistance_distribution_plans(person_id,status,scheduled_start,id);

create table public.assistance_distribution_plan_revisions (
  plan_id uuid not null references public.assistance_distribution_plans(id),
  version integer not null,
  snapshot jsonb not null,
  reason text not null,
  actor_id uuid references public.accounts(id),
  recorded_at timestamptz not null default now(),
  primary key(plan_id,version)
);

create function app_private.capture_assistance_distribution_plan_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.assistance_distribution_plan_revisions(plan_id,version,snapshot,reason,actor_id)
  values(new.id,new.version,to_jsonb(new),new.last_reason,auth.uid());
  return new;
end;
$$;

create trigger assistance_distribution_plan_revision
  after insert or update on public.assistance_distribution_plans
  for each row execute function app_private.capture_assistance_distribution_plan_revision();

create function public.create_assistance_distribution_plan(
  p_id uuid,
  p_request uuid,
  p_mode text,
  p_location text,
  p_responsible text,
  p_instructions text,
  p_reason text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.assistance_requests;c public.beneficiary_cases;existing public.assistance_distribution_plans;
begin
  if p_id is null then raise exception 'Distribution plan ID required';end if;
  select * into r from public.assistance_requests where id=p_request;
  if not found or not app_private.can_manage_project(r.project_id) then raise exception 'Distribution planning permission required';end if;

  if p_mode is null or p_mode not in ('distribution_site','home_delivery','service_referral','field_visit','other')
    or p_location is null or length(trim(p_location)) not between 2 and 300
    or p_responsible is null or length(trim(p_responsible)) not between 2 and 160
    or p_instructions is null or length(trim(p_instructions)) not between 5 and 2000
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
  then raise exception 'Valid distribution mode, location, responsible party, instructions and reason required';end if;

  select * into existing from public.assistance_distribution_plans where id=p_id;
  if found then
    if existing.created_by=auth.uid() and existing.request_id=p_request and existing.distribution_mode=p_mode
      and existing.location_label=trim(p_location) and existing.responsible_party=trim(p_responsible)
      and existing.instructions=trim(p_instructions)
    then return existing.id;end if;
    raise exception 'Distribution plan ID already used with different details';
  end if;

  -- Request lock serializes plan creation with approved-request cancellation.
  select * into r from public.assistance_requests where id=p_request for update;
  if r.status<>'approved' then raise exception 'Only an approved assistance request can be planned';end if;
  if not exists(select 1 from public.organizations where id=r.organization_id and status='active') then raise exception 'Active NGO required for distribution planning';end if;
  select * into c from public.beneficiary_cases where id=r.case_id for update;
  if not found or c.status<>'open' then raise exception 'Beneficiary case must be open before creating a distribution plan';end if;
  if c.organization_id<>r.organization_id or c.project_id<>r.project_id or c.person_id<>r.person_id then raise exception 'Assistance request scope does not match beneficiary case';end if;
  if not exists(select 1 from public.beneficiary_case_needs l where l.case_id=r.case_id and l.need_id=r.need_id and l.active) then raise exception 'Assessed need is no longer active in this beneficiary case';end if;
  if exists(select 1 from public.assistance_distribution_plans p where p.request_id=r.id and p.status<>'cancelled') then raise exception 'Assistance request already has an active distribution plan';end if;

  insert into public.assistance_distribution_plans(
    id,request_id,case_id,organization_id,project_id,person_id,need_id,geography_id,
    request_version,request_snapshot,distribution_mode,location_label,responsible_party,instructions,last_reason,created_by,updated_by
  ) values(
    p_id,r.id,r.case_id,r.organization_id,r.project_id,r.person_id,r.need_id,c.geography_id,
    r.version,to_jsonb(r),p_mode,trim(p_location),trim(p_responsible),trim(p_instructions),trim(p_reason),auth.uid(),auth.uid()
  );
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),r.organization_id,'assistance_distribution_plan_created',jsonb_build_object('plan',p_id,'request',r.id,'case',r.case_id,'project',r.project_id));
  return p_id;
end;
$$;

create function public.update_assistance_distribution_plan(
  p_id uuid,
  p_mode text,
  p_location text,
  p_responsible text,
  p_instructions text,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare p public.assistance_distribution_plans;r public.assistance_requests;c public.beneficiary_cases;
begin
  select * into p from public.assistance_distribution_plans where id=p_id;
  if not found or not app_private.can_manage_project(p.project_id) then raise exception 'Distribution planning permission required';end if;
  select * into p from public.assistance_distribution_plans where id=p_id for update;
  if p.version is distinct from p_version then raise exception 'Distribution plan changed. Reload before saving.';end if;
  if p.status not in ('draft','scheduled') then raise exception 'Only draft or scheduled distribution plans can be edited';end if;
  if p_mode is null or p_mode not in ('distribution_site','home_delivery','service_referral','field_visit','other')
    or p_location is null or length(trim(p_location)) not between 2 and 300
    or p_responsible is null or length(trim(p_responsible)) not between 2 and 160
    or p_instructions is null or length(trim(p_instructions)) not between 5 and 2000
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
  then raise exception 'Valid distribution mode, location, responsible party, instructions and reason required';end if;
  if p.distribution_mode=p_mode and p.location_label=trim(p_location) and p.responsible_party=trim(p_responsible) and p.instructions=trim(p_instructions) then raise exception 'No distribution plan changes supplied';end if;
  if not exists(select 1 from public.organizations where id=p.organization_id and status='active') then raise exception 'Active NGO required for distribution planning';end if;
  select * into r from public.assistance_requests where id=p.request_id for update;
  if r.status<>'approved' then raise exception 'Distribution plan requires an approved assistance request';end if;
  select * into c from public.beneficiary_cases where id=p.case_id for update;
  if c.status<>'open' then raise exception 'Beneficiary case must be open before changing a distribution plan';end if;

  update public.assistance_distribution_plans set
    distribution_mode=p_mode,location_label=trim(p_location),responsible_party=trim(p_responsible),instructions=trim(p_instructions),
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'assistance_distribution_plan_updated',jsonb_build_object('plan',p_id,'request',p.request_id,'previous_version',p_version));
end;
$$;

create function public.schedule_assistance_distribution_plan(
  p_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare p public.assistance_distribution_plans;r public.assistance_requests;c public.beneficiary_cases;
begin
  select * into p from public.assistance_distribution_plans where id=p_id;
  if not found or not app_private.can_manage_project(p.project_id) then raise exception 'Distribution planning permission required';end if;
  select * into p from public.assistance_distribution_plans where id=p_id for update;
  if p.version is distinct from p_version then raise exception 'Distribution plan changed. Reload before scheduling.';end if;
  if p.status not in ('draft','scheduled') then raise exception 'Only draft or scheduled distribution plans can be scheduled';end if;
  if p_start is null or not isfinite(p_start) or (p_end is not null and (not isfinite(p_end) or p_end<=p_start))
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
  then raise exception 'Valid distribution schedule and reason required';end if;
  if p.status='scheduled' and p.scheduled_start=p_start and p.scheduled_end is not distinct from p_end then raise exception 'No distribution schedule changes supplied';end if;
  if not exists(select 1 from public.organizations where id=p.organization_id and status='active') then raise exception 'Active NGO required for distribution scheduling';end if;
  select * into r from public.assistance_requests where id=p.request_id for update;
  if r.status<>'approved' then raise exception 'Distribution plan requires an approved assistance request';end if;
  select * into c from public.beneficiary_cases where id=p.case_id for update;
  if c.status<>'open' then raise exception 'Beneficiary case must be open before scheduling distribution';end if;

  update public.assistance_distribution_plans set
    status='scheduled',scheduled_start=p_start,scheduled_end=p_end,scheduled_by=auth.uid(),scheduled_at=now(),
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'assistance_distribution_plan_scheduled',jsonb_build_object('plan',p_id,'request',p.request_id,'scheduled_start',p_start,'scheduled_end',p_end,'previous_version',p_version));
end;
$$;

create function public.mark_assistance_distribution_plan_ready(
  p_id uuid,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare p public.assistance_distribution_plans;r public.assistance_requests;c public.beneficiary_cases;
begin
  select * into p from public.assistance_distribution_plans where id=p_id;
  if not found or not app_private.can_manage_project(p.project_id) then raise exception 'Distribution planning permission required';end if;
  select * into p from public.assistance_distribution_plans where id=p_id for update;
  if p.version is distinct from p_version then raise exception 'Distribution plan changed. Reload before marking ready.';end if;
  if p.status<>'scheduled' then raise exception 'Only a scheduled distribution plan can be marked ready';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Readiness reason required';end if;
  if not exists(select 1 from public.organizations where id=p.organization_id and status='active') then raise exception 'Active NGO required for distribution readiness';end if;
  select * into r from public.assistance_requests where id=p.request_id for update;
  if r.status<>'approved' then raise exception 'Distribution plan requires an approved assistance request';end if;
  select * into c from public.beneficiary_cases where id=p.case_id for update;
  if c.status<>'open' then raise exception 'Beneficiary case must be open before marking distribution ready';end if;

  update public.assistance_distribution_plans set
    status='ready',ready_by=auth.uid(),ready_at=now(),last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'assistance_distribution_plan_ready',jsonb_build_object('plan',p_id,'request',p.request_id,'previous_version',p_version));
end;
$$;

create function public.cancel_assistance_distribution_plan(
  p_id uuid,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare p public.assistance_distribution_plans;r public.assistance_requests;
begin
  select * into p from public.assistance_distribution_plans where id=p_id;
  if not found or not app_private.can_manage_project(p.project_id) then raise exception 'Distribution planning permission required';end if;
  select * into p from public.assistance_distribution_plans where id=p_id for update;
  if p.version is distinct from p_version then raise exception 'Distribution plan changed. Reload before cancellation.';end if;
  if p.status='cancelled' then raise exception 'Distribution plan is already cancelled';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Distribution-plan cancellation reason required';end if;
  -- Lock request so request cancellation cannot race with plan cancellation/replacement.
  select * into r from public.assistance_requests where id=p.request_id for update;

  update public.assistance_distribution_plans set
    status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=trim(p_reason),
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'assistance_distribution_plan_cancelled',jsonb_build_object('plan',p_id,'request',p.request_id,'previous_status',p.status,'previous_version',p_version));
end;
$$;

-- Preserve the 2.19.0 cancellation authority while preventing an approved request
-- from being cancelled out from under an active distribution plan.
create or replace function public.cancel_assistance_request(p_id uuid,p_reason text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.assistance_requests;allowed boolean;
begin
  select * into r from public.assistance_requests where id=p_id;
  if not found then raise exception 'Assistance request not found';end if;
  allowed:=app_private.can_manage_project(r.project_id);
  if r.status='approved' then allowed:=app_private.can_manage_surveys() or app_private.ngo_admin(r.organization_id);end if;
  if not allowed then raise exception 'Assistance request cancellation permission required';end if;
  select * into r from public.assistance_requests where id=p_id for update;
  if r.version is distinct from p_version then raise exception 'Assistance request changed. Reload before cancellation.';end if;
  if r.status not in ('draft','submitted','approved') then raise exception 'Assistance request is already terminal';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Cancellation reason required';end if;
  if exists(select 1 from public.assistance_distribution_plans p where p.request_id=r.id and p.status<>'cancelled') then raise exception 'Cancel the active distribution plan before cancelling this assistance request';end if;
  update public.assistance_requests set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),r.organization_id,'assistance_request_cancelled',jsonb_build_object('request',p_id,'case',r.case_id,'previous_status',r.status,'previous_version',p_version));
end;
$$;

create function public.assistance_distribution_plan_queue(
  p_organization uuid default null,
  p_project uuid default null,
  p_status text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;lim integer:=least(greatest(coalesce(p_limit,100),1),200);
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_organization is not null and not app_private.can_manage_surveys() and not app_private.ngo_admin(p_organization) and not exists(
    select 1 from public.survey_projects sp where sp.organization_id=p_organization and app_private.can_manage_project(sp.id)
  ) then raise exception 'Distribution planning permission required';end if;
  if p_project is not null and not app_private.can_manage_project(p_project) then raise exception 'Distribution planning permission required';end if;
  if p_status is not null and p_status not in ('draft','scheduled','ready','cancelled') then raise exception 'Valid distribution-plan status filter required';end if;

  with visible_projects as (
    select sp.id,sp.organization_id from public.survey_projects sp
    where app_private.can_manage_project(sp.id)
      and (p_organization is null or sp.organization_id=p_organization)
      and (p_project is null or sp.id=p_project)
  ), visible as (
    select p.* from public.assistance_distribution_plans p
    join visible_projects vp on vp.id=p.project_id
    where p_status is null or p.status=p_status
  ), limited as (
    select * from visible
    order by case status when 'ready' then 0 when 'scheduled' then 1 when 'draft' then 2 else 3 end,
      scheduled_start nulls last,updated_at desc,id
    limit lim
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'plan_no',p.plan_no,'request_id',p.request_id,'request_no',r.request_no,'case_id',p.case_id,'case_no',c.case_no,
      'organization_id',p.organization_id,'organization_name',o.name,'project_id',p.project_id,'project_title',sp.title,
      'person_id',p.person_id,'beneficiary_name',rp.full_name,'registry_no',rp.registry_no,
      'kind',r.kind,'category',r.category,'program',r.program,'urgency',r.urgency,
      'distribution_mode',p.distribution_mode,'location_label',p.location_label,'responsible_party',p.responsible_party,
      'scheduled_start',p.scheduled_start,'scheduled_end',p.scheduled_end,'status',p.status,'version',p.version,'updated_at',p.updated_at
    ) order by case p.status when 'ready' then 0 when 'scheduled' then 1 when 'draft' then 2 else 3 end,p.scheduled_start nulls last,p.updated_at desc,p.id)
      from limited p
      join public.assistance_requests r on r.id=p.request_id
      join public.beneficiary_cases c on c.id=p.case_id
      join public.organizations o on o.id=p.organization_id
      join public.survey_projects sp on sp.id=p.project_id
      join public.registry_persons rp on rp.id=p.person_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'active',(select count(*) from public.assistance_distribution_plans p join visible_projects vp on vp.id=p.project_id where p.status<>'cancelled'),
      'draft',(select count(*) from public.assistance_distribution_plans p join visible_projects vp on vp.id=p.project_id where p.status='draft'),
      'scheduled',(select count(*) from public.assistance_distribution_plans p join visible_projects vp on vp.id=p.project_id where p.status='scheduled'),
      'ready',(select count(*) from public.assistance_distribution_plans p join visible_projects vp on vp.id=p.project_id where p.status='ready'),
      'cancelled',(select count(*) from public.assistance_distribution_plans p join visible_projects vp on vp.id=p.project_id where p.status='cancelled'),
      'awaiting_plan',(select count(*) from public.assistance_requests r join visible_projects vp on vp.id=r.project_id where r.status='approved' and not exists(select 1 from public.assistance_distribution_plans p where p.request_id=r.id and p.status<>'cancelled'))
    ),
    'limit',lim
  ) into result;
  return result;
end;
$$;

create or replace function public.beneficiary_case_detail(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.beneficiary_cases;result jsonb;can_approve boolean;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  can_approve:=app_private.can_manage_surveys() or app_private.ngo_admin(c.organization_id);
  select jsonb_build_object(
    'case',to_jsonb(c),
    'person',(select jsonb_build_object('id',p.id,'registry_no',p.registry_no,'full_name',p.full_name,'birth_date',p.birth_date,'household_id',p.household_id) from public.registry_persons p where p.id=c.person_id),
    'project',(select jsonb_build_object('id',p.id,'title',p.title,'status',p.status,'organization_id',p.organization_id) from public.survey_projects p where p.id=c.project_id),
    'organization',(select jsonb_build_object('id',o.id,'name',o.name,'status',o.status) from public.organizations o where o.id=c.organization_id),
    'source_response',(select jsonb_build_object('id',r.id,'version',r.version,'status',r.status,'created_at',r.created_at,'reviewed_at',r.reviewed_at,'review_note',r.review_note) from public.survey_responses r where r.id=c.source_response_id),
    'needs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',n.id,'category',n.category,'description',n.description,'priority',n.priority,'status',n.status,'follow_up_on',n.follow_up_on,'version',n.version,
      'link_active',l.active,'link_reason',l.reason,'link_version',l.version
    ) order by case n.priority when 'high' then 0 when 'medium' then 1 else 2 end,n.created_at,n.id)
      from public.beneficiary_needs n join public.beneficiary_case_needs l on l.need_id=n.id where l.case_id=c.id),'[]'::jsonb),
    'available_needs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',n.id,'category',n.category,'description',n.description,'priority',n.priority,'status',n.status,'follow_up_on',n.follow_up_on,'version',n.version,
      'active_case_id',(select l.case_id from public.beneficiary_case_needs l where l.need_id=n.id and l.active limit 1)
    ) order by case n.priority when 'high' then 0 when 'medium' then 1 else 2 end,n.created_at,n.id)
      from public.beneficiary_needs n where n.project_id=c.project_id and n.person_id=c.person_id),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from public.assistance_requests r where r.case_id=c.id),'[]'::jsonb),
    'distribution_plans',coalesce((select jsonb_agg(to_jsonb(p) order by case p.status when 'ready' then 0 when 'scheduled' then 1 when 'draft' then 2 else 3 end,p.created_at desc,p.id) from public.assistance_distribution_plans p where p.case_id=c.id),'[]'::jsonb),
    'case_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.version desc) from (select * from public.beneficiary_case_revisions where case_id=c.id order by version desc limit 25) x),'[]'::jsonb),
    'can_approve_requests',can_approve
  ) into result;
  return result;
end;
$$;

alter table public.assistance_distribution_plans enable row level security;
alter table public.assistance_distribution_plan_revisions enable row level security;

create policy assistance_distribution_plan_read on public.assistance_distribution_plans
  for select to authenticated using(app_private.can_manage_project(project_id));
create policy assistance_distribution_plan_revision_read on public.assistance_distribution_plan_revisions
  for select to authenticated using(exists(select 1 from public.assistance_distribution_plans p where p.id=plan_id and app_private.can_manage_project(p.project_id)));

revoke all on public.assistance_distribution_plans,public.assistance_distribution_plan_revisions from public,anon,authenticated;
grant select on public.assistance_distribution_plans,public.assistance_distribution_plan_revisions to authenticated;
grant all on public.assistance_distribution_plans,public.assistance_distribution_plan_revisions to service_role;

revoke all on function app_private.capture_assistance_distribution_plan_revision() from public,anon,authenticated;
revoke all on function public.create_assistance_distribution_plan(uuid,uuid,text,text,text,text,text),public.update_assistance_distribution_plan(uuid,text,text,text,text,text,integer),public.schedule_assistance_distribution_plan(uuid,timestamptz,timestamptz,text,integer),public.mark_assistance_distribution_plan_ready(uuid,text,integer),public.cancel_assistance_distribution_plan(uuid,text,integer),public.assistance_distribution_plan_queue(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.create_assistance_distribution_plan(uuid,uuid,text,text,text,text,text),public.update_assistance_distribution_plan(uuid,text,text,text,text,text,integer),public.schedule_assistance_distribution_plan(uuid,timestamptz,timestamptz,text,integer),public.mark_assistance_distribution_plan_ready(uuid,text,integer),public.cancel_assistance_distribution_plan(uuid,text,integer),public.assistance_distribution_plan_queue(uuid,uuid,text,integer) to authenticated;
