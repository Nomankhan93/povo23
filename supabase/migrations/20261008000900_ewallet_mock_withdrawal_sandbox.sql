-- POEM 2.18.0 — JazzCash & Easypaisa E-Wallet Binding + Mock Withdrawal Sandbox
-- Provider-agnostic withdrawal lifecycle for development/testing only.
-- No live JazzCash/Easypaisa API calls and no bank-account payout surface are introduced here.

create schema if not exists extensions;

create function app_private.normalize_pk_wallet_number(p_value text)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $$
declare digits text:=regexp_replace(coalesce(p_value,''),'[^0-9]','','g');
begin
  if digits ~ '^03[0-9]{9}$' then
    return '92'||substr(digits,2);
  end if;
  if digits ~ '^923[0-9]{9}$' then
    return digits;
  end if;
  raise exception 'Use a valid Pakistan mobile wallet number';
end;
$$;

create function app_private.mask_pk_wallet_number(p_value text)
returns text
language sql
immutable
security definer
set search_path=''
as $$
  select case
    when p_value ~ '^923[0-9]{9}$' then '03•••••'||right(p_value,4)
    else '••••'
  end;
$$;

create function app_private.normalized_wallet_owner_name(p_value text)
returns text
language sql
immutable
security definer
set search_path=''
as $$
  select lower(regexp_replace(trim(coalesce(p_value,'')),'[[:space:]]+',' ','g'));
$$;

create function app_private.withdrawal_pin_crypto_ready()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (
    to_regprocedure('extensions.crypt(text,text)') is not null
    and to_regprocedure('extensions.gen_salt(text,integer)') is not null
  ) or (
    to_regprocedure('public.crypt(text,text)') is not null
    and to_regprocedure('public.gen_salt(text,integer)') is not null
  );
$$;

create function app_private.hash_withdrawal_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare result text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then raise exception 'Transaction PIN must contain exactly 6 digits';end if;
  if not app_private.withdrawal_pin_crypto_ready() then raise exception 'Secure transaction PIN hashing is unavailable';end if;
  if to_regprocedure('extensions.crypt(text,text)') is not null and to_regprocedure('extensions.gen_salt(text,integer)') is not null then
    execute 'select extensions.crypt($1,extensions.gen_salt(''bf'',10))' into result using p_pin;
  else
    execute 'select public.crypt($1,public.gen_salt(''bf'',10))' into result using p_pin;
  end if;
  return result;
end;
$$;

create table public.e_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.accounts(id),
  provider text not null check(provider in ('jazzcash','easypaisa')),
  account_title text not null,
  account_number text not null,
  status text not null default 'pending' check(status in ('pending','verified','rejected','suspended','unlinked')),
  verification_mode text not null default 'mock' check(verification_mode='mock'),
  verification_reference text,
  is_default boolean not null default false,
  verified_at timestamptz,
  rejected_at timestamptz,
  suspended_at timestamptz,
  unlinked_at timestamptz,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(length(account_title) between 2 and 120),
  check(account_number ~ '^923[0-9]{9}$'),
  check(verification_reference is null or length(verification_reference) between 5 and 200),
  check(not is_default or status='verified')
);

create unique index e_wallet_active_provider_once
on public.e_wallets(user_id,provider)
where status<>'unlinked';

create unique index e_wallet_default_once
on public.e_wallets(user_id)
where status='verified' and is_default;

create index e_wallet_user_history
on public.e_wallets(user_id,created_at desc,id);

create table public.e_wallet_security (
  user_id uuid primary key references public.accounts(id),
  pin_hash text not null,
  changed_at timestamptz not null default now()
);

