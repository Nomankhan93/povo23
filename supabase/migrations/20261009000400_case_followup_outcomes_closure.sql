-- POEM 2.19.3 — Follow-up, Outcomes & Case Closure
-- Adds structured post-delivery follow-up and outcome records while preserving:
--   * canonical beneficiary identity
--   * beneficiary_needs as the assessed-need source of truth
--   * assistance_entries as the authoritative delivered-assistance ledger
--   * 2.19.0 case/request, 2.19.1 distribution-plan and 2.19.2 duplicate-control layers
-- No worker-payable, finance, wallet or withdrawal subsystem is coupled to case closure.

alter table public.beneficiary_cases
  add column closure_category text,
  add column closure_summary text;

alter table public.beneficiary_cases
  add constraint beneficiary_cases_closure_category_check
    check(closure_category is null or closure_category in (
      'needs_resolved','referred_out','beneficiary_declined','unable_to_contact',
      'duplicate_case','no_longer_eligible','administrative_closure','other'
    )),
  add constraint beneficiary_cases_closure_summary_check
    check(closure_summary is null or length(closure_summary) between 10 and 2000);

create table public.beneficiary_case_followups (
  id uuid primary key,
  case_id uuid not null references public.beneficiary_cases(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  person_id uuid not null references public.registry_persons(id),
  need_id uuid references public.beneficiary_needs(id),
  assistance_id uuid references public.assistance_entries(id),
  parent_followup_id uuid references public.beneficiary_case_followups(id),
  followup_type text not null check(followup_type in ('phone','field_visit','office_visit','partner_feedback','document_review','other')),
  due_on date not null,
  status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
  outcome_status text check(outcome_status in ('resolved','partially_resolved','unresolved','further_assistance_required','referred','unable_to_verify')),
  observations text,
  beneficiary_feedback text,
  next_action text,
  next_follow_up_on date,
  last_reason text not null check(length(last_reason) between 5 and 2000),
  version integer not null default 1 check(version > 0),
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  updated_at timestamptz not null default now(),
  completed_by uuid references public.accounts(id),
  completed_at timestamptz,
  cancelled_by uuid references public.accounts(id),
  cancelled_at timestamptz,
  cancellation_reason text,
  check(isfinite(due_on) and due_on >= '1900-01-01'::date),
  check(next_follow_up_on is null or (isfinite(next_follow_up_on) and next_follow_up_on >= '1900-01-01'::date)),
  check(beneficiary_feedback is null or length(beneficiary_feedback) <= 4000),
  check(
    (status='scheduled' and outcome_status is null and observations is null and next_action is null and completed_by is null and completed_at is null and cancelled_by is null and cancelled_at is null and cancellation_reason is null)
    or
    (status='completed' and outcome_status is not null and observations is not null and length(observations) between 5 and 4000 and next_action is not null and length(next_action) between 3 and 2000 and completed_by is not null and completed_at is not null and cancelled_by is null and cancelled_at is null and cancellation_reason is null)
    or
    (status='cancelled' and outcome_status is null and observations is null and next_action is null and completed_by is null and completed_at is null and cancelled_by is not null and cancelled_at is not null and cancellation_reason is not null and length(cancellation_reason) between 5 and 2000)
  )
);

create index beneficiary_case_followups_scope
  on public.beneficiary_case_followups(organization_id,project_id,status,due_on,id);
create index beneficiary_case_followups_case
  on public.beneficiary_case_followups(case_id,status,due_on,id);
create index beneficiary_case_followups_assistance
  on public.beneficiary_case_followups(assistance_id,status,id)
  where assistance_id is not null;
create index beneficiary_case_followups_need
  on public.beneficiary_case_followups(need_id,status,id)
  where need_id is not null;

create table public.beneficiary_case_followup_revisions (
  followup_id uuid not null references public.beneficiary_case_followups(id),
  version integer not null,
  snapshot jsonb not null,
  reason text not null,
  actor_id uuid references public.accounts(id),
  recorded_at timestamptz not null default now(),
  primary key(followup_id,version)
);

create table public.beneficiary_case_lifecycle_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.beneficiary_cases(id),
  event_type text not null check(event_type in ('closed','reopened')),
  case_version integer not null check(case_version > 0),
  closure_category text,
  summary text not null check(length(summary) between 5 and 2000),
  reason text not null check(length(reason) between 5 and 2000),
  actor_id uuid references public.accounts(id),
  recorded_at timestamptz not null default now()
);
create index beneficiary_case_lifecycle_history
  on public.beneficiary_case_lifecycle_events(case_id,recorded_at desc,id desc);

