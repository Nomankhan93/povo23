-- POEM 2.19.0 — Beneficiary Cases & Assistance Requests
-- Adds the operational layer between assessed needs and delivered assistance.
-- Existing beneficiary_needs remain the assessment source of truth.
-- Existing assistance_entries remain the delivered-assistance ledger.
-- No existing need or assistance row is backfilled into a case/request automatically.

create table public.beneficiary_cases (
  id uuid primary key,
  case_no bigint generated always as identity unique,
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  person_id uuid not null references public.registry_persons(id),
  source_response_id uuid not null references public.survey_responses(id),
  source_response_version integer not null check(source_response_version > 0),
  geography_id uuid not null references public.geographies(id),
  title text not null check(length(title) between 5 and 160),
  summary text not null check(length(summary) between 10 and 2000),
  priority text not null check(priority in ('low','medium','high')),
  status text not null default 'open' check(status in ('open','on_hold','closed')),
  follow_up_on date,
  identity_snapshot jsonb not null check(jsonb_typeof(identity_snapshot)='object'),
  last_reason text not null check(length(last_reason) between 5 and 2000),
  version integer not null default 1 check(version > 0),
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  updated_at timestamptz not null default now(),
  closed_by uuid references public.accounts(id),
  closed_at timestamptz,
  closure_reason text,
  check(follow_up_on is null or (isfinite(follow_up_on) and follow_up_on >= '1900-01-01'::date)),
  check(
    (status='closed' and closed_at is not null and closed_by is not null and closure_reason is not null and length(closure_reason) between 5 and 2000)
    or
    (status<>'closed' and closed_at is null and closed_by is null and closure_reason is null)
  )
);

create index beneficiary_cases_scope
  on public.beneficiary_cases(organization_id,project_id,status,priority,updated_at desc,id);
create index beneficiary_cases_person
  on public.beneficiary_cases(person_id,status,updated_at desc,id);

create table public.beneficiary_case_revisions (
  case_id uuid not null references public.beneficiary_cases(id),
  version integer not null,
  snapshot jsonb not null,
  reason text not null,
  actor_id uuid references public.accounts(id),
  recorded_at timestamptz not null default now(),
  primary key(case_id,version)
);

create table public.beneficiary_case_needs (
  case_id uuid not null references public.beneficiary_cases(id),
  need_id uuid not null references public.beneficiary_needs(id),
  active boolean not null default true,
  reason text not null check(length(reason) between 5 and 2000),
  version integer not null default 1 check(version > 0),
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  updated_at timestamptz not null default now(),
  primary key(case_id,need_id)
);

-- One assessed need may be operationally managed by only one active case at a time.
create unique index beneficiary_need_one_active_case
  on public.beneficiary_case_needs(need_id)
  where active;

create table public.beneficiary_case_need_revisions (
  case_id uuid not null,
  need_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key(case_id,need_id,version),
  foreign key(case_id,need_id) references public.beneficiary_case_needs(case_id,need_id)
);

