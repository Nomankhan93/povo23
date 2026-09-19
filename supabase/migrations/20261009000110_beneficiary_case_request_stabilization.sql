-- POEM 2.19.0 validation stabilization
-- Forward-only correction after 20261009000100_beneficiary_cases_assistance_requests.sql.
-- Preserves the case/request schema and authorization model while serializing draft
-- assistance-request creation with case closure and assessed-need link changes.

create or replace function public.create_assistance_request(
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

  -- Serialize new request creation with case status and case-need membership changes.
  -- update_beneficiary_case() and set_beneficiary_case_need() already lock the case row first.
  select * into c from public.beneficiary_cases where id=p_case for update;
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