create function app_private.capture_beneficiary_case_followup_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.beneficiary_case_followup_revisions(followup_id,version,snapshot,reason,actor_id)
  values(new.id,new.version,to_jsonb(new),new.last_reason,auth.uid());
  return new;
end;
$$;

create trigger beneficiary_case_followup_revision
after insert or update on public.beneficiary_case_followups
for each row execute function app_private.capture_beneficiary_case_followup_revision();

create function app_private.capture_beneficiary_case_lifecycle_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status is distinct from new.status then
    if new.status='closed' then
      insert into public.beneficiary_case_lifecycle_events(
        case_id,event_type,case_version,closure_category,summary,reason,actor_id
      ) values(
        new.id,'closed',new.version,new.closure_category,
        coalesce(new.closure_summary,new.closure_reason,new.last_reason),new.last_reason,auth.uid()
      );
    elsif old.status='closed' and new.status<>'closed' then
      insert into public.beneficiary_case_lifecycle_events(
        case_id,event_type,case_version,closure_category,summary,reason,actor_id
      ) values(
        new.id,'reopened',new.version,old.closure_category,
        coalesce(old.closure_summary,old.closure_reason,'Case reopened'),new.last_reason,auth.uid()
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger beneficiary_case_lifecycle_event
after update of status on public.beneficiary_cases
for each row execute function app_private.capture_beneficiary_case_lifecycle_event();

create function app_private.beneficiary_case_closure_blockers(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'draft_requests',(select count(*) from public.assistance_requests r where r.case_id=p_case and r.status='draft'),
    'submitted_requests',(select count(*) from public.assistance_requests r where r.case_id=p_case and r.status='submitted'),
    'approved_without_delivery',(
      select count(*) from public.assistance_requests r
      where r.case_id=p_case and r.status='approved'
        and not exists(
          select 1 from public.assistance_distribution_deliveries d
          join public.assistance_entries a on a.id=d.assistance_id and a.status='recorded'
          where d.request_id=r.id and d.status='recorded'
        )
    ),
    'active_plans_without_delivery',(
      select count(*) from public.assistance_distribution_plans p
      where p.case_id=p_case and p.status<>'cancelled'
        and not exists(
          select 1 from public.assistance_distribution_deliveries d
          join public.assistance_entries a on a.id=d.assistance_id and a.status='recorded'
          where d.plan_id=p.id and d.status='recorded'
        )
    ),
    'pending_needs',(
      select count(*) from public.beneficiary_case_needs l
      join public.beneficiary_needs n on n.id=l.need_id
      where l.case_id=p_case and l.active and n.status in ('open','in_progress','needs_review')
    ),
    'scheduled_followups',(
      select count(*) from public.beneficiary_case_followups f
      where f.case_id=p_case and f.status='scheduled'
    ),
    'deliveries_without_completed_followup',(
      select count(*)
      from public.assistance_distribution_deliveries d
      join public.assistance_entries a on a.id=d.assistance_id and a.status='recorded'
      where d.case_id=p_case and d.status='recorded'
        and not exists(
          select 1 from public.beneficiary_case_followups f
          where f.case_id=p_case and f.assistance_id=d.assistance_id and f.status='completed'
        )
    )
  ) into result;
  return result || jsonb_build_object(
    'can_close',
      coalesce((result->>'draft_requests')::integer,0)=0
      and coalesce((result->>'submitted_requests')::integer,0)=0
      and coalesce((result->>'approved_without_delivery')::integer,0)=0
      and coalesce((result->>'active_plans_without_delivery')::integer,0)=0
      and coalesce((result->>'pending_needs')::integer,0)=0
      and coalesce((result->>'scheduled_followups')::integer,0)=0
      and coalesce((result->>'deliveries_without_completed_followup')::integer,0)=0
  );
end;
$$;

create function public.create_beneficiary_case_followup(
  p_id uuid,
  p_case uuid,
  p_need uuid,
  p_assistance uuid,
  p_type text,
  p_due_on date,
  p_reason text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases;existing public.beneficiary_case_followups;
begin
  if p_id is null then raise exception 'Follow-up ID required';end if;
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case follow-up permission required';end if;
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
    select 1 from public.beneficiary_case_needs l
    join public.beneficiary_needs n on n.id=l.need_id
    where l.case_id=c.id and l.need_id=p_need and l.active
      and n.project_id=c.project_id and n.person_id=c.person_id
  ) then raise exception 'Follow-up need must be actively linked to this beneficiary case';end if;

  if p_assistance is not null and not exists(
    select 1 from public.assistance_distribution_deliveries d
    join public.assistance_entries a on a.id=d.assistance_id
    where d.assistance_id=p_assistance and d.case_id=c.id and d.project_id=c.project_id and d.person_id=c.person_id
      and d.status='recorded' and a.status='recorded'
  ) then raise exception 'Follow-up assistance must be a recorded delivery for this beneficiary case';end if;

  insert into public.beneficiary_case_followups(
    id,case_id,organization_id,project_id,person_id,need_id,assistance_id,
    followup_type,due_on,last_reason,created_by,updated_by
  ) values(
    p_id,c.id,c.organization_id,c.project_id,c.person_id,p_need,p_assistance,
    p_type,p_due_on,trim(p_reason),auth.uid(),auth.uid()
  );
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'beneficiary_case_followup_scheduled',jsonb_build_object(
    'followup',p_id,'case',c.id,'need',p_need,'assistance',p_assistance,'due_on',p_due_on,'type',p_type
  ));
  return p_id;
