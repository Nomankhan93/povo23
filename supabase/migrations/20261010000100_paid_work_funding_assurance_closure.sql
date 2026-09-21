-- FieldLance 2.26 — Paid Work Funding Assurance & Project Finance Closure
-- Adds an atomic operational funding gate and an explicit project-closure lifecycle.
-- Existing double-entry finance, payable units, and bridge reconciliation remain authoritative.

alter table public.survey_projects
  add column project_closure_state text not null default 'open'
    check(project_closure_state in ('open','collection_closed','operational_completed','financially_reconciled','fully_closed')),
  add column collection_closed_at timestamptz,
  add column operational_completed_at timestamptz,
  add column financially_reconciled_at timestamptz,
  add column fully_closed_at timestamptz,
  add column closure_note text not null default '' check(length(closure_note)<=1000);

create table public.project_funding_commitments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.survey_projects(id),
  organization_id uuid not null references public.organizations(id),
  opportunity_id uuid not null unique references public.work_opportunities(id),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  amount numeric(20,4) not null check(amount>0 and amount::text not in ('NaN','Infinity','-Infinity')),
  status text not null default 'pending' check(status in ('pending','active','released','settled')),
  reason text not null default '' check(length(reason)<=1000),
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.accounts(id),
  release_reason text not null default '' check(length(release_reason)<=1000),
  version integer not null default 1,
  check((status='released' and released_at is not null) or status<>'released')
);

create index project_funding_commitments_project on public.project_funding_commitments(project_id,currency,status,created_at);
create index project_funding_commitments_opportunity on public.project_funding_commitments(opportunity_id,status);
alter table public.project_funding_commitments enable row level security;
create policy project_funding_commitment_read on public.project_funding_commitments
  for select to authenticated using(app_private.can_read_finance(organization_id));
revoke all on public.project_funding_commitments from public,anon,authenticated;
grant select on public.project_funding_commitments to authenticated;
grant all on public.project_funding_commitments to service_role;

create function app_private.project_offer_exposure(p_project uuid,p_rate numeric,p_type text,p_required integer)
returns numeric language sql immutable set search_path='' as $$
  select round(coalesce(p_rate,0)::numeric * greatest(coalesce(p_required,0),1),4)
$$;

create function app_private.project_funding_coverage(p_project uuid,p_currency text)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare reserved_id uuid; reserved_balance numeric:=0; committed numeric:=0;
begin
  select id into reserved_id from public.finance_accounts
    where code=upper('PROJECT:'||p_project::text||':RESERVED:'||upper(trim(p_currency)));
  if reserved_id is not null then reserved_balance:=coalesce(app_private.finance_account_balance_raw(reserved_id),0); end if;
  select coalesce(sum(c.amount),0) into committed from public.project_funding_commitments c
    where c.project_id=p_project and c.currency=upper(trim(p_currency)) and c.status in ('pending','active');
  return reserved_balance-committed;
end;
$$;

create function app_private.guard_paid_opportunity_funding()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.survey_projects; exposure numeric; coverage numeric; commitment_id uuid;
begin
  if coalesce(new.payment_type,'unpaid')<>'paid' or new.survey_project_id is null or coalesce(new.publication_state,'published')<>'published' then return new; end if;
  select * into p from public.survey_projects where id=new.survey_project_id for update;
  if not found then raise exception 'Survey project required for paid opportunity'; end if;
  if p.work_mode<>'paid' or p.compensation_rate is null then raise exception 'Configure paid project compensation before publishing'; end if;
  if new.currency is null or new.rate is null then raise exception 'Structured compensation snapshot required for paid opportunity'; end if;
  -- Projects created before 2.26 remain compatible until an organization establishes
  -- a project reservation account. Once reservation exists, every new paid offer is gated.
  if not exists(select 1 from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':RESERVED:'||upper(new.currency))) then return new; end if;
  exposure:=app_private.project_offer_exposure(new.survey_project_id,new.rate,new.compensation_type,new.required_volunteers);
  coverage:=app_private.project_funding_coverage(new.survey_project_id,new.currency);
  if coverage<exposure then raise exception 'Insufficient funded coverage for paid opportunity (shortfall %)',round(exposure-coverage,4); end if;
  if tg_op='UPDATE' and old.publication_state='published' then return new; end if;
  return new;
