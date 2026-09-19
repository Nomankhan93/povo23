-- POEM 2.19.2 — Assistance Ledger & Duplicate-Support Controls
-- Existing assistance_entries remains the authoritative delivered-assistance ledger.
-- This phase links ready distribution plans to that ledger and adds canonical-identity
-- duplicate-support checks without exposing protected cross-NGO assistance details.

create table public.assistance_distribution_deliveries (
  assistance_id uuid primary key references public.assistance_entries(id),
  plan_id uuid not null references public.assistance_distribution_plans(id),
  request_id uuid not null references public.assistance_requests(id),
  case_id uuid not null references public.beneficiary_cases(id),
  need_id uuid not null references public.beneficiary_needs(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  person_id uuid not null references public.registry_persons(id),
  duplicate_snapshot jsonb not null check(jsonb_typeof(duplicate_snapshot)='object'),
  duplicate_override_reason text,
  status text not null default 'recorded' check(status in ('recorded','void')),
  recorded_by uuid not null references public.accounts(id),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  check(duplicate_override_reason is null or length(duplicate_override_reason) between 10 and 2000),
  foreign key(assistance_id,project_id,person_id) references public.assistance_entries(id,project_id,person_id),
  foreign key(need_id,project_id,person_id) references public.beneficiary_needs(id,project_id,person_id),
  check(
    (status='recorded' and voided_at is null)
    or (status='void' and voided_at is not null)
  )
);

create unique index assistance_distribution_one_recorded_delivery_per_plan
  on public.assistance_distribution_deliveries(plan_id)
  where status='recorded';
create unique index assistance_distribution_one_recorded_delivery_per_request
  on public.assistance_distribution_deliveries(request_id)
  where status='recorded';
create index assistance_distribution_delivery_scope
  on public.assistance_distribution_deliveries(organization_id,project_id,status,recorded_at desc,assistance_id);
create index assistance_distribution_delivery_case
  on public.assistance_distribution_deliveries(case_id,status,recorded_at desc,assistance_id);

create function app_private.assistance_duplicate_evaluation(p_plan uuid,p_delivered date)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare p public.assistance_distribution_plans;r public.assistance_requests;cid uuid;result jsonb;
begin
  select * into p from public.assistance_distribution_plans where id=p_plan;
  if p.id is null then raise exception 'Distribution plan not found';end if;
  select * into r from public.assistance_requests where id=p.request_id;
  if r.id is null then raise exception 'Assistance request not found';end if;
  select canonical_person_id into cid from public.canonical_person_links where project_person_id=p.person_id;
  if cid is null then raise exception 'Canonical beneficiary identity required before duplicate-support review';end if;

  with candidates as (
    select
      a.id assistance_id,a.project_id,sp.organization_id,o.name organization_name,sp.title project_title,
      a.kind,a.category,a.program,a.description,a.amount_pkr,a.quantity,a.unit,a.delivered_on,a.next_eligible_on,
      app_private.can_manage_project(a.project_id) visible,
      (
        a.delivered_on=p_delivered and a.kind=r.kind and
        (
          (r.kind='cash' and a.amount_pkr is not distinct from r.requested_amount_pkr)
          or
          (r.kind in ('goods','service') and a.quantity is not distinct from r.requested_quantity and lower(coalesce(a.unit,''))=lower(coalesce(r.requested_unit,'')))
        )
      ) exact_same_day,
      (a.next_eligible_on is not null and p_delivered<a.next_eligible_on) eligibility_overlap,
      (a.delivered_on between (p_delivered-30) and (p_delivered+30)) recent_same_category
    from public.assistance_entries a
    join public.canonical_person_links l on l.project_person_id=a.person_id
    join public.survey_projects sp on sp.id=a.project_id
    join public.organizations o on o.id=sp.organization_id
    where l.canonical_person_id=cid
      and a.status='recorded'
      and a.category=r.category
  ), classified as (
    select *, (exact_same_day or eligibility_overlap) blocking from candidates
  )
  select jsonb_build_object(
    'canonical_person_id',cid,
    'blocking_count',count(*) filter(where blocking),
    'visible_blocking_count',count(*) filter(where blocking and visible),
    'protected_blocking_count',count(*) filter(where blocking and not visible),
    'recent_count',count(*) filter(where recent_same_category),
    'visible_matches',coalesce(jsonb_agg(jsonb_build_object(
      'assistance_id',assistance_id,
      'project_id',project_id,
      'organization_id',organization_id,
      'organization_name',organization_name,
      'project_title',project_title,
      'kind',kind,
      'category',category,
      'program',program,
      'description',description,
      'amount_pkr',amount_pkr,
      'quantity',quantity,
      'unit',unit,
      'delivered_on',delivered_on,
      'next_eligible_on',next_eligible_on,
      'exact_same_day',exact_same_day,
      'eligibility_overlap',eligibility_overlap,
      'recent_same_category',recent_same_category,
      'blocking',blocking
    ) order by delivered_on desc,assistance_id) filter(where visible and (blocking or recent_same_category)),'[]'::jsonb),
    'all_matches',coalesce(jsonb_agg(jsonb_build_object(
      'assistance_id',assistance_id,
      'project_id',project_id,
      'organization_id',organization_id,
      'organization_name',organization_name,
      'project_title',project_title,
      'kind',kind,
      'category',category,
      'program',program,
      'description',description,
      'amount_pkr',amount_pkr,
      'quantity',quantity,
      'unit',unit,
      'delivered_on',delivered_on,
      'next_eligible_on',next_eligible_on,
      'exact_same_day',exact_same_day,
      'eligibility_overlap',eligibility_overlap,
      'recent_same_category',recent_same_category,
      'blocking',blocking,
      'visible_to_actor',visible
    ) order by delivered_on desc,assistance_id) filter(where blocking or recent_same_category),'[]'::jsonb)
  ) into result
  from classified;

  return coalesce(result,jsonb_build_object(
    'canonical_person_id',cid,'blocking_count',0,'visible_blocking_count',0,'protected_blocking_count',0,
    'recent_count',0,'visible_matches','[]'::jsonb,'all_matches','[]'::jsonb
  ));
end;
$$;

create function public.assistance_duplicate_support_preview(p_plan uuid,p_delivered date)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare p public.assistance_distribution_plans;r public.assistance_requests;e jsonb;blocking integer;protected integer;can_override boolean;
begin
  select * into p from public.assistance_distribution_plans where id=p_plan;
  if p.id is null or not app_private.can_manage_project(p.project_id) then raise exception 'Assistance delivery permission required';end if;
  if p.status<>'ready' then raise exception 'Distribution plan must be ready before delivery review';end if;
  select * into r from public.assistance_requests where id=p.request_id;
  if r.id is null or r.status<>'approved' then raise exception 'Assistance request must remain approved before delivery';end if;
  if p_delivered is null or p_delivered<'1900-01-01'::date or p_delivered>(now() at time zone 'UTC')::date then raise exception 'Valid delivery date required';end if;

  e:=app_private.assistance_duplicate_evaluation(p.id,p_delivered);
  blocking:=coalesce((e->>'blocking_count')::integer,0);
  protected:=coalesce((e->>'protected_blocking_count')::integer,0);
  can_override:=app_private.can_manage_surveys() or (app_private.ngo_admin(p.organization_id) and protected=0);

  return jsonb_build_object(
    'plan_id',p.id,
    'request_id',p.request_id,
    'category',r.category,
    'kind',r.kind,
    'delivered_on',p_delivered,
    'blocking_count',blocking,
    'visible_blocking_count',coalesce((e->>'visible_blocking_count')::integer,0),
    'protected_blocking_count',protected,
    'recent_count',coalesce((e->>'recent_count')::integer,0),
    'visible_matches',coalesce(e->'visible_matches','[]'::jsonb),
    'poem_review_required',protected>0 and not app_private.can_manage_surveys(),
    'can_override',can_override,
    'override_required',blocking>0
  );
end;
$$;

create function public.record_assistance_distribution_delivery(
  p_plan uuid,
  p_assistance uuid,
  p_description text,
  p_delivered date,
  p_funding text,
  p_evidence text,
  p_next date,
  p_duplicate_override_reason text,
  p_plan_version integer
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  p public.assistance_distribution_plans;
  r public.assistance_requests;
  c public.beneficiary_cases;
  n public.beneficiary_needs;
  person public.registry_persons;
  existing_entry public.assistance_entries;
  existing_delivery public.assistance_distribution_deliveries;
  cid uuid;
  evaluation jsonb;
  blocking integer;
  protected integer;
  override_reason text:=nullif(trim(coalesce(p_duplicate_override_reason,'')),'');
begin
  if p_assistance is null then raise exception 'Assistance ledger ID required';end if;

  select * into p from public.assistance_distribution_plans where id=p_plan;
  if p.id is null or not app_private.can_manage_project(p.project_id) then raise exception 'Assistance delivery permission required';end if;

  select * into existing_delivery from public.assistance_distribution_deliveries where assistance_id=p_assistance;
  if found then
    select * into existing_entry from public.assistance_entries where id=p_assistance;
    if existing_delivery.plan_id=p_plan and existing_delivery.status='recorded' and existing_delivery.recorded_by=auth.uid()
      and existing_entry.delivered_on is not distinct from p_delivered
      and existing_entry.description is not distinct from trim(p_description)
      and existing_entry.funding_source is not distinct from trim(p_funding)
      and existing_entry.evidence_reference is not distinct from trim(p_evidence)
      and existing_entry.next_eligible_on is not distinct from p_next
    then return p_assistance;end if;
    raise exception 'Assistance ledger ID already used with different delivery details';
  end if;
  if exists(select 1 from public.assistance_entries where id=p_assistance) then raise exception 'Assistance ledger ID already exists outside this distribution plan';end if;

  if p_description is null or length(trim(p_description)) not between 3 and 1000
    or p_funding is null or length(trim(p_funding)) not between 2 and 200
    or p_evidence is null or length(trim(p_evidence)) not between 3 and 500
  then raise exception 'Delivery description, funding source and evidence reference required';end if;
  if p_delivered is null or p_delivered<'1900-01-01'::date or p_delivered>(now() at time zone 'UTC')::date
    or (p_next is not null and p_next<p_delivered)
  then raise exception 'Valid delivery and next eligibility dates required';end if;

  select * into p from public.assistance_distribution_plans where id=p_plan for update;
  if p.version is distinct from p_plan_version then raise exception 'Distribution plan changed. Reload before recording delivery.';end if;
  if p.status<>'ready' then raise exception 'Distribution plan must be ready before recording delivery';end if;
  if exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=p.id and d.status='recorded') then raise exception 'Distribution plan already has a recorded assistance delivery';end if;
  if exists(select 1 from public.assistance_distribution_deliveries d where d.request_id=p.request_id and d.status='recorded') then raise exception 'Assistance request already has a recorded delivery';end if;

  select * into r from public.assistance_requests where id=p.request_id for update;
  if r.id is null or r.status<>'approved' then raise exception 'Assistance request must remain approved before delivery';end if;
  if r.case_id<>p.case_id or r.need_id<>p.need_id or r.project_id<>p.project_id or r.person_id<>p.person_id or r.organization_id<>p.organization_id then raise exception 'Distribution plan lineage no longer matches the approved assistance request';end if;

  select * into c from public.beneficiary_cases where id=p.case_id for update;
  if c.id is null or c.status<>'open' then raise exception 'Beneficiary case must be open before recording delivery';end if;
  if c.project_id<>p.project_id or c.person_id<>p.person_id or c.organization_id<>p.organization_id then raise exception 'Distribution plan scope no longer matches beneficiary case';end if;

  select * into n from public.beneficiary_needs where id=p.need_id for update;
  if n.id is null or n.project_id<>p.project_id or n.person_id<>p.person_id or n.status='closed' then raise exception 'Assessed need must remain active before recording delivery';end if;
  if not exists(select 1 from public.beneficiary_case_needs l where l.case_id=p.case_id and l.need_id=p.need_id and l.active) then raise exception 'Assessed need is no longer active in this beneficiary case';end if;

  select * into person from public.registry_persons where id=p.person_id;
  if person.id is null or person.project_id<>p.project_id then raise exception 'Beneficiary registry record unavailable';end if;
  if not exists(select 1 from public.organizations where id=p.organization_id and status='active') then raise exception 'Active NGO required before recording assistance delivery';end if;

  select canonical_person_id into cid from public.canonical_person_links where project_person_id=p.person_id;
  if cid is null then raise exception 'Canonical beneficiary identity required before recording delivery';end if;
  perform cp.id from public.canonical_persons cp where cp.id=cid and cp.identity_status<>'merged' for update of cp;
  if not found then raise exception 'Active canonical beneficiary identity required before recording delivery';end if;

  evaluation:=app_private.assistance_duplicate_evaluation(p.id,p_delivered);
  blocking:=coalesce((evaluation->>'blocking_count')::integer,0);
  protected:=coalesce((evaluation->>'protected_blocking_count')::integer,0);

  if blocking>0 then
    if override_reason is null or length(override_reason) not between 10 and 2000 then
      raise exception 'Duplicate-support review required before recording delivery; provide an authorized override reason';
    end if;
    if not app_private.can_manage_surveys() and not app_private.ngo_admin(p.organization_id) then
      raise exception 'NGO Admin or POEM duplicate-support override required';
    end if;
    if protected>0 and not app_private.can_manage_surveys() then
      raise exception 'POEM duplicate-support review required because protected cross-project support conflicts exist';
    end if;
  else
    override_reason:=null;
  end if;

  insert into public.assistance_entries(
    id,project_id,person_id,kind,category,program,description,amount_pkr,quantity,unit,
    delivered_on,funding_source,evidence_reference,next_eligible_on,identity_snapshot,created_by
  ) values(
    p_assistance,p.project_id,p.person_id,r.kind,r.category,r.program,trim(p_description),r.requested_amount_pkr,r.requested_quantity,r.requested_unit,
    p_delivered,trim(p_funding),trim(p_evidence),p_next,to_jsonb(person),auth.uid()
  );

  insert into public.assistance_distribution_deliveries(
    assistance_id,plan_id,request_id,case_id,need_id,organization_id,project_id,person_id,
    duplicate_snapshot,duplicate_override_reason,recorded_by
  ) values(
    p_assistance,p.id,p.request_id,p.case_id,p.need_id,p.organization_id,p.project_id,p.person_id,
    evaluation,override_reason,auth.uid()
  );

  insert into public.need_assistance_links(need_id,assistance_id,active,reason,updated_by)
  values(p.need_id,p_assistance,true,'Delivered assistance recorded from distribution plan DP-'||p.plan_no::text,auth.uid());
  update public.beneficiary_needs
  set status=case when status='open' then 'in_progress' else status end,
      version=version+1,
      last_reason='Assistance linked: delivered from distribution plan DP-'||p.plan_no::text,
      updated_by=auth.uid(),updated_at=now()
  where id=p.need_id;

  update public.assistance_distribution_plans
  set version=version+1,
      last_reason='Delivered assistance recorded in assistance ledger: '||p_assistance::text,
      updated_by=auth.uid(),updated_at=now()
  where id=p.id;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'assistance_recorded',jsonb_build_object('id',p_assistance,'person',p.person_id,'project',p.project_id,'distribution_plan',p.id));
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'assistance_distribution_delivered',jsonb_build_object(
    'assistance',p_assistance,'plan',p.id,'request',p.request_id,'case',p.case_id,'need',p.need_id,
    'duplicate_blocking_count',blocking,'protected_blocking_count',protected,'override_used',override_reason is not null
  ));
  return p_assistance;