create table public.e_wallet_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.accounts(id),
  wallet_id uuid not null references public.e_wallets(id),
  provider text not null check(provider in ('jazzcash','easypaisa')),
  account_title_snapshot text not null,
  account_masked_snapshot text not null,
  currency text not null default 'PKR' check(currency='PKR'),
  amount numeric(20,2) not null check(amount>=100 and amount<=999999999999.99),
  status text not null default 'requested' check(status in ('requested','processing','succeeded','failed','reversed','cancelled')),
  provider_mode text not null default 'mock' check(provider_mode='mock'),
  provider_reference text not null unique,
  request_id uuid not null unique,
  failure_code text,
  failure_message text,
  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  settled_at timestamptz,
  failed_at timestamptz,
  reversed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1 check(version>0),
  check(length(account_title_snapshot) between 2 and 120),
  check(length(account_masked_snapshot) between 4 and 40),
  check(length(provider_reference) between 10 and 160),
  check(failure_code is null or length(failure_code)<=80),
  check(failure_message is null or length(failure_message)<=500)
);

create index e_wallet_withdrawals_user
on public.e_wallet_withdrawals(user_id,requested_at desc,id);

create index e_wallet_withdrawals_active
on public.e_wallet_withdrawals(user_id,currency,status)
where status in ('requested','processing');