end;
$$;

create function public.complete_beneficiary_case_followup(
  p_id uuid,
  p_outcome text,
  p_observations text,
  p_feedback text,
  p_next_action text,
  p_next_follow_up date,
  p_need_status text,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare f public.beneficiary_case_followups;c public.beneficiary_cases;n public.beneficiary_needs;
begin
  select * into f from public.beneficiary_case_followups where id=p_id;
  if not found or not app_private.can_manage_project(f.project_id) then raise exception 'Beneficiary case follow-up permission required';end if;
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
    if n.id is null or n.project_id<>f.project_id or n.person_id<>f.person_id
      or not exists(select 1 from public.beneficiary_case_needs l where l.case_id=f.case_id and l.need_id=f.need_id and l.active)
    then raise exception 'Follow-up assessed need is no longer active in this beneficiary case';end if;
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
        update public.beneficiary_needs set
          status=p_need_status,
          follow_up_on=p_next_follow_up,
          version=version+1,
          last_reason='Follow-up outcome: '||trim(p_reason),
          updated_by=auth.uid(),updated_at=now()
        where id=n.id;
      elsif n.follow_up_on is distinct from p_next_follow_up then
        update public.beneficiary_needs set
          follow_up_on=p_next_follow_up,
          version=version+1,
          last_reason='Follow-up schedule: '||trim(p_reason),
          updated_by=auth.uid(),updated_at=now()
        where id=n.id;
      end if;
    end if;
  end if;

  update public.beneficiary_case_followups set
    status='completed',outcome_status=p_outcome,observations=trim(p_observations),
    beneficiary_feedback=nullif(trim(coalesce(p_feedback,'')),''),next_action=trim(p_next_action),
    next_follow_up_on=p_next_follow_up,last_reason=trim(p_reason),version=version+1,
    updated_by=auth.uid(),updated_at=now(),completed_by=auth.uid(),completed_at=now()
  where id=p_id;

  if p_next_follow_up is not null then
    insert into public.beneficiary_case_followups(
      id,case_id,organization_id,project_id,person_id,need_id,assistance_id,parent_followup_id,
      followup_type,due_on,last_reason,created_by,updated_by
    ) values(
      gen_random_uuid(),f.case_id,f.organization_id,f.project_id,f.person_id,f.need_id,f.assistance_id,f.id,
      f.followup_type,p_next_follow_up,'Scheduled from completed follow-up '||f.id::text,auth.uid(),auth.uid()
    );
  end if;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),f.organization_id,'beneficiary_case_followup_completed',jsonb_build_object(
    'followup',f.id,'case',f.case_id,'need',f.need_id,'assistance',f.assistance_id,
    'outcome',p_outcome,'next_follow_up_on',p_next_follow_up,'need_status',p_need_status
  ));