end;
$$;

create trigger guard_paid_opportunity_funding
before insert or update of publication_state on public.work_opportunities
for each row execute function app_private.guard_paid_opportunity_funding();

create function app_private.create_paid_opportunity_commitment()
returns trigger language plpgsql security definer set search_path='' as $$
declare exposure numeric; commitment_id uuid;
begin
  if coalesce(new.payment_type,'unpaid')<>'paid' or new.survey_project_id is null or coalesce(new.publication_state,'published')<>'published' then return new; end if;
  if tg_op='UPDATE' and old.publication_state='published' then return new; end if;
  exposure:=app_private.project_offer_exposure(new.survey_project_id,new.rate,new.compensation_type,new.required_volunteers);
  if not exists(select 1 from public.project_funding_commitments c where c.opportunity_id=new.id) then
    insert into public.project_funding_commitments(project_id,organization_id,opportunity_id,currency,amount,status,reason,created_by)
    values(new.survey_project_id,new.organization_id,new.id,new.currency,exposure,'pending','Paid opportunity funding coverage',auth.uid()) returning id into commitment_id;
    insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),new.organization_id,'paid_opportunity_funding_committed',jsonb_build_object('opportunity',new.id,'project',new.survey_project_id,'amount',exposure,'currency',new.currency,'commitment',commitment_id));
  end if;
  return new;
end;
$$;

create trigger create_paid_opportunity_commitment
after insert or update of publication_state on public.work_opportunities
for each row execute function app_private.create_paid_opportunity_commitment();

create function app_private.sync_project_funding_commitment_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.opportunity_id is null then return new; end if;
  if new.status='offered' then
    update public.project_funding_commitments set status='active',version=version+1
      where opportunity_id=new.opportunity_id and status='pending';
  elsif new.status='declined' or new.status='cancelled' then
    if not exists(select 1 from public.work_assignments a where a.opportunity_id=new.opportunity_id and a.id<>new.id and a.status in ('offered','active','completed')) then
      update public.project_funding_commitments set status='released',released_at=now(),released_by=auth.uid(),release_reason='Assignment declined or cancelled',version=version+1
        where opportunity_id=new.opportunity_id and status in ('pending','active');
    end if;
  end if;
  return new;
end;
$$;

create trigger sync_project_funding_commitment_assignment
after insert or update of status on public.work_assignments
for each row execute function app_private.sync_project_funding_commitment_assignment();

create function public.release_project_funding_commitment(p_opportunity uuid,p_reason text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.project_funding_commitments; w public.work_opportunities; reason text:=trim(coalesce(p_reason,''));
begin
  if p_request is null then raise exception 'Funding commitment request key required'; end if;
  select * into w from public.work_opportunities where id=p_opportunity for update;
  if not found then raise exception 'Opportunity not found'; end if;
  if not app_private.can_manage_project_funding(w.survey_project_id) then raise exception 'Project funding management permission required'; end if;
  if length(reason) not between 3 and 1000 then raise exception 'Release reason is required'; end if;
  select * into c from public.project_funding_commitments where opportunity_id=p_opportunity for update;
  if not found then raise exception 'No funding commitment exists for this opportunity'; end if;
  if c.status in ('released','settled') then return c.id; end if;
  if exists(select 1 from public.work_assignments a where a.opportunity_id=p_opportunity and a.status in ('offered','active','completed')) then raise exception 'Active or completed assignment still uses this funding commitment'; end if;
  update public.project_funding_commitments set status='released',released_at=now(),released_by=auth.uid(),release_reason=reason,version=version+1 where id=c.id;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),c.organization_id,'paid_opportunity_funding_released',jsonb_build_object('commitment',c.id,'opportunity',p_opportunity,'amount',c.amount,'currency',c.currency,'reason',reason,'request',p_request));
  return c.id;