create table public.assistance_requests (
  id uuid primary key,
  request_no bigint generated always as identity unique,
  case_id uuid not null references public.beneficiary_cases(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  person_id uuid not null references public.registry_persons(id),
  need_id uuid not null references public.beneficiary_needs(id),
  kind text not null check(kind in ('cash','goods','service')),
  category text not null check(category in ('food','education','health','housing','livelihood','other')),
  program text not null check(length(program) between 2 and 150),
  purpose text not null check(length(purpose) between 5 and 2000),
  requested_amount_pkr numeric(14,2),
  requested_quantity numeric(12,3),
  requested_unit text,
  urgency text not null check(urgency in ('low','medium','high')),
  desired_by date,
  status text not null default 'draft' check(status in ('draft','submitted','approved','rejected','cancelled')),
  need_snapshot jsonb not null check(jsonb_typeof(need_snapshot)='object'),
  identity_snapshot jsonb not null check(jsonb_typeof(identity_snapshot)='object'),
  last_reason text not null check(length(last_reason) between 5 and 2000),
  review_note text,
  submitted_at timestamptz,
  reviewed_by uuid references public.accounts(id),
  reviewed_at timestamptz,
  cancelled_by uuid references public.accounts(id),
  cancelled_at timestamptz,
  version integer not null default 1 check(version > 0),
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  updated_at timestamptz not null default now(),
  check(desired_by is null or (isfinite(desired_by) and desired_by >= '1900-01-01'::date)),
  check(
    (kind='cash' and requested_amount_pkr is not null and requested_amount_pkr > 0 and requested_amount_pkr <= 1000000000 and requested_quantity is null and requested_unit is null)
    or
    (kind in ('goods','service') and requested_amount_pkr is null and requested_quantity is not null and requested_quantity > 0 and requested_quantity <= 1000000 and requested_unit is not null and length(requested_unit) between 1 and 30)
  ),
  check(
    (status='draft' and submitted_at is null and reviewed_at is null and cancelled_at is null)
    or (status='submitted' and submitted_at is not null and reviewed_at is null and cancelled_at is null)
    or (status in ('approved','rejected') and submitted_at is not null and reviewed_at is not null and reviewed_by is not null and cancelled_at is null)
    or (status='cancelled' and cancelled_at is not null and cancelled_by is not null)
  )
);

create index assistance_requests_case
  on public.assistance_requests(case_id,status,urgency,created_at desc,id);
create index assistance_requests_scope
  on public.assistance_requests(organization_id,project_id,status,created_at desc,id);
create index assistance_requests_need
  on public.assistance_requests(need_id,status,created_at desc,id);

create table public.assistance_request_revisions (
  request_id uuid not null references public.assistance_requests(id),
  version integer not null,
  snapshot jsonb not null,
  reason text not null,
  actor_id uuid references public.accounts(id),
  recorded_at timestamptz not null default now(),
  primary key(request_id,version)
);

create function app_private.capture_beneficiary_case_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.beneficiary_case_revisions(case_id,version,snapshot,reason,actor_id)
  values(new.id,new.version,to_jsonb(new),new.last_reason,auth.uid());
  return new;
end;
$$;

create trigger beneficiary_case_revision
  after insert or update on public.beneficiary_cases
  for each row execute function app_private.capture_beneficiary_case_revision();

create function app_private.capture_beneficiary_case_need_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.beneficiary_case_need_revisions(case_id,need_id,version,snapshot)
  values(new.case_id,new.need_id,new.version,to_jsonb(new));
  return new;
end;
$$;

create trigger beneficiary_case_need_revision
  after insert or update on public.beneficiary_case_needs
  for each row execute function app_private.capture_beneficiary_case_need_revision();

create function app_private.capture_assistance_request_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.assistance_request_revisions(request_id,version,snapshot,reason,actor_id)
  values(new.id,new.version,to_jsonb(new),new.last_reason,auth.uid());
  return new;
end;
$$;

create trigger assistance_request_revision
  after insert or update on public.assistance_requests
  for each row execute function app_private.capture_assistance_request_revision();

create function public.beneficiary_case_intake_options(
  p_organization uuid default null,
  p_project uuid default null,
  p_person uuid default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;project_row public.survey_projects;person_row public.registry_persons;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_organization is not null and not app_private.can_manage_surveys() and not app_private.ngo_admin(p_organization) and not exists(
    select 1 from public.survey_projects p where p.organization_id=p_organization and app_private.can_manage_project(p.id)
  ) then raise exception 'Beneficiary case management permission required';end if;

  if p_project is not null then
    select * into project_row from public.survey_projects where id=p_project;
    if not found or not app_private.can_manage_project(p_project) then raise exception 'Beneficiary case management permission required';end if;
    if p_organization is not null and project_row.organization_id<>p_organization then raise exception 'Project is outside the selected organization';end if;
  end if;

  if p_person is not null then
    if p_project is null then raise exception 'Project required when selecting a beneficiary';end if;
    select * into person_row from public.registry_persons where id=p_person and project_id=p_project;
    if not found then raise exception 'Beneficiary not found in project';end if;
  end if;

  select jsonb_build_object(
    'projects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'title',p.title,'organization_id',p.organization_id,'organization_name',o.name,
        'status',p.status,'geography_id',p.geography_id
      ) order by o.name,p.title,p.id)
      from public.survey_projects p
      join public.organizations o on o.id=p.organization_id
      where app_private.can_manage_project(p.id)
        and (p_organization is null or p.organization_id=p_organization)
        and (p_project is null or p.id=p_project)
    ),'[]'::jsonb),
    'people',case when p_project is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',rp.id,'registry_no',rp.registry_no,'full_name',rp.full_name,'birth_date',rp.birth_date,
        'household_id',rp.household_id,'household_label',h.label,
        'open_cases',(select count(*) from public.beneficiary_cases c where c.person_id=rp.id and c.status<>'closed')
      ) order by rp.full_name,rp.id)
      from public.registry_persons rp
      join public.registry_households h on h.id=rp.household_id
      where rp.project_id=p_project
        and exists(select 1 from public.survey_responses sr where sr.person_id=rp.id and sr.project_id=p_project and sr.status='approved')
    ),'[]'::jsonb) end,
    'responses',case when p_person is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',sr.id,'version',sr.version,'created_at',sr.created_at,'reviewed_at',sr.reviewed_at,'review_note',sr.review_note
      ) order by coalesce(sr.reviewed_at,sr.created_at) desc,sr.id)
      from (
        select * from public.survey_responses
        where person_id=p_person and project_id=p_project and status='approved'
        order by coalesce(reviewed_at,created_at) desc,id
        limit 50
      ) sr
    ),'[]'::jsonb) end,
    'needs',case when p_person is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',n.id,'category',n.category,'description',n.description,'priority',n.priority,'status',n.status,
        'follow_up_on',n.follow_up_on,'version',n.version,
        'active_case_id',(select l.case_id from public.beneficiary_case_needs l where l.need_id=n.id and l.active limit 1)
      ) order by case n.priority when 'high' then 0 when 'medium' then 1 else 2 end,n.created_at,n.id)
      from public.beneficiary_needs n
      where n.person_id=p_person and n.project_id=p_project
    ),'[]'::jsonb) end
  ) into result;
  return result;