end;
$$;

create function public.cancel_beneficiary_case_followup(
  p_id uuid,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare f public.beneficiary_case_followups;c public.beneficiary_cases;
begin
  select * into f from public.beneficiary_case_followups where id=p_id;
  if not found or not app_private.can_manage_project(f.project_id) then raise exception 'Beneficiary case follow-up permission required';end if;
  select * into c from public.beneficiary_cases where id=f.case_id for update;
  select * into f from public.beneficiary_case_followups where id=p_id for update;
  if f.version is distinct from p_version then raise exception 'Follow-up changed. Reload before cancellation.';end if;
  if f.status<>'scheduled' then raise exception 'Only a scheduled follow-up can be cancelled';end if;
  if c.status='closed' then raise exception 'Closed cases cannot change follow-up schedules';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Follow-up cancellation reason required';end if;

  update public.beneficiary_case_followups set
    status='cancelled',last_reason=trim(p_reason),version=version+1,
    updated_by=auth.uid(),updated_at=now(),cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=trim(p_reason)
  where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),f.organization_id,'beneficiary_case_followup_cancelled',jsonb_build_object('followup',f.id,'case',f.case_id,'previous_version',p_version));
end;
$$;

create function public.beneficiary_case_followup_queue(
  p_organization uuid default null,
  p_project uuid default null,
  p_status text default null,
  p_type text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;lim integer:=least(greatest(coalesce(p_limit,100),1),200);today date:=(now() at time zone 'UTC')::date;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_organization is not null and not app_private.can_manage_surveys() and not app_private.ngo_admin(p_organization) and not exists(
    select 1 from public.survey_projects sp where sp.organization_id=p_organization and app_private.can_manage_project(sp.id)
  ) then raise exception 'Beneficiary case follow-up permission required';end if;
  if p_project is not null and not app_private.can_manage_project(p_project) then raise exception 'Beneficiary case follow-up permission required';end if;
  if p_status is not null and p_status not in ('scheduled','completed','cancelled') then raise exception 'Valid follow-up status filter required';end if;
  if p_type is not null and p_type not in ('phone','field_visit','office_visit','partner_feedback','document_review','other') then raise exception 'Valid follow-up type filter required';end if;
  if p_due_from is not null and (not isfinite(p_due_from) or p_due_from<'1900-01-01'::date) then raise exception 'Valid follow-up start date required';end if;
  if p_due_to is not null and (not isfinite(p_due_to) or p_due_to<'1900-01-01'::date) then raise exception 'Valid follow-up end date required';end if;
  if p_due_from is not null and p_due_to is not null and p_due_to<p_due_from then raise exception 'Follow-up end date must be on or after start date';end if;

  with visible_projects as (
    select sp.id,sp.organization_id from public.survey_projects sp
    where app_private.can_manage_project(sp.id)
      and (p_organization is null or sp.organization_id=p_organization)
      and (p_project is null or sp.id=p_project)
  ), visible as (
    select f.* from public.beneficiary_case_followups f
    join visible_projects vp on vp.id=f.project_id
    where (p_status is null or f.status=p_status)
      and (p_type is null or f.followup_type=p_type)
      and (p_due_from is null or f.due_on>=p_due_from)
      and (p_due_to is null or f.due_on<=p_due_to)
  ), limited as (
    select * from visible
    order by case when status='scheduled' and due_on<today then 0 when status='scheduled' and due_on=today then 1 when status='scheduled' then 2 when status='completed' then 3 else 4 end,
      due_on,updated_at desc,id
    limit lim
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'case_id',f.case_id,'parent_followup_id',f.parent_followup_id,'case_no',c.case_no,'organization_id',f.organization_id,'organization_name',o.name,
      'project_id',f.project_id,'project_title',sp.title,'person_id',f.person_id,'beneficiary_name',rp.full_name,'registry_no',rp.registry_no,
      'need_id',f.need_id,'assistance_id',f.assistance_id,'followup_type',f.followup_type,'due_on',f.due_on,'status',f.status,
      'outcome_status',f.outcome_status,'next_follow_up_on',f.next_follow_up_on,'next_action',f.next_action,'version',f.version,'updated_at',f.updated_at
    ) order by case when f.status='scheduled' and f.due_on<today then 0 when f.status='scheduled' and f.due_on=today then 1 when f.status='scheduled' then 2 when f.status='completed' then 3 else 4 end,f.due_on,f.updated_at desc,f.id)
      from limited f
      join public.beneficiary_cases c on c.id=f.case_id
      join public.organizations o on o.id=f.organization_id
      join public.survey_projects sp on sp.id=f.project_id
      join public.registry_persons rp on rp.id=f.person_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'scheduled',(select count(*) from public.beneficiary_case_followups f join visible_projects vp on vp.id=f.project_id where f.status='scheduled'),
      'overdue',(select count(*) from public.beneficiary_case_followups f join visible_projects vp on vp.id=f.project_id where f.status='scheduled' and f.due_on<today),
      'due_today',(select count(*) from public.beneficiary_case_followups f join visible_projects vp on vp.id=f.project_id where f.status='scheduled' and f.due_on=today),
      'upcoming',(select count(*) from public.beneficiary_case_followups f join visible_projects vp on vp.id=f.project_id where f.status='scheduled' and f.due_on>today),
      'completed',(select count(*) from public.beneficiary_case_followups f join visible_projects vp on vp.id=f.project_id where f.status='completed'),
      'cancelled',(select count(*) from public.beneficiary_case_followups f join visible_projects vp on vp.id=f.project_id where f.status='cancelled')
    ),
    'utc_today',today,
    'limit',lim
  ) into result;
  return result;