end;
$$;

create function public.sweep_expired_project_funding_commitments(p_project uuid,p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if not app_private.can_manage_project_funding(p_project) then raise exception 'Project funding management permission required'; end if;
  update public.project_funding_commitments c set status='released',released_at=now(),released_by=auth.uid(),release_reason='Opportunity application deadline expired',version=c.version+1
  from public.work_opportunities o where c.opportunity_id=o.id and c.project_id=p_project and c.status='pending' and o.reply_by<now() and not exists(select 1 from public.work_assignments a where a.opportunity_id=o.id and a.status in ('offered','active','completed'))
  and c.id in (select id from public.project_funding_commitments where project_id=p_project and status='pending' order by created_at limit greatest(coalesce(p_limit,100),1));
  get diagnostics n=row_count; return n;
end;
$$;

create function public.project_funding_assurance(p_project uuid,p_currency text default 'PKR')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.survey_projects; currency_code text:=upper(trim(coalesce(p_currency,''))); reserved_id uuid; reserved_balance numeric:=0; pending numeric:=0; active numeric:=0; released numeric:=0; coverage numeric; shortfall numeric;
begin
  select * into p from public.survey_projects where id=p_project; if not found then raise exception 'Survey project not found'; end if;
  if not app_private.can_read_finance(p.organization_id) then raise exception 'Organization finance access required'; end if;
  select id into reserved_id from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':RESERVED:'||currency_code);
  if reserved_id is not null then reserved_balance:=coalesce(app_private.finance_account_balance_raw(reserved_id),0); end if;
  select coalesce(sum(amount) filter(where status='pending'),0),coalesce(sum(amount) filter(where status='active'),0),coalesce(sum(amount) filter(where status='released'),0) into pending,active,released from public.project_funding_commitments where project_id=p.id and currency=currency_code;
  coverage:=reserved_balance-pending-active; shortfall:=greatest(-coverage,0);
  return jsonb_build_object('project_id',p.id,'currency',currency_code,'reserved_balance',reserved_balance,'pending_offer_commitment',pending,'active_assignment_commitment',active,'released_commitment',released,'coverage_available',greatest(coverage,0),'shortfall',shortfall,'paid_offer_gate',coverage>=0,'project_closure_state',p.project_closure_state);
end;
$$;

create function app_private.sync_project_closure_state()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='closed' and old.status<>'closed' and old.project_closure_state='open' then new.project_closure_state:='collection_closed';new.collection_closed_at:=coalesce(new.collection_closed_at,now()); end if;
  return new;
end;
$$;
create trigger sync_project_closure_state before update of status on public.survey_projects for each row execute function app_private.sync_project_closure_state();

-- Closing a project is allowed to close its published opportunities in the existing
-- workforce trigger. Do not let the open-recruitment guard reject that cleanup update.
create or replace function app_private.validate_project_recruitment_opportunity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.survey_project_id is not null and new.applications_open and new.status<>'closed'
     and not app_private.project_recruitment_effective_open(new.survey_project_id)
  then raise exception 'Project recruitment is closed by project status, target, capacity or manager'; end if;
  return new;
end;
$$;