end;
$$;

create function public.create_beneficiary_case(
  p_id uuid,
  p_person uuid,
  p_response uuid,
  p_need uuid,
  p_title text,
  p_summary text,
  p_priority text,
  p_follow_up date,
  p_reason text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare person public.registry_persons;response public.survey_responses;project_row public.survey_projects;household public.registry_households;existing public.beneficiary_cases;need public.beneficiary_needs;geo uuid;
begin
  if p_id is null then raise exception 'Case request ID required';end if;
  select * into person from public.registry_persons where id=p_person;
  if not found or not app_private.can_manage_project(person.project_id) then raise exception 'Beneficiary case management permission required';end if;
  select * into project_row from public.survey_projects where id=person.project_id for update;
  if not exists(select 1 from public.organizations where id=project_row.organization_id and status='active') then raise exception 'Active NGO required for a new beneficiary case';end if;
  select * into response from public.survey_responses where id=p_response and project_id=person.project_id and person_id=p_person and status='approved';
  if not found then raise exception 'Approved source survey required for beneficiary case';end if;
  select * into household from public.registry_households where id=person.household_id and project_id=person.project_id;
  geo:=coalesce(response.collection_geography_id,household.geography_id,project_row.geography_id);

  if p_title is null or length(trim(p_title)) not between 5 and 160
    or p_summary is null or length(trim(p_summary)) not between 10 and 2000
    or p_priority is null or p_priority not in ('low','medium','high')
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
    or (p_follow_up is not null and (not isfinite(p_follow_up) or p_follow_up<'1900-01-01'::date))
  then raise exception 'Valid case title, summary, priority, follow-up date and reason required';end if;

  select * into existing from public.beneficiary_cases where id=p_id;
  if found then
    if existing.created_by=auth.uid()
      and existing.person_id=p_person
      and existing.source_response_id=p_response
      and existing.title=trim(p_title)
      and existing.summary=trim(p_summary)
      and existing.priority=p_priority
      and existing.follow_up_on is not distinct from p_follow_up
      and (p_need is null or exists(select 1 from public.beneficiary_case_needs l where l.case_id=existing.id and l.need_id=p_need))
    then return existing.id;end if;
    raise exception 'Case request ID already used with different details';
  end if;

  if p_need is not null then
    select * into need from public.beneficiary_needs where id=p_need and project_id=person.project_id and person_id=p_person;
    if not found or need.status not in ('open','in_progress','needs_review') then raise exception 'Choose a pending assessed need for this beneficiary';end if;
    if exists(select 1 from public.beneficiary_case_needs l where l.need_id=p_need and l.active) then raise exception 'Need already belongs to another active beneficiary case';end if;
  end if;

  insert into public.beneficiary_cases(
    id,organization_id,project_id,person_id,source_response_id,source_response_version,geography_id,
    title,summary,priority,follow_up_on,identity_snapshot,last_reason,created_by,updated_by
  ) values(
    p_id,project_row.organization_id,project_row.id,person.id,response.id,response.version,geo,
    trim(p_title),trim(p_summary),p_priority,p_follow_up,
    jsonb_build_object('person',to_jsonb(person),'household',to_jsonb(household),'source_response_id',response.id,'source_response_version',response.version,'recorded_at',now()),
    trim(p_reason),auth.uid(),auth.uid()
  );

  if p_need is not null then
    insert into public.beneficiary_case_needs(case_id,need_id,active,reason,created_by,updated_by)
    values(p_id,p_need,true,trim(p_reason),auth.uid(),auth.uid());
  end if;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),project_row.organization_id,'beneficiary_case_created',jsonb_build_object('case',p_id,'person',p_person,'project',project_row.id,'source_response',p_response,'need',p_need));
  return p_id;