end;
$$;

create function public.close_beneficiary_case(
  p_case uuid,
  p_category text,
  p_summary text,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases;blockers jsonb;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  -- Lock current delivered-assistance rows before the case so correction/void uses the same order.
  perform a.id from public.assistance_distribution_deliveries d
  join public.assistance_entries a on a.id=d.assistance_id
  where d.case_id=p_case and d.status='recorded' and a.status='recorded'
  order by a.id for update of a;
  select * into c from public.beneficiary_cases where id=p_case for update;
  if c.version is distinct from p_version then raise exception 'Beneficiary case changed. Reload before closure.';end if;
  if c.status='closed' then raise exception 'Beneficiary case is already closed';end if;
  if p_category is null or p_category not in ('needs_resolved','referred_out','beneficiary_declined','unable_to_contact','duplicate_case','no_longer_eligible','administrative_closure','other')
    or p_summary is null or length(trim(p_summary)) not between 10 and 2000
    or p_reason is null or length(trim(p_reason)) not between 5 and 2000
  then raise exception 'Valid closure category, summary and reason required';end if;

  blockers:=app_private.beneficiary_case_closure_blockers(p_case);
  if not coalesce((blockers->>'can_close')::boolean,false) then
    raise exception 'Case closure blocked by unresolved operational work: %',blockers::text;
  end if;

  update public.beneficiary_cases set
    status='closed',follow_up_on=null,
    closure_category=p_category,closure_summary=trim(p_summary),closure_reason=trim(p_reason),
    closed_by=auth.uid(),closed_at=now(),last_reason=trim(p_reason),version=version+1,
    updated_by=auth.uid(),updated_at=now()
  where id=p_case;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'beneficiary_case_closed',jsonb_build_object('case',p_case,'category',p_category,'previous_version',p_version));
end;
$$;

create function public.reopen_beneficiary_case(
  p_case uuid,
  p_reason text,
  p_version integer
) returns void
language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  select * into c from public.beneficiary_cases where id=p_case for update;
  if c.version is distinct from p_version then raise exception 'Beneficiary case changed. Reload before reopening.';end if;
  if c.status<>'closed' then raise exception 'Only a closed beneficiary case can be reopened';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Case reopening reason required';end if;
  if not exists(select 1 from public.organizations where id=c.organization_id and status='active') then raise exception 'Active NGO required before reopening beneficiary case';end if;

  update public.beneficiary_cases set
    status='open',closure_category=null,closure_summary=null,closure_reason=null,closed_by=null,closed_at=null,
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_case;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'beneficiary_case_reopened',jsonb_build_object('case',p_case,'previous_version',p_version));
end;
$$;