end;
$$;

create function app_private.sync_assistance_distribution_delivery_void()
returns trigger language plpgsql security definer set search_path='' as $$
declare d public.assistance_distribution_deliveries;p public.assistance_distribution_plans;
begin
  if old.status='recorded' and new.status='void' then
    update public.assistance_distribution_deliveries
    set status='void',voided_at=coalesce(new.voided_at,now())
    where assistance_id=new.id and status='recorded'
    returning * into d;
    if d.assistance_id is not null then
      select * into p from public.assistance_distribution_plans where id=d.plan_id for update;
      if p.id is not null then
        update public.assistance_distribution_plans
        set version=version+1,
            last_reason='Linked assistance entry was voided; review duplicate controls before recording a correction.',
            updated_by=coalesce(new.voided_by,p.updated_by),updated_at=now()
        where id=p.id;
        insert into public.audit_events(actor_id,organization_id,action,detail)
        values(new.voided_by,d.organization_id,'assistance_distribution_delivery_voided',jsonb_build_object('assistance',new.id,'plan',d.plan_id,'request',d.request_id));
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger assistance_distribution_delivery_void_sync
after update of status on public.assistance_entries
for each row execute function app_private.sync_assistance_distribution_delivery_void();

-- Once assistance is actually recorded, the operational plan is historical provenance.
-- It may only be cancelled after the linked ledger record has first been voided.
create or replace function public.cancel_assistance_distribution_plan(
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
  if exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=p.id and d.status='recorded') then raise exception 'Void the recorded assistance entry before cancelling this delivered distribution plan';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Distribution-plan cancellation reason required';end if;
  select * into r from public.assistance_requests where id=p.request_id for update;

  update public.assistance_distribution_plans set
    status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=trim(p_reason),
    last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'assistance_distribution_plan_cancelled',jsonb_build_object('plan',p_id,'request',p.request_id,'previous_status',p.status,'previous_version',p_version));
