-- POEM 2.17.0 — Finance Core & Double-Entry Ledger
-- Provider-independent, append-only accounting foundation.
-- Existing work_payable_* tables remain the worker entitlement subledger.

create function app_private.can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.accounts a
    where a.id=auth.uid()
      and a.status='active'
      and a.platform_role in ('admin','super_admin')
  );
$$;

create function app_private.can_read_finance(p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active()
     and (
       app_private.can_manage_finance()
       or (p_organization is not null and app_private.ngo_admin(p_organization))
     );
$$;

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  project_id uuid references public.survey_projects(id),
  user_id uuid references public.accounts(id),
  code text not null unique,
  name text not null,
  account_class text not null check(account_class in ('asset','liability','equity','income','expense')),
  purpose text not null,
  currency text not null,
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  check(length(code) between 3 and 80),
  check(code ~ '^[A-Z0-9][A-Z0-9:_-]{2,79}$'),
  check(length(name) between 2 and 160),
  check(length(purpose) between 2 and 80),
  check(currency ~ '^[A-Z]{3}$'),
  check(project_id is null or organization_id is not null),
  check(user_id is null or organization_id is not null)
);

create index finance_accounts_org on public.finance_accounts(organization_id,project_id,currency,code);
create index finance_accounts_project on public.finance_accounts(project_id,code) where project_id is not null;
create index finance_accounts_user on public.finance_accounts(user_id,code) where user_id is not null;