create table public.e_wallet_withdrawal_allocations (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.e_wallet_withdrawals(id),
  unit_id uuid not null references public.work_payable_units(id),
  assignment_id uuid not null references public.work_assignments(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.survey_projects(id),
  currency text not null check(currency='PKR'),
  amount numeric(20,2) not null check(amount>0),
  payment_request_id uuid not null default gen_random_uuid() unique,
  reversal_request_id uuid not null default gen_random_uuid() unique,
  payment_event_id uuid unique references public.work_payable_events(id),
  reversal_event_id uuid unique references public.work_payable_events(id),
  created_at timestamptz not null default now(),
  unique(withdrawal_id,unit_id)
);

create index e_wallet_allocations_unit
on public.e_wallet_withdrawal_allocations(unit_id,withdrawal_id);

create table public.e_wallet_provider_events (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.e_wallet_withdrawals(id),
  provider text not null check(provider in ('jazzcash','easypaisa')),
  event_key uuid not null,
  outcome text not null check(outcome in ('processing','succeeded','failed','reversed')),
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  unique(provider,event_key)
);

alter table public.e_wallets enable row level security;
alter table public.e_wallet_security enable row level security;
alter table public.e_wallet_withdrawals enable row level security;
alter table public.e_wallet_withdrawal_allocations enable row level security;
alter table public.e_wallet_provider_events enable row level security;

revoke all on public.e_wallets,public.e_wallet_security,public.e_wallet_withdrawals,public.e_wallet_withdrawal_allocations,public.e_wallet_provider_events from public,anon,authenticated;
grant all on public.e_wallets,public.e_wallet_security,public.e_wallet_withdrawals,public.e_wallet_withdrawal_allocations,public.e_wallet_provider_events to service_role;

create function app_private.verify_withdrawal_pin(p_user uuid,p_pin text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare stored text;matched boolean:=false;
begin
  if p_user is null or p_pin is null or p_pin !~ '^[0-9]{6}$' then return false;end if;
  select pin_hash into stored from public.e_wallet_security where user_id=p_user;
  if stored is null or not app_private.withdrawal_pin_crypto_ready() then return false;end if;
  if to_regprocedure('extensions.crypt(text,text)') is not null then
    execute 'select extensions.crypt($1,$2)=$2' into matched using p_pin,stored;
  else
    execute 'select public.crypt($1,$2)=$2' into matched using p_pin,stored;
  end if;
  return coalesce(matched,false);
end;
$$;

create function public.configure_withdrawal_pin(p_current text,p_new text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare existing text;new_hash text;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select pin_hash into existing from public.e_wallet_security where user_id=auth.uid() for update;
  if existing is not null and not app_private.verify_withdrawal_pin(auth.uid(),p_current) then raise exception 'Current transaction PIN is incorrect';end if;
  new_hash:=app_private.hash_withdrawal_pin(p_new);
  insert into public.e_wallet_security(user_id,pin_hash,changed_at)
  values(auth.uid(),new_hash,now())
  on conflict(user_id) do update set pin_hash=excluded.pin_hash,changed_at=excluded.changed_at;
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'withdrawal_pin_changed',jsonb_build_object('configured',true));
end;
$$;

create function public.my_withdrawal_security()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  return jsonb_build_object(
    'pin_configured',exists(select 1 from public.e_wallet_security where user_id=auth.uid()),
    'crypto_ready',app_private.withdrawal_pin_crypto_ready()
  );
end;
$$;

create function public.save_my_e_wallet(p_provider text,p_account_title text,p_account_number text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  provider_code text:=lower(trim(coalesce(p_provider,'')));
  title text:=trim(coalesce(p_account_title,''));
  number_code text;
  wallet public.e_wallets;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if provider_code not in ('jazzcash','easypaisa') then raise exception 'JazzCash or Easypaisa required';end if;
  if length(title) not between 2 and 120 then raise exception 'Account holder name required';end if;
  number_code:=app_private.normalize_pk_wallet_number(p_account_number);

  select * into wallet
  from public.e_wallets
  where user_id=auth.uid() and provider=provider_code and status<>'unlinked'
  for update;

  if found then
    if wallet.status in ('verified','suspended') then raise exception 'Verified or suspended wallet details cannot be edited; unlink or resolve it first';end if;
    update public.e_wallets
    set account_title=title,account_number=number_code,status='pending',verification_reference=null,
        rejected_at=null,is_default=false,updated_at=now(),version=version+1
    where id=wallet.id
    returning * into wallet;
  else
    insert into public.e_wallets(user_id,provider,account_title,account_number)
    values(auth.uid(),provider_code,title,number_code)
    returning * into wallet;
  end if;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'e_wallet_saved',jsonb_build_object('wallet',wallet.id,'provider',wallet.provider,'verification_mode','mock'));
  return wallet.id;
end;
$$;

create function public.simulate_mock_e_wallet_verification(p_wallet uuid,p_outcome text,p_event_key uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  wallet public.e_wallets;
  owner_name text;
  outcome text:=lower(trim(coalesce(p_outcome,'')));
  ref text;
  has_default boolean;
begin
  if not app_private.is_admin() then raise exception 'POEM Admin mock-provider access required';end if;
  if p_event_key is null or outcome not in ('verified','rejected') then raise exception 'Mock verification outcome and event key required';end if;
  select * into wallet from public.e_wallets where id=p_wallet for update;
  if not found or wallet.status='unlinked' then raise exception 'E-wallet not found';end if;
  ref:='MOCK-VERIFY-'||p_event_key::text;
  if wallet.verification_reference=ref then return wallet.status;end if;
  if wallet.status='verified' then raise exception 'Wallet is already verified';end if;
  if wallet.status='suspended' then raise exception 'Suspended wallet cannot be mock-verified';end if;

  if outcome='verified' then
    select full_name into owner_name from public.accounts where id=wallet.user_id;
    if app_private.normalized_wallet_owner_name(owner_name)='' or app_private.normalized_wallet_owner_name(owner_name)<>app_private.normalized_wallet_owner_name(wallet.account_title) then
      raise exception 'Mock ownership verification requires the wallet account title to match the POEM account name';
    end if;
    select exists(select 1 from public.e_wallets where user_id=auth.uid() and status='verified' and is_default) into has_default;
    update public.e_wallets
    set status='verified',verification_reference=ref,verified_at=now(),rejected_at=null,is_default=not has_default,
        updated_at=now(),version=version+1
    where id=wallet.id;
  else
    update public.e_wallets
    set status='rejected',verification_reference=ref,rejected_at=now(),verified_at=null,is_default=false,
        updated_at=now(),version=version+1
    where id=wallet.id;
  end if;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),wallet.user_id,'e_wallet_mock_verification',jsonb_build_object('wallet',wallet.id,'provider',wallet.provider,'outcome',outcome,'event_key',p_event_key));
  return outcome;
end;
$$;

create function public.set_default_e_wallet(p_wallet uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare wallet public.e_wallets;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select * into wallet from public.e_wallets where id=p_wallet and user_id=auth.uid() for update;
  if not found or wallet.status<>'verified' then raise exception 'Verified own e-wallet required';end if;
  update public.e_wallets set is_default=false,updated_at=now(),version=version+1 where user_id=auth.uid() and is_default and id<>wallet.id;
  update public.e_wallets set is_default=true,updated_at=now(),version=version+1 where id=wallet.id and not is_default;
end;
$$;

create function public.unlink_my_e_wallet(p_wallet uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare wallet public.e_wallets;next_default uuid;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select * into wallet from public.e_wallets where id=p_wallet and user_id=auth.uid() for update;
  if not found or wallet.status='unlinked' then raise exception 'Linked own e-wallet required';end if;
  if exists(select 1 from public.e_wallet_withdrawals where wallet_id=wallet.id and status in ('requested','processing')) then raise exception 'Resolve pending withdrawals before unlinking this e-wallet';end if;
  update public.e_wallets set status='unlinked',is_default=false,unlinked_at=now(),updated_at=now(),version=version+1 where id=wallet.id;
  if wallet.is_default then
    select id into next_default from public.e_wallets where user_id=auth.uid() and status='verified' and id<>wallet.id order by verified_at nulls last,created_at,id limit 1;
    if next_default is not null then update public.e_wallets set is_default=true,updated_at=now(),version=version+1 where id=next_default;end if;
  end if;
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'e_wallet_unlinked',jsonb_build_object('wallet',wallet.id,'provider',wallet.provider));
end;
$$;

create function public.my_e_wallets()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare rows_json jsonb;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',w.id,'provider',w.provider,'account_title',w.account_title,'account_masked',app_private.mask_pk_wallet_number(w.account_number),
    'status',w.status,'verification_mode',w.verification_mode,'is_default',w.is_default,'verified_at',w.verified_at,
    'version',w.version,'created_at',w.created_at,'updated_at',w.updated_at
  ) order by w.created_at,w.id),'[]'::jsonb)
  into rows_json
  from public.e_wallets w
  where w.user_id=auth.uid() and w.status<>'unlinked';
  return jsonb_build_object('rows',rows_json,'count',jsonb_array_length(rows_json),'max_wallets',2,'providers',jsonb_build_array('jazzcash','easypaisa'),'provider_mode','mock');