end;
$$;

create function public.update_beneficiary_case(
  p_case uuid,
  p_title text,
  p_summary text,
  p_priority text,
  p_status text,
  p_follow_up date,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  select * into c from public.beneficiary_cases where id=p_case for update;
  if c.version is distinct from p_version then raise exception 'Beneficiary case changed. Reload before saving.';end if;
  if p_title is null or length(trim(p_title)) not between 5 and 160
    or p_summary is null or length(trim(p_summary)) not between 10 and 2000
    or p_priority is null or p_priority not in ('low','medium','high')
    or p_status is null or p_status not in ('open','on_hold','closed')
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
    or (p_follow_up is not null and (not isfinite(p_follow_up) or p_follow_up<'1900-01-01'::date))
  then raise exception 'Valid case details, status and review reason required';end if;
  if c.title=trim(p_title) and c.summary=trim(p_summary) and c.priority=p_priority and c.status=p_status and c.follow_up_on is not distinct from p_follow_up then raise exception 'No case changes supplied';end if;

  if p_status='closed' then
    if exists(select 1 from public.assistance_requests r where r.case_id=p_case and r.status in ('submitted','approved')) then raise exception 'Resolve submitted or approved assistance requests before closing the case';end if;
    if exists(
      select 1 from public.beneficiary_case_needs l
      join public.beneficiary_needs n on n.id=l.need_id
      where l.case_id=p_case and l.active and n.status in ('open','in_progress','needs_review')
    ) then raise exception 'Resolve or unlink pending assessed needs before closing the case';end if;
  end if;

  update public.beneficiary_cases set
    title=trim(p_title),summary=trim(p_summary),priority=p_priority,status=p_status,follow_up_on=p_follow_up,
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now(),
    closed_by=case when p_status='closed' then auth.uid() else null end,
    closed_at=case when p_status='closed' then now() else null end,
    closure_reason=case when p_status='closed' then trim(p_reason) else null end
  where id=p_case;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'beneficiary_case_updated',jsonb_build_object('case',p_case,'previous_version',p_version,'status',p_status));
end;
$$;