create table public.finance_journals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  project_id uuid references public.survey_projects(id),
  journal_type text not null,
  currency text not null,
  reference_type text,
  reference_id text,
  idempotency_key uuid not null unique,
  memo text not null,
  reverses_journal_id uuid unique references public.finance_journals(id),
  request_payload jsonb not null,
  created_by uuid not null references public.accounts(id),
  posted_at timestamptz not null default now(),
  check(length(journal_type) between 2 and 80),
  check(journal_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  check(currency ~ '^[A-Z]{3}$'),
  check(length(memo) between 3 and 1000),
  check((reference_type is null)=(reference_id is null)),
  check(reference_type is null or length(reference_type) between 2 and 80),
  check(reference_type is null or reference_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  check(reference_id is null or length(reference_id) between 1 and 200),
  check(project_id is null or organization_id is not null),
  check(reverses_journal_id is null or reverses_journal_id<>id),
  check(jsonb_typeof(request_payload)='object')
);

create unique index finance_source_once
on public.finance_journals(
  coalesce(organization_id,'00000000-0000-0000-0000-000000000000'::uuid),
  journal_type,
  reference_type,
  reference_id
)
where reference_type is not null;

create index finance_journals_org on public.finance_journals(organization_id,posted_at desc,id);
create index finance_journals_project on public.finance_journals(project_id,posted_at desc,id) where project_id is not null;

create table public.finance_postings (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.finance_journals(id),
  line_no smallint not null check(line_no between 1 and 100),
  account_id uuid not null references public.finance_accounts(id),
  direction text not null check(direction in ('debit','credit')),
  amount numeric(20,4) not null check(amount>0 and amount<=9999999999999999.9999),
  memo text not null default '',
  created_at timestamptz not null default now(),
  unique(journal_id,line_no),
  check(length(memo)<=500)
);

create index finance_postings_account on public.finance_postings(account_id,created_at desc,id);
create index finance_postings_journal on public.finance_postings(journal_id,line_no);

create function app_private.validate_finance_account_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare p_org uuid;
begin
  if new.project_id is not null then
    select organization_id into p_org from public.survey_projects where id=new.project_id;
    if p_org is null then raise exception 'Finance account project not found';end if;
    if p_org<>new.organization_id then raise exception 'Finance account project must belong to the selected organization';end if;
  end if;
  return new;
end;
$$;

create trigger validate_finance_account_scope
before insert on public.finance_accounts
for each row execute function app_private.validate_finance_account_scope();

create function app_private.protect_finance_account()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Finance accounts are immutable in the core ledger; create a new account instead';
end;
$$;

create trigger protect_finance_account
before update or delete on public.finance_accounts
for each row execute function app_private.protect_finance_account();

create function app_private.protect_finance_journal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Posted finance journals are immutable; create a reversal journal instead';
end;
$$;

create trigger protect_finance_journal
before update or delete on public.finance_journals
for each row execute function app_private.protect_finance_journal();

create function app_private.protect_finance_posting()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Posted finance entries are immutable; create a reversal journal instead';
end;
$$;

create trigger protect_finance_posting
before update or delete on public.finance_postings
for each row execute function app_private.protect_finance_posting();

create function app_private.assert_finance_journal_balanced()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  jid uuid;
  j public.finance_journals;
  posting_count integer;
  debit_total numeric(30,4);
  credit_total numeric(30,4);
begin
  if tg_table_name='finance_journals' then
    jid:=new.id;
  else
    jid:=coalesce(new.journal_id,old.journal_id);
  end if;

  select * into j from public.finance_journals where id=jid;
  if not found then return new;end if;

  select
    count(*)::integer,
    coalesce(sum(p.amount) filter(where p.direction='debit'),0),
    coalesce(sum(p.amount) filter(where p.direction='credit'),0)
  into posting_count,debit_total,credit_total
  from public.finance_postings p
  where p.journal_id=jid;

  if posting_count<2 then raise exception 'Finance journal requires at least two postings';end if;
  if debit_total<=0 or debit_total<>credit_total then raise exception 'Finance journal is not balanced';end if;

  if exists(
    select 1
    from public.finance_postings p
    join public.finance_accounts a on a.id=p.account_id
    where p.journal_id=jid and a.currency<>j.currency
  ) then raise exception 'Finance journal currency must match every account';end if;

  if j.organization_id is null then
    if exists(
      select 1 from public.finance_postings p
      join public.finance_accounts a on a.id=p.account_id
      where p.journal_id=jid and a.organization_id is not null
    ) then raise exception 'System finance journal cannot post into an organization account';end if;
  else
    if exists(
      select 1 from public.finance_postings p
      join public.finance_accounts a on a.id=p.account_id
      where p.journal_id=jid
        and a.organization_id is not null
        and a.organization_id<>j.organization_id
    ) then raise exception 'Finance journal cannot cross organization boundaries';end if;
  end if;

  if j.project_id is not null and exists(
    select 1 from public.finance_postings p
    join public.finance_accounts a on a.id=p.account_id
    where p.journal_id=jid
      and a.project_id is not null
      and a.project_id<>j.project_id
  ) then raise exception 'Finance journal cannot use another project account';end if;

  return new;
end;
$$;

create constraint trigger finance_journal_balance_guard
  after insert on public.finance_journals
  deferrable initially deferred
  for each row execute function app_private.assert_finance_journal_balanced();

create constraint trigger finance_posting_balance_guard
  after insert on public.finance_postings
  deferrable initially deferred
  for each row execute function app_private.assert_finance_journal_balanced();

alter table public.finance_accounts enable row level security;
alter table public.finance_journals enable row level security;
alter table public.finance_postings enable row level security;

create policy finance_account_read on public.finance_accounts
for select to authenticated
using(app_private.can_read_finance(organization_id));

create policy finance_journal_read on public.finance_journals
for select to authenticated
using(app_private.can_read_finance(organization_id));

create policy finance_posting_read on public.finance_postings
for select to authenticated
using(exists(
  select 1 from public.finance_journals j
  where j.id=journal_id and app_private.can_read_finance(j.organization_id)
));

revoke all on public.finance_accounts,public.finance_journals,public.finance_postings from public,anon,authenticated;
grant select on public.finance_accounts,public.finance_journals,public.finance_postings to authenticated;

grant all on public.finance_accounts,public.finance_journals,public.finance_postings to service_role;

create function public.create_finance_account(
  p_organization uuid,
  p_project uuid,
  p_user uuid,
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
declare
  result uuid;
  code text:=upper(trim(coalesce(p_code,'')));
  account_name text:=trim(coalesce(p_name,''));
  purpose_name text:=lower(trim(coalesce(p_purpose,'')));
  currency_code text:=upper(trim(coalesce(p_currency,'')));
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if code !~ '^[A-Z0-9][A-Z0-9:_-]{2,79}$' then raise exception 'Valid finance account code required';end if;
  if length(account_name) not between 2 and 160 then raise exception 'Valid finance account name required';end if;
  if p_account_class not in ('asset','liability','equity','income','expense') then raise exception 'Valid finance account class required';end if;
  if purpose_name !~ '^[a-z][a-z0-9_]{1,79}$' then raise exception 'Valid finance account purpose required';end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'ISO-style three-letter currency required';end if;
  if p_organization is not null and not exists(select 1 from public.organizations where id=p_organization) then raise exception 'Organization not found';end if;
  if p_project is not null and not exists(select 1 from public.survey_projects where id=p_project and organization_id=p_organization) then raise exception 'Project must belong to organization';end if;
  if p_user is not null and not exists(select 1 from public.accounts where id=p_user) then raise exception 'Account holder not found';end if;

  insert into public.finance_accounts(
    organization_id,project_id,user_id,code,name,account_class,purpose,currency,created_by
  ) values(
    p_organization,p_project,p_user,code,account_name,p_account_class,purpose_name,currency_code,auth.uid()
  ) returning id into result;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p_organization,'finance_account_created',jsonb_build_object(
    'finance_account',result,'project',p_project,'user',p_user,'code',code,'class',p_account_class,'purpose',purpose_name,'currency',currency_code
  ));
  return result;
end;
$$;

create function public.post_finance_journal(
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
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
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
    'organization_id',p_organization,
    'project_id',p_project,
    'journal_type',jt,
    'currency',currency_code,
    'reference_type',rt,
    'reference_id',rid,
    'memo',note,
    'postings',p_postings
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

    if dir='debit' then debit_total:=debit_total+amt; else credit_total:=credit_total+amt;end if;
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
    values(
      result,line_no,(item->>'account_id')::uuid,lower(trim(item->>'direction')),(item->>'amount')::numeric(20,4),coalesce(item->>'memo','')
    );
  end loop;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p_organization,'finance_journal_posted',jsonb_build_object(
    'journal',result,'project',p_project,'journal_type',jt,'currency',currency_code,'reference_type',rt,'reference_id',rid,'debits',debit_total,'credits',credit_total
  ));
  return result;
end;
$$;

create function public.reverse_finance_journal(
  p_journal uuid,
  p_idempotency_key uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  original public.finance_journals;
  existing public.finance_journals;
  result uuid;
  reason text:=trim(coalesce(p_reason,''));
  payload jsonb;
  line_no integer:=0;
  p record;
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if p_idempotency_key is null then raise exception 'Finance idempotency key required';end if;
  if length(reason) not between 3 and 1000 then raise exception 'Reversal reason is required';end if;

  select * into original from public.finance_journals where id=p_journal;
  if not found then raise exception 'Finance journal not found';end if;
  if original.reverses_journal_id is not null then raise exception 'A reversal journal cannot be reversed in this release';end if;

  payload:=jsonb_build_object('reverses_journal_id',original.id,'reason',reason);
  select * into existing from public.finance_journals where idempotency_key=p_idempotency_key;
  if found then
    if existing.reverses_journal_id=original.id and existing.request_payload=payload then return existing.id;end if;
    raise exception 'Finance idempotency key already used with different payload';
  end if;
  select * into existing from public.finance_journals where reverses_journal_id=original.id;
  if found then
    if existing.request_payload=payload then return existing.id;end if;
    raise exception 'Finance journal already reversed with different request';
  end if;

  insert into public.finance_journals(
    organization_id,project_id,journal_type,currency,reference_type,reference_id,idempotency_key,memo,reverses_journal_id,request_payload,created_by
  ) values(
    original.organization_id,original.project_id,'reversal',original.currency,'journal_reversal',original.id::text,p_idempotency_key,
    reason,original.id,payload,auth.uid()
  ) returning id into result;

  for p in
    select * from public.finance_postings where journal_id=original.id order by line_no
  loop
    line_no:=line_no+1;
    insert into public.finance_postings(journal_id,line_no,account_id,direction,amount,memo)
    values(result,line_no,p.account_id,case when p.direction='debit' then 'credit' else 'debit' end,p.amount,'Reversal: '||left(p.memo,490));
  end loop;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),original.organization_id,'finance_journal_reversed',jsonb_build_object(
    'journal',result,'reverses',original.id,'project',original.project_id,'reason',reason
  ));
  return result;