end;
$$;

-- Keep legacy/unplanned assistance recording for genuine historical/emergency entries,
-- but do not let it bypass a ready controlled distribution plan or an exact replay.
create or replace function public.record_assistance(p_id uuid,p_person uuid,p_kind text,p_category text,p_program text,p_description text,p_amount numeric,p_quantity numeric,p_unit text,p_delivered date,p_funding text,p_evidence text,p_next date) returns uuid language plpgsql security definer set search_path='' as $$
declare person public.registry_persons;org uuid;existing public.assistance_entries;cid uuid;
begin
 select * into person from public.registry_persons where id=p_person;
 if not found or not app_private.can_review_survey(person.project_id) then raise exception 'Assistance management permission required';end if;
 select organization_id into org from public.survey_projects where id=person.project_id for update;
 -- Re-read after acquiring the same lock as identity corrections.
 select * into person from public.registry_persons where id=p_person;
 if not exists(select 1 from public.organizations where id=org and status='active') then raise exception 'Active NGO required';end if;
 if p_id is null then raise exception 'Request ID required';end if;
 select * into existing from public.assistance_entries where id=p_id;
 if found then
 if existing.created_by=auth.uid() and existing.person_id=p_person and existing.kind is not distinct from p_kind and existing.category is not distinct from p_category and existing.program is not distinct from trim(p_program) and existing.description is not distinct from trim(p_description) and existing.amount_pkr is not distinct from p_amount and existing.quantity is not distinct from p_quantity and existing.unit is not distinct from nullif(trim(p_unit),'') and existing.delivered_on is not distinct from p_delivered and existing.funding_source is not distinct from trim(p_funding) and existing.evidence_reference is not distinct from trim(p_evidence) and existing.next_eligible_on is not distinct from p_next then return existing.id;end if;
 raise exception 'Request ID already used with different details';end if;
 if not exists(select 1 from public.survey_responses where person_id=p_person and status='approved') then raise exception 'At least one approved survey is required before recording assistance';end if;
 if p_kind is null or p_kind not in ('cash','goods','service') or p_category is null or p_category not in ('food','education','health','housing','livelihood','other') or p_program is null or length(trim(p_program)) not between 2 and 150 or p_description is null or length(trim(p_description)) not between 3 and 1000 or p_funding is null or length(trim(p_funding)) not between 2 and 200 or p_evidence is null or length(trim(p_evidence)) not between 3 and 500 then raise exception 'Assistance details, funding source and evidence reference required';end if;
 if p_delivered is null or p_delivered<'1900-01-01'::date or p_delivered>(now() at time zone 'UTC')::date or (p_next is not null and p_next<p_delivered) then raise exception 'Valid delivery and next eligibility dates required';end if;
 if p_kind='cash' then
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>1000000000 or round(p_amount,2)<>p_amount or p_quantity is not null or nullif(trim(p_unit),'') is not null then raise exception 'Cash requires a positive PKR amount with at most two decimal places';end if;
 else
 if p_amount is not null or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<=0 or p_quantity>1000000 or round(p_quantity,3)<>p_quantity or p_unit is null or length(trim(p_unit)) not between 1 and 30 then raise exception 'Goods/services require quantity and unit, without cash amount';end if;
 end if;

 if exists(
  select 1 from public.assistance_distribution_plans dp
  join public.assistance_requests r on r.id=dp.request_id
  where dp.project_id=person.project_id and dp.person_id=p_person and dp.status='ready'
    and r.status='approved' and r.category=p_category
    and not exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=dp.id and d.status='recorded')
 ) then raise exception 'A ready distribution plan exists for this support category; record delivery from Beneficiary cases';end if;

 select canonical_person_id into cid from public.canonical_person_links where project_person_id=p_person;
 if cid is not null then
  perform cp.id from public.canonical_persons cp where cp.id=cid and cp.identity_status<>'merged' for update of cp;
  if exists(
    select 1 from public.assistance_entries a
    join public.canonical_person_links l on l.project_person_id=a.person_id
    where l.canonical_person_id=cid and a.status='recorded' and a.category=p_category
      and (
        (
          a.delivered_on=p_delivered and a.kind=p_kind
          and ((p_kind='cash' and a.amount_pkr is not distinct from p_amount)
            or (p_kind in ('goods','service') and a.quantity is not distinct from p_quantity and lower(coalesce(a.unit,''))=lower(coalesce(nullif(trim(p_unit),''),''))))
        )
        or (a.next_eligible_on is not null and p_delivered<a.next_eligible_on)
      )
  ) then raise exception 'Potential duplicate assistance detected; use the beneficiary case/request distribution workflow for reviewed duplicate support';end if;
 end if;

 insert into public.assistance_entries(id,project_id,person_id,kind,category,program,description,amount_pkr,quantity,unit,delivered_on,funding_source,evidence_reference,next_eligible_on,identity_snapshot,created_by)
 values(p_id,person.project_id,p_person,p_kind,p_category,trim(p_program),trim(p_description),p_amount,p_quantity,nullif(trim(p_unit),''),p_delivered,trim(p_funding),trim(p_evidence),p_next,to_jsonb(person),auth.uid());
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'assistance_recorded',jsonb_build_object('id',p_id,'person',p_person,'project',person.project_id,'mode','unplanned_or_historical'));return p_id;
end;$$;