create function public.set_beneficiary_case_need(
  p_case uuid,
  p_need uuid,
  p_active boolean,
  p_reason text,
  p_case_version integer,
  p_link_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases;n public.beneficiary_needs;l public.beneficiary_case_needs;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  select * into c from public.beneficiary_cases where id=p_case for update;
  if c.version is distinct from p_case_version then raise exception 'Beneficiary case changed. Reload before changing assessed needs.';end if;
  if c.status='closed' then raise exception 'Reopen the beneficiary case before changing assessed needs';end if;
  if p_active is null or p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Need link decision and reason required';end if;
  select * into n from public.beneficiary_needs where id=p_need and project_id=c.project_id and person_id=c.person_id;
  if not found then raise exception 'Assessed need must belong to the same beneficiary and project';end if;
  select * into l from public.beneficiary_case_needs where case_id=p_case and need_id=p_need for update;
  if coalesce(l.version,0) is distinct from p_link_version then raise exception 'Need link changed. Reload before saving.';end if;
  if p_active and n.status not in ('open','in_progress','needs_review') then raise exception 'Only pending assessed needs can be actively linked to a case';end if;
  if p_active and exists(select 1 from public.beneficiary_case_needs x where x.need_id=p_need and x.active and x.case_id<>p_case) then raise exception 'Need already belongs to another active beneficiary case';end if;
  if not p_active and exists(select 1 from public.assistance_requests r where r.case_id=p_case and r.need_id=p_need and r.status in ('submitted','approved')) then raise exception 'Resolve active assistance requests before unlinking this assessed need';end if;
  if (l.version is null and not p_active) or l.active is not distinct from p_active then raise exception 'No need link change supplied';end if;

  insert into public.beneficiary_case_needs(case_id,need_id,active,reason,created_by,updated_by)
  values(p_case,p_need,p_active,trim(p_reason),auth.uid(),auth.uid())
  on conflict(case_id,need_id) do update set active=excluded.active,reason=excluded.reason,version=public.beneficiary_case_needs.version+1,updated_by=auth.uid(),updated_at=now();

  update public.beneficiary_cases set version=version+1,last_reason=case when p_active then 'Assessed need linked: ' else 'Assessed need unlinked: ' end||trim(p_reason),updated_by=auth.uid(),updated_at=now() where id=p_case;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'beneficiary_case_need_changed',jsonb_build_object('case',p_case,'need',p_need,'active',p_active,'previous_case_version',p_case_version));
end;
$$;

create function public.create_assistance_request(
  p_id uuid,
  p_case uuid,
  p_need uuid,
  p_kind text,
  p_category text,
  p_program text,
  p_purpose text,
  p_amount numeric,
  p_quantity numeric,
  p_unit text,
  p_urgency text,
  p_desired_by date
) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases;n public.beneficiary_needs;person public.registry_persons;existing public.assistance_requests;
begin
  if p_id is null then raise exception 'Assistance request ID required';end if;
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  select * into person from public.registry_persons where id=c.person_id;

  if p_kind is null or p_kind not in ('cash','goods','service')
    or p_category is null or p_category not in ('food','education','health','housing','livelihood','other')
    or p_program is null or length(trim(p_program)) not between 2 and 150
    or p_purpose is null or length(trim(p_purpose)) not between 5 and 2000
    or p_urgency is null or p_urgency not in ('low','medium','high')
    or (p_desired_by is not null and (not isfinite(p_desired_by) or p_desired_by<'1900-01-01'::date))
  then raise exception 'Valid assistance request details required';end if;
  if p_kind='cash' then
    if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>1000000000 or round(p_amount,2)<>p_amount or p_quantity is not null or nullif(trim(p_unit),'') is not null then raise exception 'Cash request requires a positive PKR amount with at most two decimal places';end if;
  else
    if p_amount is not null or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<=0 or p_quantity>1000000 or round(p_quantity,3)<>p_quantity or p_unit is null or length(trim(p_unit)) not between 1 and 30 then raise exception 'Goods/service request requires quantity and unit, without a cash amount';end if;
  end if;

  select * into existing from public.assistance_requests where id=p_id;
  if found then
    if existing.created_by=auth.uid() and existing.case_id=p_case and existing.need_id=p_need and existing.kind=p_kind and existing.category=p_category
      and existing.program=trim(p_program) and existing.purpose=trim(p_purpose) and existing.requested_amount_pkr is not distinct from p_amount
      and existing.requested_quantity is not distinct from p_quantity and existing.requested_unit is not distinct from nullif(trim(p_unit),'')
      and existing.urgency=p_urgency and existing.desired_by is not distinct from p_desired_by
    then return existing.id;end if;
    raise exception 'Assistance request ID already used with different details';
  end if;

  if c.status='closed' then raise exception 'Closed beneficiary case cannot accept assistance requests';end if;
  if not exists(select 1 from public.organizations where id=c.organization_id and status='active') then raise exception 'Active NGO required for assistance request';end if;
  select * into n from public.beneficiary_needs where id=p_need and project_id=c.project_id and person_id=c.person_id;
  if not found or n.status not in ('open','in_progress','needs_review') then raise exception 'Choose a pending assessed need from this case';end if;
  if not exists(select 1 from public.beneficiary_case_needs l where l.case_id=p_case and l.need_id=p_need and l.active) then raise exception 'Assistance request requires an active assessed need link in this case';end if;

  insert into public.assistance_requests(
    id,case_id,organization_id,project_id,person_id,need_id,kind,category,program,purpose,
    requested_amount_pkr,requested_quantity,requested_unit,urgency,desired_by,need_snapshot,identity_snapshot,last_reason,created_by,updated_by
  ) values(
    p_id,c.id,c.organization_id,c.project_id,c.person_id,n.id,p_kind,p_category,trim(p_program),trim(p_purpose),
    p_amount,p_quantity,nullif(trim(p_unit),''),p_urgency,p_desired_by,to_jsonb(n),to_jsonb(person),'Draft assistance request created',auth.uid(),auth.uid()
  );
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'assistance_request_created',jsonb_build_object('request',p_id,'case',c.id,'need',n.id,'kind',p_kind,'category',p_category));
  return p_id;