end;
$$;

create function app_private.my_withdrawable_totals(p_user uuid,p_currency text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  approved numeric(30,2):=0;
  paid numeric(30,2):=0;
  pending numeric(30,2):=0;
begin
  select
    coalesce(sum(e.amount) filter(where e.kind in ('accrual','adjustment')),0),
    coalesce(sum(case when e.kind='payment' then e.amount when e.kind='payment_reversal' then -e.amount else 0 end),0)
  into approved,paid
  from public.work_payable_events e
  join public.work_payable_units u on u.id=e.unit_id
  join public.work_assignments w on w.id=u.assignment_id
  where w.user_id=p_user and upper(u.currency)=upper(p_currency);

  select coalesce(sum(amount),0) into pending
  from public.e_wallet_withdrawals
  where user_id=p_user and currency=upper(p_currency) and status in ('requested','processing');

  return jsonb_build_object(
    'approved',approved::text,
    'paid',paid::text,
    'gross_balance',greatest(approved-paid,0)::text,
    'pending_withdrawals',pending::text,
    'available',greatest(approved-paid-pending,0)::text
  );
end;
$$;

create function public.my_withdrawal_summary(p_currency text default 'PKR')
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare totals jsonb;currency_code text:=upper(trim(coalesce(p_currency,'')));
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if currency_code<>'PKR' then raise exception 'JazzCash/Easypaisa sandbox withdrawals support PKR only';end if;
  totals:=app_private.my_withdrawable_totals(auth.uid(),currency_code);
  return totals||jsonb_build_object(
    'currency',currency_code,
    'verified_wallets',(select count(*)::int from public.e_wallets where user_id=auth.uid() and status='verified'),
    'pin_configured',exists(select 1 from public.e_wallet_security where user_id=auth.uid()),
    'provider_mode','mock'
  );
end;
$$;

create function public.request_e_wallet_withdrawal(p_wallet uuid,p_amount numeric,p_pin text,p_request uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  wallet public.e_wallets;
  prior public.e_wallet_withdrawals;
  withdrawal_id uuid:=gen_random_uuid();
  remaining numeric(20,2);
  take_amount numeric(20,2);
  net numeric(30,2);
  paid numeric(30,2);
  allocated numeric(30,2);
  available numeric(30,2);
  r record;
  provider_ref text;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_request is null then raise exception 'Request ID required';end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<100 or p_amount>999999999999.99 or round(p_amount,2)<>p_amount then
    raise exception 'Withdrawal amount must be at least PKR 100 with at most two decimal places';
  end if;

  select * into prior from public.e_wallet_withdrawals where request_id=p_request;
  if found then
    if prior.user_id<>auth.uid() or prior.wallet_id<>p_wallet or prior.amount<>p_amount then raise exception 'Request ID reused with different withdrawal details';end if;
    return prior.id;
  end if;

  perform id from public.accounts where id=auth.uid() for update;
  select * into wallet from public.e_wallets where id=p_wallet and user_id=auth.uid() for update;
  if not found or wallet.status<>'verified' then raise exception 'Verified own e-wallet required';end if;
  if not app_private.verify_withdrawal_pin(auth.uid(),p_pin) then raise exception 'Transaction PIN is incorrect';end if;

  provider_ref:='MOCK-'||upper(wallet.provider)||'-'||replace(withdrawal_id::text,'-','');
  insert into public.e_wallet_withdrawals(
    id,user_id,wallet_id,provider,account_title_snapshot,account_masked_snapshot,currency,amount,provider_reference,request_id
  ) values(
    withdrawal_id,auth.uid(),wallet.id,wallet.provider,wallet.account_title,app_private.mask_pk_wallet_number(wallet.account_number),'PKR',p_amount,provider_ref,p_request
  );

  remaining:=p_amount;
  for r in
    select u.id unit_id,u.created_at,u.work_date,w.id assignment_id,w.organization_id,w.survey_project_id project_id
    from public.work_payable_units u
    join public.work_assignments w on w.id=u.assignment_id
    where w.user_id=auth.uid() and u.eligible and u.status='approved' and upper(u.currency)='PKR'
    order by coalesce(u.work_date,(u.created_at at time zone 'UTC')::date),u.created_at,u.id
    for update of u
  loop
    select
      coalesce(sum(e.amount) filter(where e.kind in ('accrual','adjustment')),0),
      coalesce(sum(case when e.kind='payment' then e.amount when e.kind='payment_reversal' then -e.amount else 0 end),0)
    into net,paid
    from public.work_payable_events e where e.unit_id=r.unit_id;

    select coalesce(sum(a.amount),0) into allocated
    from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals wd on wd.id=a.withdrawal_id
    where a.unit_id=r.unit_id and wd.status in ('requested','processing');

    available:=greatest(net-paid-allocated,0);
    if available<=0 then continue;end if;
    take_amount:=least(remaining,available);
    insert into public.e_wallet_withdrawal_allocations(withdrawal_id,unit_id,assignment_id,organization_id,project_id,currency,amount)
    values(withdrawal_id,r.unit_id,r.assignment_id,r.organization_id,r.project_id,'PKR',take_amount);
    remaining:=remaining-take_amount;
    exit when remaining=0;
  end loop;

  if remaining<>0 then raise exception 'Withdrawal exceeds currently available approved earnings';end if;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'e_wallet_withdrawal_requested',jsonb_build_object('withdrawal',withdrawal_id,'provider',wallet.provider,'amount',p_amount,'currency','PKR'));
  insert into public.notifications(user_id,title,body)
  values(auth.uid(),'Withdrawal requested','Your mock e-wallet withdrawal request was created. No real money moves in sandbox mode.');
  return withdrawal_id;
end;
$$;

create function public.cancel_my_e_wallet_withdrawal(p_withdrawal uuid,p_version integer)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare w public.e_wallet_withdrawals;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select * into w from public.e_wallet_withdrawals where id=p_withdrawal and user_id=auth.uid() for update;
  if not found then raise exception 'Withdrawal not found';end if;
  if w.version is distinct from p_version then raise exception 'Withdrawal changed; reload before cancelling';end if;
  if w.status<>'requested' then raise exception 'Only a requested withdrawal can be cancelled';end if;
  update public.e_wallet_withdrawals set status='cancelled',cancelled_at=now(),version=version+1 where id=w.id;
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'e_wallet_withdrawal_cancelled',jsonb_build_object('withdrawal',w.id,'amount',w.amount));
end;
$$;