create function public.assistance_ledger(
  p_organization uuid default null,
  p_project uuid default null,
  p_status text default null,
  p_category text default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;lim integer:=least(greatest(coalesce(p_limit,100),1),200);
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_organization is not null and not app_private.can_manage_surveys() and not app_private.ngo_admin(p_organization) and not exists(
    select 1 from public.survey_projects sp where sp.organization_id=p_organization and app_private.can_manage_project(sp.id)
  ) then raise exception 'Assistance ledger permission required';end if;
  if p_project is not null and not app_private.can_manage_project(p_project) then raise exception 'Assistance ledger permission required';end if;
  if p_status is not null and p_status not in ('recorded','void') then raise exception 'Valid assistance status filter required';end if;
  if p_category is not null and p_category not in ('food','education','health','housing','livelihood','other') then raise exception 'Valid assistance category filter required';end if;
  if p_from is not null and p_to is not null and p_to<p_from then raise exception 'Valid assistance date range required';end if;

  with visible_projects as (
    select sp.id,sp.organization_id from public.survey_projects sp
    where app_private.can_manage_project(sp.id)
      and (p_organization is null or sp.organization_id=p_organization)
      and (p_project is null or sp.id=p_project)
  ), filtered as (
    select a.* from public.assistance_entries a
    join visible_projects vp on vp.id=a.project_id
    where (p_status is null or a.status=p_status)
      and (p_category is null or a.category=p_category)
      and (p_from is null or a.delivered_on>=p_from)
      and (p_to is null or a.delivered_on<=p_to)
  ), limited as (
    select * from filtered order by delivered_on desc,created_at desc,id limit lim
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'organization_id',o.id,'organization_name',o.name,'project_id',a.project_id,'project_title',sp.title,
      'person_id',a.person_id,'beneficiary_name',rp.full_name,'registry_no',rp.registry_no,
      'kind',a.kind,'category',a.category,'program',a.program,'description',a.description,'amount_pkr',a.amount_pkr,'quantity',a.quantity,'unit',a.unit,
      'delivered_on',a.delivered_on,'funding_source',a.funding_source,'evidence_reference',a.evidence_reference,'next_eligible_on',a.next_eligible_on,
      'status',a.status,'version',a.version,'created_by',a.created_by,'created_at',a.created_at,'void_reason',a.void_reason,'voided_at',a.voided_at,
      'planned_delivery',d.assistance_id is not null,'distribution_plan_id',d.plan_id,'distribution_plan_no',dp.plan_no,
      'request_id',d.request_id,'request_no',ar.request_no,'case_id',d.case_id,'case_no',bc.case_no,
      'delivery_link_status',d.status,'duplicate_override_used',d.duplicate_override_reason is not null
    ) order by a.delivered_on desc,a.created_at desc,a.id)
      from limited a
      join public.survey_projects sp on sp.id=a.project_id
      join public.organizations o on o.id=sp.organization_id
      join public.registry_persons rp on rp.id=a.person_id
      left join public.assistance_distribution_deliveries d on d.assistance_id=a.id
      left join public.assistance_distribution_plans dp on dp.id=d.plan_id
      left join public.assistance_requests ar on ar.id=d.request_id
      left join public.beneficiary_cases bc on bc.id=d.case_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'total',(select count(*) from filtered),
      'recorded',(select count(*) from filtered where status='recorded'),
      'void',(select count(*) from filtered where status='void'),
      'planned',(select count(*) from filtered f where exists(select 1 from public.assistance_distribution_deliveries d where d.assistance_id=f.id)),
      'unplanned',(select count(*) from filtered f where not exists(select 1 from public.assistance_distribution_deliveries d where d.assistance_id=f.id))
    ),
    'limit',lim
  ) into result;
  return result;