end;
$$;

create function public.update_assistance_request(
  p_id uuid,
  p_kind text,
  p_category text,
  p_program text,
  p_purpose text,
  p_amount numeric,
  p_quantity numeric,
  p_unit text,
  p_urgency text,
  p_desired_by date,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare r public.assistance_requests;
begin
  select * into r from public.assistance_requests where id=p_id;
  if not found or not app_private.can_manage_project(r.project_id) then raise exception 'Beneficiary case management permission required';end if;
  select * into r from public.assistance_requests where id=p_id for update;
  if r.version is distinct from p_version then raise exception 'Assistance request changed. Reload before saving.';end if;
  if r.status<>'draft' then raise exception 'Only draft assistance requests can be edited';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Request edit reason required';end if;
  if p_kind is null or p_kind not in ('cash','goods','service')
    or p_category is null or p_category not in ('food','education','health','housing','livelihood','other')
    or p_program is null or length(trim(p_program)) not between 2 and 150
    or p_purpose is null or length(trim(p_purpose)) not between 5 and 2000
    or p_urgency is null or p_urgency not in ('low','medium','high')
    or (p_desired_by is not null and (not isfinite(p_desired_by) or p_desired_by<'1900-01-01'::date))
  then raise exception 'Valid assistance request details required';end if;
  if p_kind='cash' then
    if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>1000000000 or round(p_amount,2)<>p_amount or p_quantity is not null or nullif(trim(p_unit),'') is not null then raise exception 'Cash request requires a positive PKR amount with at most two decimal places';end if;
  else
    if p_amount is not null or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<=0 or p_quantity>1000000 or round(p_quantity,3)<>p_quantity or p_unit is null or length(trim(p_unit)) not between 1 and 30 then raise exception 'Goods/service request requires quantity and unit, without a cash amount';end if;
  end if;
  if r.kind=p_kind and r.category=p_category and r.program=trim(p_program) and r.purpose=trim(p_purpose)
    and r.requested_amount_pkr is not distinct from p_amount and r.requested_quantity is not distinct from p_quantity
    and r.requested_unit is not distinct from nullif(trim(p_unit),'') and r.urgency=p_urgency and r.desired_by is not distinct from p_desired_by
  then raise exception 'No assistance request changes supplied';end if;

  update public.assistance_requests set kind=p_kind,category=p_category,program=trim(p_program),purpose=trim(p_purpose),
    requested_amount_pkr=p_amount,requested_quantity=p_quantity,requested_unit=nullif(trim(p_unit),''),urgency=p_urgency,desired_by=p_desired_by,
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),r.organization_id,'assistance_request_updated',jsonb_build_object('request',p_id,'previous_version',p_version));
end;
$$;