create function public.project_closure_status(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.survey_projects; active_assignments integer; unbridged integer; pending_commitments integer; rec jsonb;
begin
  select * into p from public.survey_projects where id=p_project; if not found then raise exception 'Survey project not found'; end if;
  if not app_private.can_read_project(p_project) then raise exception 'Project access required'; end if;
  select count(*)::int into active_assignments from public.work_assignments where survey_project_id=p.id and status in ('offered','active');
  select count(*)::int into pending_commitments from public.project_funding_commitments where project_id=p.id and status in ('pending','active');
  rec:=public.project_payable_finance_reconciliation(p.id,'PKR');
  unbridged:=coalesce((rec->>'unbridged_events')::int,0);
  return jsonb_build_object('project_id',p.id,'state',p.project_closure_state,'status',p.status,'active_assignments',active_assignments,'pending_commitments',pending_commitments,'unbridged_events',unbridged,'financially_reconciled',coalesce((rec->>'matched')::boolean,false) and unbridged=0 and pending_commitments=0);
end;
$$;

create function public.advance_project_closure(p_project uuid,p_state text,p_note text,p_version integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.survey_projects; active_assignments integer; pending_commitments integer; rec jsonb; next_state text:=lower(trim(coalesce(p_state,''))); note text:=trim(coalesce(p_note,''));
begin
  if not app_private.can_manage_project(p_project) then raise exception 'Project management permission required'; end if;
  if length(note) not between 3 and 1000 then raise exception 'Closure note is required'; end if;
  select * into p from public.survey_projects where id=p_project for update; if not found then raise exception 'Survey project not found'; end if;
  if next_state='collection_closed' then
    if p.project_closure_state<>'open' then raise exception 'Collection closure transition is no longer available'; end if;
    -- Close recruitment first so the existing workforce cleanup trigger can safely
    -- close opportunity rows without treating its own cleanup as new recruitment.
    update public.work_opportunities set applications_open=false,publication_state='draft' where survey_project_id=p.id and publication_state='published';
    update public.survey_projects set status='closed',project_closure_state='collection_closed',collection_closed_at=now(),closure_note=note where id=p.id;
  elsif next_state='operational_completed' then
    if p.project_closure_state<>'collection_closed' then raise exception 'Collection must be closed first'; end if;
    select count(*)::int into active_assignments from public.work_assignments where survey_project_id=p.id and status in ('offered','active');
    if active_assignments>0 then raise exception 'Active or offered assignments must be completed or cancelled first'; end if;
    update public.survey_projects set project_closure_state='operational_completed',operational_completed_at=now(),closure_note=note where id=p.id;
  elsif next_state='financially_reconciled' then
    if p.project_closure_state<>'operational_completed' then raise exception 'Operational completion is required first'; end if;
    select count(*)::int into pending_commitments from public.project_funding_commitments where project_id=p.id and status in ('pending','active');
    if pending_commitments>0 then raise exception 'Release or settle all paid-work funding commitments first'; end if;
    rec:=public.project_payable_finance_reconciliation(p.id,'PKR');
    if coalesce((rec->>'matched')::boolean,false) is not true or coalesce((rec->>'unbridged_events')::int,0)>0 then raise exception 'Project payable finance is not reconciled'; end if;
    update public.survey_projects set project_closure_state='financially_reconciled',financially_reconciled_at=now(),closure_note=note where id=p.id;
  elsif next_state='fully_closed' then
    if p.project_closure_state<>'financially_reconciled' then raise exception 'Financial reconciliation is required first'; end if;
    update public.survey_projects set project_closure_state='fully_closed',fully_closed_at=now(),closure_note=note where id=p.id;
  else raise exception 'Valid project closure state required'; end if;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p.organization_id,'project_closure_advanced',jsonb_build_object('project',p.id,'from',p.project_closure_state,'to',next_state,'note',note));
  return public.project_closure_status(p.id);
end;
$$;

revoke all on function app_private.project_offer_exposure(uuid,numeric,text,integer),app_private.project_funding_coverage(uuid,text),app_private.guard_paid_opportunity_funding(),app_private.create_paid_opportunity_commitment(),app_private.sync_project_funding_commitment_assignment(),app_private.sync_project_closure_state() from public,anon,authenticated;
revoke all on function public.release_project_funding_commitment(uuid,text,uuid),public.sweep_expired_project_funding_commitments(uuid,integer),public.project_funding_assurance(uuid,text),public.project_closure_status(uuid),public.advance_project_closure(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.release_project_funding_commitment(uuid,text,uuid),public.sweep_expired_project_funding_commitments(uuid,integer),public.project_funding_assurance(uuid,text),public.project_closure_status(uuid),public.advance_project_closure(uuid,text,text,integer) to authenticated;