create function app_private.protect_wallet_reserved_payable_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare settlement text:=nullif(current_setting('app.wallet_settlement',true),'');
begin
  if new.kind not in ('adjustment','payment','payment_reversal') then return new;end if;
  if exists(
    select 1
    from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals w on w.id=a.withdrawal_id
    where a.unit_id=new.unit_id and w.status in ('requested','processing')
  ) and not exists(
    select 1
    from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals w on w.id=a.withdrawal_id
    where a.unit_id=new.unit_id and w.status in ('requested','processing') and w.id::text=settlement
  ) then
    raise exception 'Payable unit is reserved by a pending e-wallet withdrawal';
  end if;
  return new;
end;
$$;

create trigger protect_wallet_reserved_payable_event
before insert on public.work_payable_events
for each row execute function app_private.protect_wallet_reserved_payable_event();

create function public.simulate_mock_e_wallet_provider(p_withdrawal uuid,p_outcome text,p_event_key uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  w public.e_wallet_withdrawals;
  existing public.e_wallet_provider_events;
  outcome text:=lower(trim(coalesce(p_outcome,'')));
  a public.e_wallet_withdrawal_allocations;
  net numeric(30,2);
  paid numeric(30,2);
  event_id uuid;
  payload jsonb;
begin
  if not app_private.is_admin() then raise exception 'POEM Admin mock-provider access required';end if;
  if p_event_key is null or outcome not in ('processing','succeeded','failed','reversed') then raise exception 'Valid mock provider outcome and event key required';end if;
  select * into w from public.e_wallet_withdrawals where id=p_withdrawal for update;
  if not found or w.provider_mode<>'mock' then raise exception 'Mock withdrawal required';end if;

  select * into existing from public.e_wallet_provider_events where provider=w.provider and event_key=p_event_key;
  if found then
    if existing.withdrawal_id<>w.id or existing.outcome<>outcome then raise exception 'Provider event key reused with different details';end if;
    return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'provider_reference',w.provider_reference,'idempotent',true);
  end if;

  payload:=jsonb_build_object('mode','mock','withdrawal_id',w.id,'provider',w.provider,'amount',w.amount,'currency',w.currency,'outcome',outcome);

  if outcome='processing' then
    if w.status='processing' then null;
    elsif w.status='requested' then
      update public.e_wallet_withdrawals set status='processing',processing_at=now(),version=version+1 where id=w.id returning * into w;
    else raise exception 'Only a requested withdrawal can enter processing';end if;

  elsif outcome='failed' then
    if w.status='failed' then null;
    elsif w.status in ('requested','processing') then
      update public.e_wallet_withdrawals
      set status='failed',failure_code='MOCK_DECLINED',failure_message='Mock provider declined this sandbox withdrawal',failed_at=now(),version=version+1
      where id=w.id returning * into w;
    else raise exception 'Only a requested or processing withdrawal can fail';end if;

  elsif outcome='succeeded' then
    if w.status='succeeded' then null;
    elsif w.status in ('requested','processing') then
      perform set_config('app.wallet_settlement',w.id::text,true);
      for a in select * from public.e_wallet_withdrawal_allocations where withdrawal_id=w.id order by created_at,id for update loop
        if a.payment_event_id is not null then continue;end if;
        select
          coalesce(sum(e.amount) filter(where e.kind in ('accrual','adjustment')),0),
          coalesce(sum(case when e.kind='payment' then e.amount when e.kind='payment_reversal' then -e.amount else 0 end),0)
        into net,paid from public.work_payable_events e where e.unit_id=a.unit_id;
        if net-paid<a.amount then raise exception 'Allocated payable balance changed before provider settlement';end if;
        insert into public.work_payable_events(
          unit_id,assignment_id,kind,amount,note,reference,occurred_on,actor_id,request_id,request_payload
        ) values(
          a.unit_id,a.assignment_id,'payment',a.amount,'Mock e-wallet withdrawal settlement',w.provider_reference||':'||left(a.id::text,8),
          (now() at time zone 'UTC')::date,auth.uid(),a.payment_request_id,
          jsonb_build_object('source','e_wallet_withdrawal','withdrawal_id',w.id,'allocation_id',a.id,'provider',w.provider,'mode','mock')
        ) returning id into event_id;
        update public.e_wallet_withdrawal_allocations set payment_event_id=event_id where id=a.id;
        update public.work_payable_units set version=version+1 where id=a.unit_id;
      end loop;
      update public.e_wallet_withdrawals set status='succeeded',settled_at=now(),failure_code=null,failure_message=null,version=version+1 where id=w.id returning * into w;
      insert into public.notifications(user_id,title,body) values(w.user_id,'Withdrawal completed','Your mock e-wallet withdrawal completed. This sandbox event did not call a live provider API.');
    else raise exception 'Only a requested or processing withdrawal can succeed';end if;

  elsif outcome='reversed' then
    if w.status='reversed' then null;
    elsif w.status='succeeded' then
      perform set_config('app.wallet_settlement',w.id::text,true);
      for a in select * from public.e_wallet_withdrawal_allocations where withdrawal_id=w.id order by created_at,id for update loop
        if a.payment_event_id is null then raise exception 'Withdrawal allocation has no payment event to reverse';end if;
        if a.reversal_event_id is not null then continue;end if;
        insert into public.work_payable_events(
          unit_id,assignment_id,kind,amount,note,reverses,actor_id,request_id,request_payload
        ) values(
          a.unit_id,a.assignment_id,'payment_reversal',a.amount,'Mock e-wallet provider reversal',a.payment_event_id,auth.uid(),a.reversal_request_id,
          jsonb_build_object('source','e_wallet_withdrawal_reversal','withdrawal_id',w.id,'allocation_id',a.id,'provider',w.provider,'mode','mock')
        ) returning id into event_id;
        update public.e_wallet_withdrawal_allocations set reversal_event_id=event_id where id=a.id;
        update public.work_payable_units set version=version+1 where id=a.unit_id;
      end loop;
      update public.e_wallet_withdrawals set status='reversed',reversed_at=now(),version=version+1 where id=w.id returning * into w;
      insert into public.notifications(user_id,title,body) values(w.user_id,'Withdrawal reversed','Your mock e-wallet withdrawal was reversed and the payable balance was restored.');
    else raise exception 'Only a succeeded withdrawal can be reversed';end if;
  end if;

  insert into public.e_wallet_provider_events(withdrawal_id,provider,event_key,outcome,payload)
  values(w.id,w.provider,p_event_key,outcome,payload);
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),w.user_id,'e_wallet_mock_provider_event',jsonb_build_object('withdrawal',w.id,'provider',w.provider,'outcome',outcome,'event_key',p_event_key));

  return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'provider_reference',w.provider_reference,'idempotent',false);