create function public.submit_assistance_request(p_id uuid,p_reason text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.assistance_requests;c public.beneficiary_cases;n public.beneficiary_needs;
begin
  select * into r from public.assistance_requests where id=p_id;
  if not found or not app_private.can_manage_project(r.project_id) then raise exception 'Beneficiary case management permission required';end if;
  select * into r from public.assistance_requests where id=p_id for update;
  if r.version is distinct from p_version then raise exception 'Assistance request changed. Reload before submitting.';end if;
  if r.status<>'draft' then raise exception 'Only draft assistance request can be submitted';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Submission reason required';end if;
  select * into c from public.beneficiary_cases where id=r.case_id for update;
  if c.status<>'open' then raise exception 'Beneficiary case must be open before submitting assistance request';end if;
  if not exists(select 1 from public.organizations where id=r.organization_id and status='active') then raise exception 'Active NGO required for assistance request';end if;
  select * into n from public.beneficiary_needs where id=r.need_id;
  if n.status not in ('open','in_progress','needs_review') or not exists(select 1 from public.beneficiary_case_needs l where l.case_id=r.case_id and l.need_id=r.need_id and l.active) then raise exception 'Assessed need is no longer active in this beneficiary case';end if;
  update public.assistance_requests set status='submitted',submitted_at=now(),last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),r.organization_id,'assistance_request_submitted',jsonb_build_object('request',p_id,'case',r.case_id,'previous_version',p_version));
end;
$$;

create function public.review_assistance_request(p_id uuid,p_decision text,p_note text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.assistance_requests;c public.beneficiary_cases;n public.beneficiary_needs;decision text:=lower(trim(coalesce(p_decision,'')));
begin
  select * into r from public.assistance_requests where id=p_id;
  if not found then raise exception 'Assistance request not found';end if;
  if not (app_private.can_manage_surveys() or app_private.ngo_admin(r.organization_id)) then raise exception 'NGO Admin or POEM survey approval permission required';end if;
  select * into r from public.assistance_requests where id=p_id for update;
  if r.version is distinct from p_version then raise exception 'Assistance request changed. Reload before review.';end if;
  if r.status<>'submitted' then raise exception 'Only submitted assistance request can be reviewed';end if;
  if decision not in ('approve','reject') or p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Approval/rejection decision and review note required';end if;
  select * into c from public.beneficiary_cases where id=r.case_id for update;
  if decision='approve' and c.status<>'open' then raise exception 'Beneficiary case must be open before approving assistance request';end if;
  if not exists(select 1 from public.organizations where id=r.organization_id and status='active') then raise exception 'Active NGO required for assistance request review';end if;
  select * into n from public.beneficiary_needs where id=r.need_id for update;
  if decision='approve' and (n.status not in ('open','in_progress','needs_review') or not exists(select 1 from public.beneficiary_case_needs l where l.case_id=r.case_id and l.need_id=r.need_id and l.active)) then raise exception 'Assessed need is no longer active in this beneficiary case';end if;

  update public.assistance_requests set status=case when decision='approve' then 'approved' else 'rejected' end,
    review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),last_reason=trim(p_note),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_id;

  if decision='approve' and n.status='open' then
    update public.beneficiary_needs set status='in_progress',version=version+1,last_reason='Assistance request approved: '||trim(p_note),updated_by=auth.uid(),updated_at=now() where id=n.id;
  end if;

  insert into public.notifications(user_id,title,body)
  values(r.created_by,'Assistance request reviewed',case when decision='approve' then 'Your beneficiary assistance request was approved for planning. This does not mean assistance has been delivered.' else 'Your beneficiary assistance request was rejected. Review the case notes for details.' end);
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),r.organization_id,'assistance_request_reviewed',jsonb_build_object('request',p_id,'case',r.case_id,'decision',decision,'previous_version',p_version));
end;
$$;

create function public.cancel_assistance_request(p_id uuid,p_reason text,p_version integer)
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
  update public.assistance_requests set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),r.organization_id,'assistance_request_cancelled',jsonb_build_object('request',p_id,'case',r.case_id,'previous_status',r.status,'previous_version',p_version));
end;
$$;

create function public.beneficiary_case_queue(
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
      'high_priority_open',(select count(*) from visible where priority='high' and status='open'),
      'submitted_requests',(select count(*) from public.assistance_requests r join visible c on c.id=r.case_id where r.status='submitted'),
      'approved_requests',(select count(*) from public.assistance_requests r join visible c on c.id=r.case_id where r.status='approved')
    ),
    'limit',lim
  ) into result;
  return result;