-- Backward-compatible case editor. Existing callers may still request a close/reopen via this RPC,
-- but closure now uses the 2.19.3 blocker rules and lifecycle history. New UI uses dedicated close/reopen RPCs.
create or replace function public.update_beneficiary_case(
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
declare c public.beneficiary_cases;blockers jsonb;category text;closure_summary_value text;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  if p_status='closed' and c.status<>'closed' then
    perform a.id from public.assistance_distribution_deliveries d
    join public.assistance_entries a on a.id=d.assistance_id
    where d.case_id=p_case and d.status='recorded' and a.status='recorded'
    order by a.id for update of a;
  end if;
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

  if p_status='closed' and c.status<>'closed' then
    blockers:=app_private.beneficiary_case_closure_blockers(p_case);
    if not coalesce((blockers->>'can_close')::boolean,false) then
      if coalesce((blockers->>'draft_requests')::integer,0)>0 or coalesce((blockers->>'submitted_requests')::integer,0)>0 or coalesce((blockers->>'approved_without_delivery')::integer,0)>0 then
        raise exception 'Resolve draft, submitted or undelivered approved assistance requests before closing the case';
      elsif coalesce((blockers->>'pending_needs')::integer,0)>0 then
        raise exception 'Resolve or unlink pending assessed needs before closing the case';
      else
        raise exception 'Resolve scheduled follow-ups and complete post-delivery outcomes before closing the case';
      end if;
    end if;
    category:='administrative_closure';closure_summary_value:=trim(p_reason);
  elsif c.status='closed' and p_status<>'closed' then
    if p_status<>'open' then raise exception 'Reopen a closed beneficiary case to open status before other status changes';end if;
    if not exists(select 1 from public.organizations where id=c.organization_id and status='active') then raise exception 'Active NGO required before reopening beneficiary case';end if;
  else
    category:=c.closure_category;closure_summary_value:=c.closure_summary;
  end if;

  update public.beneficiary_cases set
    title=trim(p_title),summary=trim(p_summary),priority=p_priority,status=p_status,follow_up_on=case when p_status='closed' then null else p_follow_up end,
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now(),
    closed_by=case when p_status='closed' then coalesce(c.closed_by,auth.uid()) else null end,
    closed_at=case when p_status='closed' then coalesce(c.closed_at,now()) else null end,
    closure_reason=case when p_status='closed' then trim(p_reason) else null end,
    closure_category=case when p_status='closed' then coalesce(category,'administrative_closure') else null end,
    closure_summary=case when p_status='closed' then coalesce(closure_summary_value,trim(p_reason)) else null end
  where id=p_case;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),c.organization_id,'beneficiary_case_updated',jsonb_build_object('case',p_case,'previous_version',p_version,'status',p_status));
end;
$$;

-- Corrections to a planned delivered-assistance row tied to a closed case require explicit reopening first.
-- This preserves the existing assistance ledger and need-review triggers while preventing a closed case from
-- silently becoming unresolved after the fact.
create or replace function public.void_assistance(p_id uuid,p_reason text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare entry public.assistance_entries;org uuid;linked_case uuid;case_state text;
begin
  select * into entry from public.assistance_entries where id=p_id for update;
  if not found or not app_private.can_review_survey(entry.project_id) then raise exception 'Assistance management permission required';end if;
  if entry.status<>'recorded' or entry.version is distinct from p_version then raise exception 'Entry changed or already void. Reload.';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Void reason required';end if;

  select d.case_id into linked_case
  from public.assistance_distribution_deliveries d
  where d.assistance_id=p_id and d.status='recorded'
  limit 1;
  if linked_case is not null then
    select c.status into case_state from public.beneficiary_cases c where c.id=linked_case for update;
    if case_state='closed' then raise exception 'Reopen the beneficiary case before voiding its recorded planned assistance';end if;
  end if;

  update public.assistance_entries set status='void',version=version+1,void_reason=trim(p_reason),voided_by=auth.uid(),voided_at=now() where id=p_id;
  select organization_id into org from public.survey_projects where id=entry.project_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),org,'assistance_voided',jsonb_build_object('id',p_id,'previous_version',p_version,'case',linked_case));
end;
$$;