end;
$$;

create or replace function public.assistance_distribution_plan_queue(
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
    order by case
      when exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=visible.id and d.status='recorded') then 3
      when status='ready' then 0 when status='scheduled' then 1 when status='draft' then 2 else 4 end,
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
      'scheduled_start',p.scheduled_start,'scheduled_end',p.scheduled_end,'status',p.status,'version',p.version,'updated_at',p.updated_at,
      'assistance_id',(select d.assistance_id from public.assistance_distribution_deliveries d where d.plan_id=p.id and d.status='recorded' order by d.recorded_at desc limit 1),
      'delivery_status',case when exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=p.id and d.status='recorded') then 'delivered' else 'not_recorded' end
    ) order by case
      when exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=p.id and d.status='recorded') then 3
      when p.status='ready' then 0 when p.status='scheduled' then 1 when p.status='draft' then 2 else 4 end,
      p.scheduled_start nulls last,p.updated_at desc,p.id)
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
      'ready_to_deliver',(select count(*) from public.assistance_distribution_plans p join visible_projects vp on vp.id=p.project_id where p.status='ready' and not exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=p.id and d.status='recorded')),
      'delivered',(select count(*) from public.assistance_distribution_plans p join visible_projects vp on vp.id=p.project_id where exists(select 1 from public.assistance_distribution_deliveries d where d.plan_id=p.id and d.status='recorded')),
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
    'deliveries',coalesce((select jsonb_agg(jsonb_build_object(
      'assistance_id',d.assistance_id,'plan_id',d.plan_id,'request_id',d.request_id,'status',d.status,'recorded_at',d.recorded_at,'voided_at',d.voided_at,
      'duplicate_override_used',d.duplicate_override_reason is not null,
      'kind',a.kind,'category',a.category,'program',a.program,'description',a.description,'amount_pkr',a.amount_pkr,'quantity',a.quantity,'unit',a.unit,
      'delivered_on',a.delivered_on,'funding_source',a.funding_source,'evidence_reference',a.evidence_reference,'next_eligible_on',a.next_eligible_on,
      'assistance_status',a.status,'void_reason',a.void_reason
    ) order by d.recorded_at desc,d.assistance_id)
      from public.assistance_distribution_deliveries d join public.assistance_entries a on a.id=d.assistance_id where d.case_id=c.id),'[]'::jsonb),
    'case_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.version desc) from (select * from public.beneficiary_case_revisions where case_id=c.id order by version desc limit 25) x),'[]'::jsonb),
    'can_approve_requests',can_approve
  ) into result;
  return result;
end;
$$;

alter table public.assistance_distribution_deliveries enable row level security;
revoke all on public.assistance_distribution_deliveries from public,anon,authenticated;
grant all on public.assistance_distribution_deliveries to service_role;

revoke all on function app_private.assistance_duplicate_evaluation(uuid,date),app_private.sync_assistance_distribution_delivery_void() from public,anon,authenticated;
revoke all on function public.assistance_duplicate_support_preview(uuid,date),public.record_assistance_distribution_delivery(uuid,uuid,text,date,text,text,date,text,integer),public.assistance_ledger(uuid,uuid,text,text,date,date,integer) from public,anon,authenticated;
grant execute on function public.assistance_duplicate_support_preview(uuid,date),public.record_assistance_distribution_delivery(uuid,uuid,text,date,text,text,date,text,integer),public.assistance_ledger(uuid,uuid,text,text,date,date,integer) to authenticated;