end;
$$;

create function public.beneficiary_case_detail(p_case uuid)
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
    'case_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.version desc) from (select * from public.beneficiary_case_revisions where case_id=c.id order by version desc limit 25) x),'[]'::jsonb),
    'can_approve_requests',can_approve
  ) into result;
  return result;
end;
$$;

alter table public.beneficiary_cases enable row level security;
alter table public.beneficiary_case_revisions enable row level security;
alter table public.beneficiary_case_needs enable row level security;
alter table public.beneficiary_case_need_revisions enable row level security;
alter table public.assistance_requests enable row level security;
alter table public.assistance_request_revisions enable row level security;

create policy beneficiary_case_read on public.beneficiary_cases for select to authenticated using(app_private.can_manage_project(project_id));
create policy beneficiary_case_revision_read on public.beneficiary_case_revisions for select to authenticated using(exists(select 1 from public.beneficiary_cases c where c.id=case_id and app_private.can_manage_project(c.project_id)));
create policy beneficiary_case_need_read on public.beneficiary_case_needs for select to authenticated using(exists(select 1 from public.beneficiary_cases c where c.id=case_id and app_private.can_manage_project(c.project_id)));
create policy beneficiary_case_need_revision_read on public.beneficiary_case_need_revisions for select to authenticated using(exists(select 1 from public.beneficiary_cases c where c.id=case_id and app_private.can_manage_project(c.project_id)));
create policy assistance_request_read on public.assistance_requests for select to authenticated using(app_private.can_manage_project(project_id));
create policy assistance_request_revision_read on public.assistance_request_revisions for select to authenticated using(exists(select 1 from public.assistance_requests r where r.id=request_id and app_private.can_manage_project(r.project_id)));

revoke all on public.beneficiary_cases,public.beneficiary_case_revisions,public.beneficiary_case_needs,public.beneficiary_case_need_revisions,public.assistance_requests,public.assistance_request_revisions from public,anon,authenticated;
grant select on public.beneficiary_cases,public.beneficiary_case_revisions,public.beneficiary_case_needs,public.beneficiary_case_need_revisions,public.assistance_requests,public.assistance_request_revisions to authenticated;
grant all on public.beneficiary_cases,public.beneficiary_case_revisions,public.beneficiary_case_needs,public.beneficiary_case_need_revisions,public.assistance_requests,public.assistance_request_revisions to service_role;

revoke all on function app_private.capture_beneficiary_case_revision(),app_private.capture_beneficiary_case_need_revision(),app_private.capture_assistance_request_revision() from public,anon,authenticated;
revoke all on function public.beneficiary_case_intake_options(uuid,uuid,uuid),public.create_beneficiary_case(uuid,uuid,uuid,uuid,text,text,text,date,text),public.update_beneficiary_case(uuid,text,text,text,text,date,text,integer),public.set_beneficiary_case_need(uuid,uuid,boolean,text,integer,integer),public.create_assistance_request(uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,date),public.update_assistance_request(uuid,text,text,text,text,numeric,numeric,text,text,date,text,integer),public.submit_assistance_request(uuid,text,integer),public.review_assistance_request(uuid,text,text,integer),public.cancel_assistance_request(uuid,text,integer),public.beneficiary_case_queue(uuid,uuid,text,text,integer),public.beneficiary_case_detail(uuid) from public,anon,authenticated;
grant execute on function public.beneficiary_case_intake_options(uuid,uuid,uuid),public.create_beneficiary_case(uuid,uuid,uuid,uuid,text,text,text,date,text),public.update_beneficiary_case(uuid,text,text,text,text,date,text,integer),public.set_beneficiary_case_need(uuid,uuid,boolean,text,integer,integer),public.create_assistance_request(uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,date),public.update_assistance_request(uuid,text,text,text,text,numeric,numeric,text,text,date,text,integer),public.submit_assistance_request(uuid,text,integer),public.review_assistance_request(uuid,text,text,integer),public.cancel_assistance_request(uuid,text,integer),public.beneficiary_case_queue(uuid,uuid,text,text,integer),public.beneficiary_case_detail(uuid) to authenticated;
