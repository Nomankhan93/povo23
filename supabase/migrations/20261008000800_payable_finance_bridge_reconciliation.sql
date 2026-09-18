-- POEM 2.17.2 — Payable → Finance Bridge & Reconciliation
-- Existing work_payable_* tables remain the worker entitlement subledger.
-- This release bridges monetary payable events into aggregate project funding buckets.

create table public.finance_payable_event_links (
  event_id uuid primary key references public.work_payable_events(id),
  unit_id uuid not null references public.work_payable_units(id),
  assignment_id uuid not null references public.work_assignments(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  event_kind text not null check(event_kind in ('accrual','adjustment','payment','payment_reversal')),
  journal_id uuid unique references public.finance_journals(id),
  bridge_status text not null check(bridge_status in ('posted','no_movement')),
  approved_before numeric(20,4) not null,
  approved_after numeric(20,4) not null,
  paid_before numeric(20,4) not null,
  paid_after numeric(20,4) not null,
  committed_before numeric(20,4) not null,
  committed_after numeric(20,4) not null,
  spent_before numeric(20,4) not null,
  spent_after numeric(20,4) not null,
  created_at timestamptz not null default now(),
  check((bridge_status='posted')=(journal_id is not null)),
  check(approved_before>=0 and approved_after>=0 and paid_before>=0 and paid_after>=0),
  check(committed_before>=0 and committed_after>=0 and spent_before>=0 and spent_after>=0)
);

create index finance_payable_links_project
on public.finance_payable_event_links(project_id,currency,created_at,event_id);

alter table public.finance_payable_event_links enable row level security;
revoke all on public.finance_payable_event_links from public,anon,authenticated;
grant select on public.finance_payable_event_links to authenticated;

create policy finance_payable_event_link_read
on public.finance_payable_event_links
for select
to authenticated
using(app_private.can_read_finance(organization_id));

create function app_private.protect_finance_payable_event_link()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Payable-finance links are immutable; reconcile through append-only source events';
end;
$$;

create trigger protect_finance_payable_event_link
before update or delete on public.finance_payable_event_links
for each row execute function app_private.protect_finance_payable_event_link();

create function app_private.payable_finance_idempotency(p_event uuid)
returns uuid
language sql
immutable
security definer
set search_path=''
as $$
  select (
    substr(h,1,8)||'-'||substr(h,9,4)||'-'||substr(h,13,4)||'-'||substr(h,17,4)||'-'||substr(h,21,12)
  )::uuid
  from (select md5('poem-payable-finance:'||p_event::text) h) x;
$$;

create function app_private.reconcile_payable_finance_unit(p_unit uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  u public.work_payable_units;
  w public.work_assignments;
  p public.survey_projects;
  e public.work_payable_events;
  existing public.finance_payable_event_links;
  approved numeric(20,4):=0;
  paid numeric(20,4):=0;
  approved_before numeric(20,4);
  paid_before numeric(20,4);
  committed_before numeric(20,4);
  committed_after numeric(20,4);
  spent_before numeric(20,4);
  spent_after numeric(20,4);
  delta_committed numeric(20,4);
  delta_spent numeric(20,4);
  delta_reserved numeric(20,4);
  reserved uuid;
  committed uuid;
  spent uuid;
  reserved_balance numeric(30,4);
  committed_balance numeric(30,4);
  spent_balance numeric(30,4);
  postings jsonb;
  journal uuid;
  processed integer:=0;
begin
  select * into u from public.work_payable_units where id=p_unit for update;
  if not found then raise exception 'Payable unit not found';end if;

  select * into w from public.work_assignments where id=u.assignment_id;
  if not found or w.work_mode<>'paid' then raise exception 'Paid assignment required for finance bridge';end if;
  if upper(w.currency)<>upper(u.currency) then raise exception 'Payable unit and assignment currency mismatch';end if;

  select * into p from public.survey_projects where id=w.survey_project_id;
  if not found or p.organization_id<>w.organization_id then raise exception 'Payable project scope mismatch';end if;

  reserved:=app_private.ensure_standard_finance_account(
    p.organization_id,p.id,'PROJECT:'||p.id::text||':RESERVED:'||upper(u.currency),
    'Project reserved funds · '||upper(u.currency),'asset','project_reserved',upper(u.currency)
  );
  committed:=app_private.ensure_standard_finance_account(
    p.organization_id,p.id,'PROJECT:'||p.id::text||':COMMITTED:'||upper(u.currency),
    'Project committed funds · '||upper(u.currency),'asset','project_committed',upper(u.currency)
  );
  spent:=app_private.ensure_standard_finance_account(
    p.organization_id,p.id,'PROJECT:'||p.id::text||':SPENT:'||upper(u.currency),
    'Project recognized spend · '||upper(u.currency),'expense','project_spent',upper(u.currency)
  );

  for e in
    select * from public.work_payable_events
    where unit_id=u.id
      and kind in ('accrual','adjustment','payment','payment_reversal')
    order by created_at,id
  loop
    approved_before:=approved;
    paid_before:=paid;
    committed_before:=greatest(approved_before-paid_before,0);
    spent_before:=paid_before;

    if e.kind in ('accrual','adjustment') then
      approved:=approved+e.amount;
    elsif e.kind='payment' then
      paid:=paid+e.amount;
    elsif e.kind='payment_reversal' then
      paid:=paid-e.amount;
    end if;

    if approved<0 or paid<0 then raise exception 'Payable event history produced an invalid negative balance';end if;
    committed_after:=greatest(approved-paid,0);
    spent_after:=paid;

    select * into existing from public.finance_payable_event_links where event_id=e.id;
    if found then
      if existing.unit_id<>u.id
        or existing.assignment_id<>u.assignment_id
        or existing.organization_id<>p.organization_id
        or existing.project_id<>p.id
        or existing.currency<>upper(u.currency)
        or existing.event_kind<>e.kind
        or existing.approved_before<>approved_before
        or existing.approved_after<>approved
        or existing.paid_before<>paid_before
        or existing.paid_after<>paid
        or existing.committed_before<>committed_before
        or existing.committed_after<>committed_after
        or existing.spent_before<>spent_before
        or existing.spent_after<>spent_after
      then raise exception 'Payable-finance reconciliation history drift detected';end if;
      continue;
    end if;

    delta_committed:=committed_after-committed_before;
    delta_spent:=spent_after-spent_before;
    delta_reserved:=-(delta_committed+delta_spent);

    if delta_reserved=0 and delta_committed=0 and delta_spent=0 then
      insert into public.finance_payable_event_links(
        event_id,unit_id,assignment_id,organization_id,project_id,currency,event_kind,journal_id,bridge_status,
        approved_before,approved_after,paid_before,paid_after,committed_before,committed_after,spent_before,spent_after
      ) values(
        e.id,u.id,u.assignment_id,p.organization_id,p.id,upper(u.currency),e.kind,null,'no_movement',
        approved_before,approved,paid_before,paid,committed_before,committed_after,spent_before,spent_after
      );
      processed:=processed+1;
      continue;
    end if;

    perform id from public.finance_accounts where id in (reserved,committed,spent) order by id for update;
    reserved_balance:=coalesce(app_private.finance_account_balance_raw(reserved),0);
    committed_balance:=coalesce(app_private.finance_account_balance_raw(committed),0);
    spent_balance:=coalesce(app_private.finance_account_balance_raw(spent),0);

    if reserved_balance+delta_reserved<0 then raise exception 'Insufficient project reserved funds for payable commitment';end if;
    if committed_balance+delta_committed<0 then raise exception 'Project committed funding is below payable reconciliation requirement';end if;
    if spent_balance+delta_spent<0 then raise exception 'Project spent funding is below payable reversal requirement';end if;

    postings:='[]'::jsonb;
    if delta_reserved<>0 then
      postings:=postings||jsonb_build_array(jsonb_build_object(
        'account_id',reserved,
        'direction',case when delta_reserved>0 then 'debit' else 'credit' end,
        'amount',abs(delta_reserved),
        'memo',case when delta_reserved>0 then 'Return unused payable commitment to project reserve' else 'Consume project reserve for approved payable' end
      ));
    end if;
    if delta_committed<>0 then
      postings:=postings||jsonb_build_array(jsonb_build_object(
        'account_id',committed,
        'direction',case when delta_committed>0 then 'debit' else 'credit' end,
        'amount',abs(delta_committed),
        'memo',case when delta_committed>0 then 'Increase aggregate approved payable commitment' else 'Reduce aggregate approved payable commitment' end
      ));
    end if;
    if delta_spent<>0 then
      postings:=postings||jsonb_build_array(jsonb_build_object(
        'account_id',spent,
        'direction',case when delta_spent>0 then 'debit' else 'credit' end,
        'amount',abs(delta_spent),
        'memo',case when delta_spent>0 then 'Recognize recorded payable settlement as project spend' else 'Reverse recorded payable settlement from project spend' end
      ));
    end if;

    journal:=app_private.post_finance_journal_core(
      p.organization_id,p.id,'payable_finance_bridge',upper(u.currency),'work_payable_event',e.id::text,app_private.payable_finance_idempotency(e.id),
      'Bridge payable event '||e.kind||' for unit '||u.id::text,
      postings
    );

    insert into public.finance_payable_event_links(
      event_id,unit_id,assignment_id,organization_id,project_id,currency,event_kind,journal_id,bridge_status,
      approved_before,approved_after,paid_before,paid_after,committed_before,committed_after,spent_before,spent_after
    ) values(
      e.id,u.id,u.assignment_id,p.organization_id,p.id,upper(u.currency),e.kind,journal,'posted',
      approved_before,approved,paid_before,paid,committed_before,committed_after,spent_before,spent_after
    );
    processed:=processed+1;
  end loop;

  return processed;
end;
$$;

create function app_private.work_payable_finance_bridge_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.kind in ('accrual','adjustment','payment','payment_reversal') then
    perform app_private.reconcile_payable_finance_unit(new.unit_id);
  end if;
  return new;
end;
$$;

create trigger work_payable_finance_bridge
after insert on public.work_payable_events
for each row execute function app_private.work_payable_finance_bridge_trigger();

create function public.reconcile_work_payable_finance(p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u public.work_payable_units;
  w public.work_assignments;
  processed integer;
  linked integer;
  total integer;
begin
  select * into u from public.work_payable_units where id=p_unit;
  if not found then raise exception 'Payable unit not found';end if;
  select * into w from public.work_assignments where id=u.assignment_id;
  if not found or not (app_private.can_manage_finance() or (app_private.ngo_admin(w.organization_id) and w.user_id<>auth.uid())) then
    raise exception 'Independent NGO Admin or POEM finance permission required';
  end if;
  processed:=app_private.reconcile_payable_finance_unit(u.id);
  select count(*)::int into total from public.work_payable_events where unit_id=u.id and kind in ('accrual','adjustment','payment','payment_reversal');
  select count(*)::int into linked from public.finance_payable_event_links where unit_id=u.id;
  return jsonb_build_object('unit_id',u.id,'processed',processed,'monetary_events',total,'linked_events',linked,'complete',linked=total);
end;
$$;

create function public.reconcile_project_payable_finance(p_project uuid,p_currency text default 'PKR',p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.survey_projects;
  currency_code text:=upper(trim(coalesce(p_currency,'')));
  lim integer:=least(greatest(coalesce(p_limit,100),1),500);
  r record;
  units_processed integer:=0;
  events_processed integer:=0;
begin
  select * into p from public.survey_projects where id=p_project;
  if not found then raise exception 'Survey project not found';end if;
  if not (app_private.can_manage_finance() or app_private.ngo_admin(p.organization_id)) then raise exception 'NGO Admin or POEM finance permission required';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;

  for r in
    select distinct u.id
    from public.work_payable_units u
    join public.work_assignments w on w.id=u.assignment_id
    where w.survey_project_id=p.id
      and upper(u.currency)=currency_code
      and exists(
        select 1 from public.work_payable_events e
        where e.unit_id=u.id
          and e.kind in ('accrual','adjustment','payment','payment_reversal')
          and not exists(select 1 from public.finance_payable_event_links l where l.event_id=e.id)
      )
    order by u.id
    limit lim
  loop
    events_processed:=events_processed+app_private.reconcile_payable_finance_unit(r.id);
    units_processed:=units_processed+1;
  end loop;

  return jsonb_build_object('project_id',p.id,'currency',currency_code,'units_processed',units_processed,'events_processed',events_processed);
end;
$$;

create function public.project_payable_finance_reconciliation(p_project uuid,p_currency text default 'PKR')
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p public.survey_projects;
  currency_code text:=upper(trim(coalesce(p_currency,'')));
  reserved uuid;
  committed uuid;
  spent uuid;
  reserved_balance numeric(30,4):=0;
  committed_balance numeric(30,4):=0;
  spent_balance numeric(30,4):=0;
  approved_total numeric(30,4):=0;
  paid_total numeric(30,4):=0;
  expected_committed numeric(30,4):=0;
  monetary_events integer:=0;
  linked_events integer:=0;
begin
  select * into p from public.survey_projects where id=p_project;
  if not found then raise exception 'Survey project not found';end if;
  if not app_private.can_read_finance(p.organization_id) then raise exception 'Organization finance access required';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;

  select id into reserved from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':RESERVED:'||currency_code);
  select id into committed from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':COMMITTED:'||currency_code);
  select id into spent from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':SPENT:'||currency_code);
  if reserved is not null then reserved_balance:=coalesce(app_private.finance_account_balance_raw(reserved),0);end if;
  if committed is not null then committed_balance:=coalesce(app_private.finance_account_balance_raw(committed),0);end if;
  if spent is not null then spent_balance:=coalesce(app_private.finance_account_balance_raw(spent),0);end if;

  with unit_totals as (
    select u.id,
      coalesce(sum(e.amount) filter(where e.kind in ('accrual','adjustment')),0)::numeric(30,4) as approved,
      coalesce(sum(case when e.kind='payment' then e.amount when e.kind='payment_reversal' then -e.amount else 0 end),0)::numeric(30,4) as paid
    from public.work_payable_units u
    join public.work_assignments w on w.id=u.assignment_id
    left join public.work_payable_events e on e.unit_id=u.id
    where w.survey_project_id=p.id and upper(u.currency)=currency_code
    group by u.id
  )
  select coalesce(sum(approved),0),coalesce(sum(paid),0),coalesce(sum(greatest(approved-paid,0)),0)
  into approved_total,paid_total,expected_committed
  from unit_totals;

  select count(*)::int into monetary_events
  from public.work_payable_events e
  join public.work_payable_units u on u.id=e.unit_id
  join public.work_assignments w on w.id=u.assignment_id
  where w.survey_project_id=p.id and upper(u.currency)=currency_code
    and e.kind in ('accrual','adjustment','payment','payment_reversal');

  select count(*)::int into linked_events
  from public.finance_payable_event_links l
  where l.project_id=p.id and l.currency=currency_code;

  return jsonb_build_object(
    'project_id',p.id,'currency',currency_code,
    'approved_entitlement',approved_total,'recorded_payments',paid_total,
    'expected_committed',expected_committed,'expected_spent',paid_total,
    'finance_reserved',reserved_balance,'finance_committed',committed_balance,'finance_spent',spent_balance,
    'monetary_events',monetary_events,'linked_events',linked_events,'unbridged_events',monetary_events-linked_events,
    'matched',monetary_events=linked_events and committed_balance=expected_committed and spent_balance=paid_total,
    'can_reconcile',app_private.can_manage_finance() or app_private.ngo_admin(p.organization_id)
  );
end;
$$;

create or replace function public.project_funding_history(p_project uuid,p_currency text default 'PKR',p_before timestamptz default null,p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare p public.survey_projects;currency_code text:=upper(trim(coalesce(p_currency,'')));lim integer:=least(greatest(coalesce(p_limit,50),1),100);result jsonb;
begin
  select * into p from public.survey_projects where id=p_project;
  if not found then raise exception 'Survey project not found';end if;
  if not app_private.can_read_finance(p.organization_id) then raise exception 'Organization finance access required';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;

  select jsonb_build_object(
    'project_id',p.id,'currency',currency_code,
    'rows',coalesce(jsonb_agg(to_jsonb(x) order by x.posted_at desc,x.id desc) filter(where x.id is not null),'[]'::jsonb)
  ) into result
  from (
    select j.id,j.journal_type,j.reference_type,j.reference_id,j.memo,j.posted_at,j.created_by,
      coalesce((select max(fp.amount) from public.finance_postings fp where fp.journal_id=j.id),0) as amount
    from public.finance_journals j
    where j.project_id=p.id
      and j.currency=currency_code
      and j.journal_type in ('project_funding_reserved','project_funding_released','payable_finance_bridge')
      and (p_before is null or j.posted_at<p_before)
    order by j.posted_at desc,j.id desc
    limit lim
  ) x;
  return result;
end;
$$;

revoke all on function app_private.protect_finance_payable_event_link(),app_private.payable_finance_idempotency(uuid),app_private.reconcile_payable_finance_unit(uuid),app_private.work_payable_finance_bridge_trigger() from public,anon,authenticated;
revoke all on function public.reconcile_work_payable_finance(uuid),public.reconcile_project_payable_finance(uuid,text,integer),public.project_payable_finance_reconciliation(uuid,text) from public,anon,authenticated;
grant execute on function public.reconcile_work_payable_finance(uuid),public.reconcile_project_payable_finance(uuid,text,integer),public.project_payable_finance_reconciliation(uuid,text) to authenticated;