end;
$$;

create function public.finance_account_balance(p_account uuid)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare a public.finance_accounts;debits numeric(30,4);credits numeric(30,4);
begin
  select * into a from public.finance_accounts where id=p_account;
  if not found or not app_private.can_read_finance(a.organization_id) then raise exception 'Finance account access required';end if;
  select
    coalesce(sum(amount) filter(where direction='debit'),0),
    coalesce(sum(amount) filter(where direction='credit'),0)
  into debits,credits
  from public.finance_postings where account_id=a.id;
  if a.account_class in ('asset','expense') then return debits-credits;end if;
  return credits-debits;
end;
$$;

create function public.finance_scope_summary(p_organization uuid,p_project uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if p_organization is null or not app_private.can_read_finance(p_organization) then raise exception 'Organization finance access required';end if;
  if p_project is not null and not exists(select 1 from public.survey_projects where id=p_project and organization_id=p_organization) then raise exception 'Project must belong to organization';end if;

  select jsonb_build_object(
    'organization_id',p_organization,
    'project_id',p_project,
    'accounts',coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'code',x.code,'name',x.name,'class',x.account_class,'purpose',x.purpose,'currency',x.currency,
      'organization_id',x.organization_id,'project_id',x.project_id,'user_id',x.user_id,'balance',x.balance
    ) order by x.currency,x.code) filter(where x.id is not null),'[]'::jsonb)
  ) into result
  from (
    select a.*,public.finance_account_balance(a.id) as balance
    from public.finance_accounts a
    where a.organization_id=p_organization
      and ((p_project is null and a.project_id is null) or (p_project is not null and a.project_id=p_project))
  ) x;
  return result;