end;
$$;

create function public.admin_mock_e_wallet_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare wallets_json jsonb;withdrawals_json jsonb;
begin
  if not app_private.is_admin() then raise exception 'POEM Admin mock-provider access required';end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',w.id,'user_id',w.user_id,'user_name',a.full_name,'provider',w.provider,'account_title',w.account_title,
    'account_masked',app_private.mask_pk_wallet_number(w.account_number),'status',w.status,'created_at',w.created_at,'version',w.version
  ) order by w.created_at,w.id),'[]'::jsonb)
  into wallets_json
  from public.e_wallets w
  join public.accounts a on a.id=w.user_id
  where w.status in ('pending','rejected');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at,x.id),'[]'::jsonb)
  into withdrawals_json
  from (
    select wd.id,wd.user_id,a.full_name user_name,wd.provider,wd.account_masked_snapshot,wd.amount::text amount,wd.currency,
           wd.status,wd.provider_reference,wd.requested_at,wd.processing_at,wd.settled_at,wd.failed_at,wd.reversed_at,wd.version
    from public.e_wallet_withdrawals wd
    join public.accounts a on a.id=wd.user_id
    where wd.provider_mode='mock' and wd.status in ('requested','processing','succeeded')
    order by wd.requested_at,wd.id
    limit 200
  ) x;

  return jsonb_build_object('wallets',wallets_json,'withdrawals',withdrawals_json,'provider_mode','mock');