create or replace function public.beneficiary_case_detail(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.beneficiary_cases;result jsonb;can_approve boolean;blockers jsonb;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  can_approve:=app_private.can_manage_surveys() or app_private.ngo_admin(c.organization_id);
  blockers:=app_private.beneficiary_case_closure_blockers(c.id);
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
    'deliveries',coalesce((select jsonb_agg(jsonb_build_object(
      'assistance_id',d.assistance_id,'plan_id',d.plan_id,'request_id',d.request_id,'status',d.status,'recorded_at',d.recorded_at,'voided_at',d.voided_at,
      'duplicate_override_used',d.duplicate_override_reason is not null,
      'kind',a.kind,'category',a.category,'program',a.program,'description',a.description,'amount_pkr',a.amount_pkr,'quantity',a.quantity,'unit',a.unit,
      'delivered_on',a.delivered_on,'funding_source',a.funding_source,'evidence_reference',a.evidence_reference,'next_eligible_on',a.next_eligible_on,
      'assistance_status',a.status,'void_reason',a.void_reason
    ) order by d.recorded_at desc,d.assistance_id)
      from public.assistance_distribution_deliveries d join public.assistance_entries a on a.id=d.assistance_id where d.case_id=c.id),'[]'::jsonb),
    'followups',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'parent_followup_id',f.parent_followup_id,'need_id',f.need_id,'assistance_id',f.assistance_id,'followup_type',f.followup_type,'due_on',f.due_on,'status',f.status,
      'outcome_status',f.outcome_status,'observations',f.observations,'beneficiary_feedback',f.beneficiary_feedback,'next_action',f.next_action,
      'next_follow_up_on',f.next_follow_up_on,'last_reason',f.last_reason,'version',f.version,'created_at',f.created_at,'updated_at',f.updated_at,
      'completed_at',f.completed_at,'cancelled_at',f.cancelled_at,'cancellation_reason',f.cancellation_reason
    ) order by case f.status when 'scheduled' then 0 when 'completed' then 1 else 2 end,f.due_on desc,f.updated_at desc,f.id)
      from public.beneficiary_case_followups f where f.case_id=c.id),'[]'::jsonb),
    'case_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.version desc) from (select * from public.beneficiary_case_revisions where case_id=c.id order by version desc limit 25) x),'[]'::jsonb),
    'lifecycle_history',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'event_type',e.event_type,'case_version',e.case_version,'closure_category',e.closure_category,'summary',e.summary,'reason',e.reason,'actor_id',e.actor_id,'recorded_at',e.recorded_at
    ) order by e.recorded_at desc,e.id desc) from public.beneficiary_case_lifecycle_events e where e.case_id=c.id),'[]'::jsonb),
    'closure_eligibility',blockers,
    'can_approve_requests',can_approve
  ) into result;
  return result;
end;
$$;

alter table public.beneficiary_case_followups enable row level security;
alter table public.beneficiary_case_followup_revisions enable row level security;
alter table public.beneficiary_case_lifecycle_events enable row level security;

revoke all on public.beneficiary_case_followups,public.beneficiary_case_followup_revisions,public.beneficiary_case_lifecycle_events from public,anon,authenticated;
grant all on public.beneficiary_case_followups,public.beneficiary_case_followup_revisions,public.beneficiary_case_lifecycle_events to service_role;

revoke all on function app_private.capture_beneficiary_case_followup_revision(),app_private.capture_beneficiary_case_lifecycle_event(),app_private.beneficiary_case_closure_blockers(uuid) from public,anon,authenticated;
revoke all on function public.create_beneficiary_case_followup(uuid,uuid,uuid,uuid,text,date,text),public.complete_beneficiary_case_followup(uuid,text,text,text,text,date,text,text,integer),public.cancel_beneficiary_case_followup(uuid,text,integer),public.beneficiary_case_followup_queue(uuid,uuid,text,text,date,date,integer),public.close_beneficiary_case(uuid,text,text,text,integer),public.reopen_beneficiary_case(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.create_beneficiary_case_followup(uuid,uuid,uuid,uuid,text,date,text),public.complete_beneficiary_case_followup(uuid,text,text,text,text,date,text,text,integer),public.cancel_beneficiary_case_followup(uuid,text,integer),public.beneficiary_case_followup_queue(uuid,uuid,text,text,date,date,integer),public.close_beneficiary_case(uuid,text,text,text,integer),public.reopen_beneficiary_case(uuid,text,integer) to authenticated;
