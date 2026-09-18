-- POEM 2.17.1 — Project Funding & Reservation
-- Adds controlled organization funding sources/receipts and project reservation/release flows
-- on top of the immutable 2.17.0 double-entry finance core.

create table public.finance_funding_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_type text not null check(source_type in ('opening_balance','grant','donation','contribution','other')),
  name text not null,
  external_reference text,
  currency text not null,
  note text not null default '',
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  check(length(name) between 2 and 160),
  check(external_reference is null or length(external_reference) between 1 and 200),
  check(currency ~ '^[A-Z]{3}$'),
  check(length(note)<=1000)
);

create unique index finance_funding_source_external_unique
on public.finance_funding_sources(organization_id,source_type,external_reference)
where external_reference is not null;

create index finance_funding_sources_org
on public.finance_funding_sources(organization_id,currency,created_at desc,id);

create function app_private.protect_finance_funding_source()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Funding source records are immutable; create a new source record instead';
end;
$$;

create trigger protect_finance_funding_source
before update or delete on public.finance_funding_sources
for each row execute function app_private.protect_finance_funding_source();

alter table public.finance_funding_sources enable row level security;

create policy finance_funding_source_read on public.finance_funding_sources
for select to authenticated
using(app_private.can_read_finance(organization_id));

revoke all on public.finance_funding_sources from public,anon,authenticated;
grant select on public.finance_funding_sources to authenticated;
grant all on public.finance_funding_sources to service_role;