end;
$$;

create function public.my_e_wallet_withdrawals(p_before timestamptz default null,p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare rows_json jsonb;lim integer:=least(greatest(coalesce(p_limit,50),1),100);
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at desc,x.id desc),'[]'::jsonb)
  into rows_json
  from (
    select w.id,w.provider,w.account_title_snapshot,w.account_masked_snapshot,w.currency,w.amount::text amount,w.status,w.provider_mode,w.provider_reference,
           w.failure_code,w.failure_message,w.requested_at,w.processing_at,w.settled_at,w.failed_at,w.reversed_at,w.cancelled_at,w.version,
           (select count(*)::int from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id) allocation_count
    from public.e_wallet_withdrawals w
    where w.user_id=auth.uid() and (p_before is null or w.requested_at<p_before)
    order by w.requested_at desc,w.id desc
    limit lim
  ) x;
  return jsonb_build_object('rows',rows_json,'count',jsonb_array_length(rows_json),'provider_mode','mock');
end;
$$;

revoke all on function app_private.normalize_pk_wallet_number(text),app_private.mask_pk_wallet_number(text),app_private.normalized_wallet_owner_name(text),app_private.withdrawal_pin_crypto_ready(),app_private.hash_withdrawal_pin(text),app_private.verify_withdrawal_pin(uuid,text),app_private.my_withdrawable_totals(uuid,text),app_private.protect_wallet_reserved_payable_event() from public,anon,authenticated;