end;
$$;

create function public.finance_account_statement(p_account uuid,p_before timestamptz default null,p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare a public.finance_accounts;result jsonb;lim integer:=least(greatest(coalesce(p_limit,50),1),100);
begin
  select * into a from public.finance_accounts where id=p_account;
  if not found or not app_private.can_read_finance(a.organization_id) then raise exception 'Finance account access required';end if;
  select jsonb_build_object(
    'account_id',a.id,
    'currency',a.currency,
    'balance',public.finance_account_balance(a.id),
    'rows',coalesce(jsonb_agg(to_jsonb(x) order by x.posted_at desc,x.journal_id desc,x.line_no) filter(where x.journal_id is not null),'[]'::jsonb)
  ) into result
  from (
    select
      j.id as journal_id,j.journal_type,j.reference_type,j.reference_id,j.memo as journal_memo,j.reverses_journal_id,j.posted_at,
      p.line_no,p.direction,p.amount,p.memo
    from public.finance_postings p
    join public.finance_journals j on j.id=p.journal_id
    where p.account_id=a.id and (p_before is null or j.posted_at<p_before)
    order by j.posted_at desc,j.id desc,p.line_no
    limit lim
  ) x;
  return result;
end;
$$;

revoke all on function app_private.can_manage_finance(),app_private.can_read_finance(uuid),app_private.validate_finance_account_scope(),app_private.protect_finance_account(),app_private.protect_finance_journal(),app_private.protect_finance_posting(),app_private.assert_finance_journal_balanced() from public,anon,authenticated;

revoke all on function public.create_finance_account(uuid,uuid,uuid,text,text,text,text,text),public.post_finance_journal(uuid,uuid,text,text,text,text,uuid,text,jsonb),public.reverse_finance_journal(uuid,uuid,text),public.finance_account_balance(uuid),public.finance_scope_summary(uuid,uuid),public.finance_account_statement(uuid,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.create_finance_account(uuid,uuid,uuid,text,text,text,text,text),public.post_finance_journal(uuid,uuid,text,text,text,text,uuid,text,jsonb),public.reverse_finance_journal(uuid,uuid,text),public.finance_account_balance(uuid),public.finance_scope_summary(uuid,uuid),public.finance_account_statement(uuid,timestamptz,integer) to authenticated;