create function app_private.finance_account_balance_raw(p_account uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select case
    when a.account_class in ('asset','expense') then
      coalesce(sum(p.amount) filter(where p.direction='debit'),0)
      - coalesce(sum(p.amount) filter(where p.direction='credit'),0)
    else
      coalesce(sum(p.amount) filter(where p.direction='credit'),0)
      - coalesce(sum(p.amount) filter(where p.direction='debit'),0)
  end
  from public.finance_accounts a
  left join public.finance_postings p on p.account_id=a.id
  where a.id=p_account
  group by a.id,a.account_class;
$$;

create function app_private.ensure_standard_finance_account(
  p_organization uuid,
  p_project uuid,
  p_code text,
  p_name text,
  p_account_class text,
  p_purpose text,
  p_currency text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare result uuid;account_code text:=upper(trim(coalesce(p_code,'')));currency_code text:=upper(trim(coalesce(p_currency,'')));
begin
  select a.id into result from public.finance_accounts a where a.code=account_code;
  if found then
    if not exists(
      select 1 from public.finance_accounts a
      where a.id=result
        and a.organization_id is not distinct from p_organization
        and a.project_id is not distinct from p_project
        and a.user_id is null
        and a.account_class=p_account_class
        and a.purpose=p_purpose
        and a.currency=currency_code
    ) then raise exception 'Standard finance account code conflicts with existing account';end if;
    return result;
  end if;

  if p_organization is not null and not exists(select 1 from public.organizations where id=p_organization) then raise exception 'Organization not found';end if;
  if p_project is not null and not exists(select 1 from public.survey_projects where id=p_project and organization_id=p_organization) then raise exception 'Project must belong to organization';end if;
  if p_account_class not in ('asset','liability','equity','income','expense') then raise exception 'Valid finance account class required';end if;
  if p_purpose !~ '^[a-z][a-z0-9_]{1,79}$' then raise exception 'Valid finance account purpose required';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;

  insert into public.finance_accounts(
    organization_id,project_id,user_id,code,name,account_class,purpose,currency,created_by
  ) values(
    p_organization,p_project,null,account_code,trim(p_name),p_account_class,p_purpose,currency_code,auth.uid()
  ) returning id into result;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p_organization,'finance_account_created',jsonb_build_object(
    'finance_account',result,'project',p_project,'code',account_code,'class',p_account_class,'purpose',p_purpose,'currency',currency_code,'standardized',true
  ));
  return result;
end;
$$;

create function app_private.post_finance_journal_core(
  p_organization uuid,
  p_project uuid,
  p_journal_type text,
  p_currency text,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key uuid,
  p_memo text,
  p_postings jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  result uuid;
  prior public.finance_journals;
  jt text:=lower(trim(coalesce(p_journal_type,'')));
  currency_code text:=upper(trim(coalesce(p_currency,'')));
  rt text:=nullif(lower(trim(coalesce(p_reference_type,''))), '');
  rid text:=nullif(trim(coalesce(p_reference_id,'')), '');
  note text:=trim(coalesce(p_memo,''));
  payload jsonb;
  item jsonb;
  aid uuid;
  dir text;
  amt numeric(20,4);
  line_note text;
  debit_total numeric(30,4):=0;
  credit_total numeric(30,4):=0;
  line_no integer:=0;
begin
  if p_idempotency_key is null then raise exception 'Finance idempotency key required';end if;
  if jt !~ '^[a-z][a-z0-9_]{1,79}$' then raise exception 'Valid journal type required';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;
  if length(note) not between 3 and 1000 then raise exception 'Journal memo is required';end if;
  if (rt is null)<>(rid is null) then raise exception 'Reference type and reference ID must be supplied together';end if;
  if rt is not null and rt !~ '^[a-z][a-z0-9_]{1,79}$' then raise exception 'Valid reference type required';end if;
  if rid is not null and length(rid)>200 then raise exception 'Reference ID too long';end if;
  if p_organization is not null and not exists(select 1 from public.organizations where id=p_organization) then raise exception 'Organization not found';end if;
  if p_project is not null and not exists(select 1 from public.survey_projects where id=p_project and organization_id=p_organization) then raise exception 'Project must belong to organization';end if;
  if jsonb_typeof(p_postings)<>'array' or jsonb_array_length(p_postings) not between 2 and 100 then raise exception 'Journal requires 2 to 100 postings';end if;

  payload:=jsonb_build_object(
    'organization_id',p_organization,'project_id',p_project,'journal_type',jt,'currency',currency_code,
    'reference_type',rt,'reference_id',rid,'memo',note,'postings',p_postings
  );

  select * into prior from public.finance_journals where idempotency_key=p_idempotency_key;
  if found then
    if prior.request_payload=payload then return prior.id;end if;
    raise exception 'Finance idempotency key already used with different payload';
  end if;

  if rt is not null then
    select * into prior
    from public.finance_journals
    where coalesce(organization_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_organization,'00000000-0000-0000-0000-000000000000'::uuid)
      and journal_type=jt and reference_type=rt and reference_id=rid;
    if found then
      if prior.request_payload=payload then return prior.id;end if;
      raise exception 'Finance source already posted with different payload';
    end if;
  end if;

  for item in select value from jsonb_array_elements(p_postings)
  loop
    if jsonb_typeof(item)<>'object' then raise exception 'Each finance posting must be an object';end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('account_id','direction','amount','memo')) then raise exception 'Unsupported finance posting field';end if;
    begin aid:=(item->>'account_id')::uuid; exception when others then raise exception 'Valid finance account ID required';end;
    dir:=lower(trim(coalesce(item->>'direction','')));
    if dir not in ('debit','credit') then raise exception 'Posting direction must be debit or credit';end if;
    begin amt:=(item->>'amount')::numeric(20,4); exception when others then raise exception 'Valid posting amount required';end;
    if amt is null or amt<=0 or amt>9999999999999999.9999 then raise exception 'Posting amount must be positive';end if;
    line_note:=coalesce(item->>'memo','');
    if length(line_note)>500 then raise exception 'Posting memo too long';end if;

    if not exists(select 1 from public.finance_accounts a where a.id=aid and a.currency=currency_code) then raise exception 'Finance account missing or currency mismatch';end if;
    if p_organization is null then
      if exists(select 1 from public.finance_accounts a where a.id=aid and a.organization_id is not null) then raise exception 'System journal cannot post into organization account';end if;
    else
      if exists(select 1 from public.finance_accounts a where a.id=aid and a.organization_id is not null and a.organization_id<>p_organization) then raise exception 'Finance journal cannot cross organization boundaries';end if;
    end if;
    if p_project is not null and exists(select 1 from public.finance_accounts a where a.id=aid and a.project_id is not null and a.project_id<>p_project) then raise exception 'Finance journal cannot use another project account';end if;

    if dir='debit' then debit_total:=debit_total+amt;else credit_total:=credit_total+amt;end if;
  end loop;

  if debit_total<=0 or debit_total<>credit_total then raise exception 'Finance journal is not balanced';end if;

  insert into public.finance_journals(
    organization_id,project_id,journal_type,currency,reference_type,reference_id,idempotency_key,memo,request_payload,created_by
  ) values(
    p_organization,p_project,jt,currency_code,rt,rid,p_idempotency_key,note,payload,auth.uid()
  ) returning id into result;

  for item in select value from jsonb_array_elements(p_postings)
  loop
    line_no:=line_no+1;
    insert into public.finance_postings(journal_id,line_no,account_id,direction,amount,memo)
    values(result,line_no,(item->>'account_id')::uuid,lower(trim(item->>'direction')),(item->>'amount')::numeric(20,4),coalesce(item->>'memo',''));
  end loop;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p_organization,'finance_journal_posted',jsonb_build_object(
    'journal',result,'project',p_project,'journal_type',jt,'currency',currency_code,'reference_type',rt,'reference_id',rid,
    'debits',debit_total,'credits',credit_total
  ));
  return result;