revoke all on function public.configure_withdrawal_pin(text,text),public.my_withdrawal_security(),public.save_my_e_wallet(text,text,text),public.simulate_mock_e_wallet_verification(uuid,text,uuid),public.set_default_e_wallet(uuid),public.unlink_my_e_wallet(uuid),public.my_e_wallets(),public.my_withdrawal_summary(text),public.request_e_wallet_withdrawal(uuid,numeric,text,uuid),public.cancel_my_e_wallet_withdrawal(uuid,integer),public.simulate_mock_e_wallet_provider(uuid,text,uuid),public.admin_mock_e_wallet_queue(),public.my_e_wallet_withdrawals(timestamptz,integer) from public,anon,authenticated;

grant execute on function public.configure_withdrawal_pin(text,text),public.my_withdrawal_security(),public.save_my_e_wallet(text,text,text),public.simulate_mock_e_wallet_verification(uuid,text,uuid),public.set_default_e_wallet(uuid),public.unlink_my_e_wallet(uuid),public.my_e_wallets(),public.my_withdrawal_summary(text),public.request_e_wallet_withdrawal(uuid,numeric,text,uuid),public.cancel_my_e_wallet_withdrawal(uuid,integer),public.simulate_mock_e_wallet_provider(uuid,text,uuid),public.admin_mock_e_wallet_queue(),public.my_e_wallet_withdrawals(timestamptz,integer) to authenticated;