end;
$$;

create or replace function public.post_finance_journal(
  p_organization uuid,p_project uuid,p_journal_type text,p_currency text,p_reference_type text,
  p_reference_id text,p_idempotency_key uuid,p_memo text,p_postings jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  return app_private.post_finance_journal_core(
    p_organization,p_project,p_journal_type,p_currency,p_reference_type,p_reference_id,p_idempotency_key,p_memo,p_postings
  );
end;
$$;

create function app_private.can_manage_project_funding(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active() and exists(
    select 1 from public.survey_projects p
    where p.id=p_project
      and (app_private.can_manage_finance() or app_private.ngo_admin(p.organization_id))
  );
$$;

create function public.create_finance_funding_source(
  p_organization uuid,p_source_type text,p_name text,p_external_reference text,p_currency text,p_note text default ''
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare result uuid;source_type text:=lower(trim(coalesce(p_source_type,'')));source_name text:=trim(coalesce(p_name,''));reference text:=nullif(trim(coalesce(p_external_reference,'')),'');currency_code text:=upper(trim(coalesce(p_currency,'')));note text:=trim(coalesce(p_note,''));
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if not exists(select 1 from public.organizations where id=p_organization and status='active') then raise exception 'Active organization required';end if;
  if source_type not in ('opening_balance','grant','donation','contribution','other') then raise exception 'Valid funding source type required';end if;
  if length(source_name) not between 2 and 160 then raise exception 'Funding source name required';end if;
  if reference is not null and length(reference)>200 then raise exception 'Funding source reference too long';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;
  if length(note)>1000 then raise exception 'Funding source note too long';end if;

  insert into public.finance_funding_sources(organization_id,source_type,name,external_reference,currency,note,created_by)
  values(p_organization,source_type,source_name,reference,currency_code,note,auth.uid())
  returning id into result;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p_organization,'finance_funding_source_created',jsonb_build_object(
    'source',result,'source_type',source_type,'name',source_name,'external_reference',reference,'currency',currency_code
  ));
  return result;
end;
$$;

create function public.record_organization_funding(
  p_source uuid,p_amount numeric,p_idempotency_key uuid,p_memo text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  src public.finance_funding_sources;
  available uuid;
  counter uuid;
  amount numeric(20,4):=p_amount;
  note text:=trim(coalesce(p_memo,''));
  counter_class text;
  counter_purpose text;
  counter_name text;
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  select * into src from public.finance_funding_sources where id=p_source;
  if not found then raise exception 'Funding source not found';end if;
  if not exists(select 1 from public.organizations where id=src.organization_id and status='active') then raise exception 'Active organization required';end if;
  if amount is null or amount<=0 or amount>9999999999999999.9999 then raise exception 'Positive funding amount required';end if;
  if round(amount,4)<>amount then raise exception 'Funding amount supports at most four decimal places';end if;
  if p_idempotency_key is null then raise exception 'Finance idempotency key required';end if;
  if length(note) not between 3 and 1000 then raise exception 'Funding memo is required';end if;

  perform o.id from public.organizations o where o.id=src.organization_id for update;

  available:=app_private.ensure_standard_finance_account(
    src.organization_id,null,'ORG:'||src.organization_id::text||':AVAILABLE:'||src.currency,
    'Organization available funds · '||src.currency,'asset','organization_available',src.currency
  );

  if src.source_type='opening_balance' then
    counter_class:='equity';counter_purpose:='organization_opening_equity';counter_name:='Organization opening balance equity · '||src.currency;
  else
    counter_class:='income';counter_purpose:='organization_funding_income';counter_name:='Organization funding income · '||src.currency;
  end if;

  counter:=app_private.ensure_standard_finance_account(
    src.organization_id,null,'ORG:'||src.organization_id::text||':'||case when src.source_type='opening_balance' then 'OPENING_EQUITY' else 'FUNDING_INCOME' end||':'||src.currency,
    counter_name,counter_class,counter_purpose,src.currency
  );

  return app_private.post_finance_journal_core(
    src.organization_id,null,'organization_funding_received',src.currency,'funding_source_receipt',src.id::text||':'||p_idempotency_key::text,
    p_idempotency_key,note,
    jsonb_build_array(
      jsonb_build_object('account_id',available,'direction','debit','amount',amount,'memo','Increase organization available funds'),
      jsonb_build_object('account_id',counter,'direction','credit','amount',amount,'memo','Funding source counter-entry')
    )
  );
end;
$$;

create function public.reserve_project_funding(
  p_project uuid,p_currency text,p_amount numeric,p_idempotency_key uuid,p_reason text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.survey_projects;
  currency_code text:=upper(trim(coalesce(p_currency,'')));
  amount numeric(20,4):=p_amount;
  reason text:=trim(coalesce(p_reason,''));
  available uuid;
  reserved uuid;
  committed uuid;
  spent uuid;
  available_balance numeric(30,4);
begin
  if not app_private.can_manage_project_funding(p_project) then raise exception 'NGO Admin or POEM finance permission required';end if;
  select * into p from public.survey_projects where id=p_project for update;
  if not found then raise exception 'Survey project not found';end if;
  if p.status<>'active' then raise exception 'Active project required for new funding reservations';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;
  if amount is null or amount<=0 or amount>9999999999999999.9999 then raise exception 'Positive reservation amount required';end if;
  if round(amount,4)<>amount then raise exception 'Reservation amount supports at most four decimal places';end if;
  if p_idempotency_key is null then raise exception 'Finance idempotency key required';end if;
  if length(reason) not between 3 and 1000 then raise exception 'Reservation reason is required';end if;

  available:=app_private.ensure_standard_finance_account(
    p.organization_id,null,'ORG:'||p.organization_id::text||':AVAILABLE:'||currency_code,
    'Organization available funds · '||currency_code,'asset','organization_available',currency_code
  );
  reserved:=app_private.ensure_standard_finance_account(
    p.organization_id,p.id,'PROJECT:'||p.id::text||':RESERVED:'||currency_code,
    'Project reserved funds · '||currency_code,'asset','project_reserved',currency_code
  );
  committed:=app_private.ensure_standard_finance_account(
    p.organization_id,p.id,'PROJECT:'||p.id::text||':COMMITTED:'||currency_code,
    'Project committed funds · '||currency_code,'asset','project_committed',currency_code
  );
  spent:=app_private.ensure_standard_finance_account(
    p.organization_id,p.id,'PROJECT:'||p.id::text||':SPENT:'||currency_code,
    'Project recognized spend · '||currency_code,'expense','project_spent',currency_code
  );

  perform id from public.finance_accounts where id in (available,reserved,committed,spent) order by id for update;
  available_balance:=coalesce(app_private.finance_account_balance_raw(available),0);
  if available_balance<amount then raise exception 'Insufficient organization available funds';end if;

  return app_private.post_finance_journal_core(
    p.organization_id,p.id,'project_funding_reserved',currency_code,'project_funding_action',p_idempotency_key::text,
    p_idempotency_key,reason,
    jsonb_build_array(
      jsonb_build_object('account_id',reserved,'direction','debit','amount',amount,'memo','Increase project reserved funding'),
      jsonb_build_object('account_id',available,'direction','credit','amount',amount,'memo','Reduce organization available funding')
    )
  );
end;
$$;

create function public.release_project_funding(
  p_project uuid,p_currency text,p_amount numeric,p_idempotency_key uuid,p_reason text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.survey_projects;
  currency_code text:=upper(trim(coalesce(p_currency,'')));
  amount numeric(20,4):=p_amount;
  reason text:=trim(coalesce(p_reason,''));
  available uuid;
  reserved uuid;
  reserved_balance numeric(30,4);
begin
  if not app_private.can_manage_project_funding(p_project) then raise exception 'NGO Admin or POEM finance permission required';end if;
  select * into p from public.survey_projects where id=p_project for update;
  if not found then raise exception 'Survey project not found';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;
  if amount is null or amount<=0 or amount>9999999999999999.9999 then raise exception 'Positive release amount required';end if;
  if round(amount,4)<>amount then raise exception 'Release amount supports at most four decimal places';end if;
  if p_idempotency_key is null then raise exception 'Finance idempotency key required';end if;
  if length(reason) not between 3 and 1000 then raise exception 'Release reason is required';end if;

  select id into available from public.finance_accounts
  where code=upper('ORG:'||p.organization_id::text||':AVAILABLE:'||currency_code);
  select id into reserved from public.finance_accounts
  where code=upper('PROJECT:'||p.id::text||':RESERVED:'||currency_code);
  if available is null or reserved is null then raise exception 'No project reservation exists for this currency';end if;

  perform id from public.finance_accounts where id in (available,reserved) order by id for update;
  reserved_balance:=coalesce(app_private.finance_account_balance_raw(reserved),0);
  if reserved_balance<amount then raise exception 'Release exceeds project reserved funds';end if;

  return app_private.post_finance_journal_core(
    p.organization_id,p.id,'project_funding_released',currency_code,'project_funding_action',p_idempotency_key::text,
    p_idempotency_key,reason,
    jsonb_build_array(
      jsonb_build_object('account_id',available,'direction','debit','amount',amount,'memo','Return funds to organization available balance'),
      jsonb_build_object('account_id',reserved,'direction','credit','amount',amount,'memo','Reduce project reserved funding')
    )
  );
end;
$$;

create function public.project_funding_status(p_project uuid,p_currency text default 'PKR')
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p public.survey_projects;
  currency_code text:=upper(trim(coalesce(p_currency,'')));
  available uuid;
  reserved uuid;
  committed uuid;
  spent uuid;
  available_balance numeric(30,4):=0;
  reserved_balance numeric(30,4):=0;
  committed_balance numeric(30,4):=0;
  spent_balance numeric(30,4):=0;
begin
  select * into p from public.survey_projects where id=p_project;
  if not found then raise exception 'Survey project not found';end if;
  if not app_private.can_read_finance(p.organization_id) then raise exception 'Organization finance access required';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;

  select id into available from public.finance_accounts where code=upper('ORG:'||p.organization_id::text||':AVAILABLE:'||currency_code);
  select id into reserved from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':RESERVED:'||currency_code);
  select id into committed from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':COMMITTED:'||currency_code);
  select id into spent from public.finance_accounts where code=upper('PROJECT:'||p.id::text||':SPENT:'||currency_code);

  if available is not null then available_balance:=coalesce(app_private.finance_account_balance_raw(available),0);end if;
  if reserved is not null then reserved_balance:=coalesce(app_private.finance_account_balance_raw(reserved),0);end if;
  if committed is not null then committed_balance:=coalesce(app_private.finance_account_balance_raw(committed),0);end if;
  if spent is not null then spent_balance:=coalesce(app_private.finance_account_balance_raw(spent),0);end if;

  return jsonb_build_object(
    'project_id',p.id,'project_title',p.title,'organization_id',p.organization_id,'project_status',p.status,'currency',currency_code,
    'organization_available',available_balance,'project_reserved',reserved_balance,'project_committed',committed_balance,'project_spent',spent_balance,
    'project_funding_total',reserved_balance+committed_balance+spent_balance,
    'can_manage',app_private.can_manage_finance() or app_private.ngo_admin(p.organization_id),
    'can_record_external',app_private.can_manage_finance()
  );
end;
$$;

create function public.project_funding_history(p_project uuid,p_currency text default 'PKR',p_before timestamptz default null,p_limit integer default 50)
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
    select j.id,j.journal_type,j.memo,j.posted_at,j.created_by,
      coalesce((select max(fp.amount) from public.finance_postings fp where fp.journal_id=j.id),0) as amount
    from public.finance_journals j
    where j.project_id=p.id
      and j.currency=currency_code
      and j.journal_type in ('project_funding_reserved','project_funding_released')
      and (p_before is null or j.posted_at<p_before)
    order by j.posted_at desc,j.id desc
    limit lim
  ) x;
  return result;
end;
$$;

revoke all on function app_private.protect_finance_funding_source(),app_private.finance_account_balance_raw(uuid),app_private.ensure_standard_finance_account(uuid,uuid,text,text,text,text,text),app_private.post_finance_journal_core(uuid,uuid,text,text,text,text,uuid,text,jsonb),app_private.can_manage_project_funding(uuid) from public,anon,authenticated;

revoke all on function public.create_finance_funding_source(uuid,text,text,text,text,text),public.record_organization_funding(uuid,numeric,uuid,text),public.reserve_project_funding(uuid,text,numeric,uuid,text),public.release_project_funding(uuid,text,numeric,uuid,text),public.project_funding_status(uuid,text),public.project_funding_history(uuid,text,timestamptz,integer) from public,anon,authenticated;

grant execute on function public.create_finance_funding_source(uuid,text,text,text,text,text),public.record_organization_funding(uuid,numeric,uuid,text),public.reserve_project_funding(uuid,text,numeric,uuid,text),public.release_project_funding(uuid,text,numeric,uuid,text),public.project_funding_status(uuid,text),public.project_funding_history(uuid,text,timestamptz,integer) to authenticated;
