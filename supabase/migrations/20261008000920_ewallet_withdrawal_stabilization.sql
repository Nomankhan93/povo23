-- POEM 2.18.1 — E-Wallet & Withdrawal Stabilization
-- Hardens the JazzCash/Easypaisa mock payout contract without adding live provider APIs or bank payouts.

alter table public.e_wallets
  add column withdrawal_eligible_at timestamptz;

update public.e_wallets
set withdrawal_eligible_at=coalesce(verified_at,updated_at,created_at)+interval '24 hours'
where status='verified' and withdrawal_eligible_at is null;

alter table public.e_wallet_security
  add column failed_attempts integer not null default 0 check(failed_attempts between 0 and 5),
  add column locked_until timestamptz,
  add column last_failed_at timestamptz,
  add column last_success_at timestamptz;

do $$
begin
  if exists(
    select 1
    from public.e_wallets
    where status<>'unlinked'
    group by provider,account_number
    having count(*)>1
  ) then
    raise exception 'Duplicate active e-wallet numbers exist for the same provider; resolve them before applying POEM 2.18.1';
  end if;
end;
$$;

create unique index e_wallet_provider_account_once
on public.e_wallets(provider,account_number)
where status<>'unlinked';

create table public.e_wallet_verification_events (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.e_wallets(id),
  provider text not null check(provider in ('jazzcash','easypaisa')),
  event_key uuid not null,
  event_kind text not null check(event_kind in ('verification','activation_override')),
  outcome text not null check(outcome in ('verified','rejected','eligible')),
  actor_id uuid not null references public.accounts(id),
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  unique(provider,event_key)
);

alter table public.e_wallet_verification_events enable row level security;
revoke all on public.e_wallet_verification_events from public,anon,authenticated;
grant all on public.e_wallet_verification_events to service_role;

create function app_private.check_withdrawal_pin_attempt(p_user uuid,p_pin text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  security_row public.e_wallet_security;
  matched boolean:=false;
  next_attempts integer;
  next_lock timestamptz;
begin
  if p_user is null then
    return jsonb_build_object('ok',false,'code','pin_not_configured','attempts_remaining',0,'locked_until',null);
  end if;

  select * into security_row
  from public.e_wallet_security
  where user_id=p_user
  for update;

  if not found then
    return jsonb_build_object('ok',false,'code','pin_not_configured','attempts_remaining',0,'locked_until',null);
  end if;

  if security_row.locked_until is not null and security_row.locked_until>now() then
    return jsonb_build_object(
      'ok',false,
      'code','pin_locked',
      'attempts_remaining',0,
      'locked_until',security_row.locked_until
    );
  end if;

  if security_row.locked_until is not null and security_row.locked_until<=now() then
    update public.e_wallet_security
    set failed_attempts=0,locked_until=null
    where user_id=p_user;
    security_row.failed_attempts:=0;
    security_row.locked_until:=null;
  end if;

  matched:=app_private.verify_withdrawal_pin(p_user,p_pin);
  if matched then
    update public.e_wallet_security
    set failed_attempts=0,locked_until=null,last_success_at=now()
    where user_id=p_user;
    return jsonb_build_object('ok',true,'code','ok','attempts_remaining',5,'locked_until',null);
  end if;

  next_attempts:=least(coalesce(security_row.failed_attempts,0)+1,5);
  next_lock:=case when next_attempts>=5 then now()+interval '15 minutes' else null end;

  update public.e_wallet_security
  set failed_attempts=next_attempts,
      locked_until=next_lock,
      last_failed_at=now()
  where user_id=p_user;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(
    auth.uid(),p_user,'withdrawal_pin_failed',
    jsonb_build_object(
      'failed_attempts',next_attempts,
      'attempts_remaining',greatest(5-next_attempts,0),
      'locked',next_lock is not null,
      'locked_until',next_lock
    )
  );

  return jsonb_build_object(
    'ok',false,
    'code',case when next_lock is null then 'pin_incorrect' else 'pin_locked' end,
    'attempts_remaining',greatest(5-next_attempts,0),
    'locked_until',next_lock
  );
end;
$$;

create function public.configure_withdrawal_pin_secure(p_current text,p_new text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  existing text;
  new_hash text;
  result jsonb;
  changed timestamptz:=now();
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  perform 1 from public.accounts where id=auth.uid() for update;
  select pin_hash into existing from public.e_wallet_security where user_id=auth.uid();

  if existing is not null then
    result:=app_private.check_withdrawal_pin_attempt(auth.uid(),p_current);
    if not coalesce((result->>'ok')::boolean,false) then return result;end if;
  end if;

  new_hash:=app_private.hash_withdrawal_pin(p_new);
  insert into public.e_wallet_security(user_id,pin_hash,changed_at,failed_attempts,locked_until,last_failed_at,last_success_at)
  values(auth.uid(),new_hash,changed,0,null,null,now())
  on conflict(user_id) do update
  set pin_hash=excluded.pin_hash,
      changed_at=excluded.changed_at,
      failed_attempts=0,
      locked_until=null,
      last_failed_at=null,
      last_success_at=excluded.last_success_at;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'withdrawal_pin_changed',jsonb_build_object('configured',true,'secure_flow',true));

  return jsonb_build_object('ok',true,'code',case when existing is null then 'pin_configured' else 'pin_changed' end,'changed_at',changed,'attempts_remaining',5,'locked_until',null);
end;
$$;

create or replace function public.my_withdrawal_security()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare s public.e_wallet_security;effective_failed integer:=0;active_lock timestamptz;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select * into s from public.e_wallet_security where user_id=auth.uid();
  if not found then
    return jsonb_build_object('pin_configured',false,'crypto_ready',app_private.withdrawal_pin_crypto_ready(),'failed_attempts',0,'attempts_remaining',5,'locked_until',null,'changed_at',null);
  end if;
  if s.locked_until is not null and s.locked_until>now() then
    effective_failed:=5;active_lock:=s.locked_until;
  elsif s.locked_until is not null and s.locked_until<=now() then
    effective_failed:=0;active_lock:=null;
  else
    effective_failed:=s.failed_attempts;active_lock:=null;
  end if;
  return jsonb_build_object(
    'pin_configured',true,
    'crypto_ready',app_private.withdrawal_pin_crypto_ready(),
    'failed_attempts',effective_failed,
    'attempts_remaining',greatest(5-effective_failed,0),
    'locked_until',active_lock,
    'changed_at',s.changed_at,
    'last_failed_at',s.last_failed_at,
    'last_success_at',s.last_success_at
  );
end;
$$;

create or replace function public.save_my_e_wallet(p_provider text,p_account_title text,p_account_number text)
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

  perform 1 from public.accounts where id=auth.uid() for update;

  if exists(
    select 1 from public.e_wallets
    where provider=provider_code and account_number=number_code and status<>'unlinked' and user_id<>auth.uid()
  ) then
    raise exception 'This e-wallet number is already linked to another POEM account for this provider';
  end if;

  select * into wallet
  from public.e_wallets
  where user_id=auth.uid() and provider=provider_code and status<>'unlinked'
  for update;

  if found then
    if wallet.status in ('verified','suspended') then raise exception 'Verified or suspended wallet details cannot be edited; unlink or resolve it first';end if;
    update public.e_wallets
    set account_title=title,
        account_number=number_code,
        status='pending',
        verification_reference=null,
        verified_at=null,
        withdrawal_eligible_at=null,
        rejected_at=null,
        is_default=false,
        updated_at=now(),
        version=version+1
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

create or replace function public.simulate_mock_e_wallet_verification(p_wallet uuid,p_outcome text,p_event_key uuid)
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
  existing public.e_wallet_verification_events;
  eligible_at timestamptz;
begin
  if not app_private.is_admin() then raise exception 'POEM Admin mock-provider access required';end if;
  if p_event_key is null or outcome not in ('verified','rejected') then raise exception 'Mock verification outcome and event key required';end if;

  select * into wallet from public.e_wallets where id=p_wallet for update;
  if not found or wallet.status='unlinked' then raise exception 'E-wallet not found';end if;

  select * into existing
  from public.e_wallet_verification_events
  where provider=wallet.provider and event_key=p_event_key;
  if found then
    if existing.wallet_id<>wallet.id or existing.event_kind<>'verification' or existing.outcome<>outcome then
      raise exception 'Verification event key reused with different wallet or outcome';
    end if;
    return wallet.status;
  end if;

  ref:='MOCK-VERIFY-'||p_event_key::text;
  if wallet.verification_reference=ref then return wallet.status;end if;
  if wallet.status='verified' then raise exception 'Wallet is already verified';end if;
  if wallet.status='suspended' then raise exception 'Suspended wallet cannot be mock-verified';end if;

  if outcome='verified' then
    perform 1 from public.accounts where id=wallet.user_id for update;
    select full_name into owner_name from public.accounts where id=wallet.user_id;
    if app_private.normalized_wallet_owner_name(owner_name)='' or app_private.normalized_wallet_owner_name(owner_name)<>app_private.normalized_wallet_owner_name(wallet.account_title) then
      raise exception 'Mock ownership verification requires the wallet account title to match the POEM account name';
    end if;
    if exists(
      select 1 from public.e_wallets
      where provider=wallet.provider and account_number=wallet.account_number and status<>'unlinked' and id<>wallet.id
    ) then
      raise exception 'This e-wallet number is already linked to another POEM account for this provider';
    end if;
    select exists(
      select 1 from public.e_wallets
      where user_id=wallet.user_id and id<>wallet.id and status='verified' and is_default
    ) into has_default;
    eligible_at:=now()+interval '24 hours';
    update public.e_wallets
    set status='verified',
        verification_reference=ref,
        verified_at=now(),
        withdrawal_eligible_at=eligible_at,
        rejected_at=null,
        is_default=not has_default,
        updated_at=now(),
        version=version+1
    where id=wallet.id;
  else
    update public.e_wallets
    set status='rejected',
        verification_reference=ref,
        rejected_at=now(),
        verified_at=null,
        withdrawal_eligible_at=null,
        is_default=false,
        updated_at=now(),
        version=version+1
    where id=wallet.id;
  end if;

  insert into public.e_wallet_verification_events(wallet_id,provider,event_key,event_kind,outcome,actor_id,payload)
  values(wallet.id,wallet.provider,p_event_key,'verification',outcome,auth.uid(),jsonb_build_object('mode','mock','withdrawal_eligible_at',eligible_at));

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),wallet.user_id,'e_wallet_mock_verification',jsonb_build_object('wallet',wallet.id,'provider',wallet.provider,'outcome',outcome,'event_key',p_event_key,'withdrawal_eligible_at',eligible_at));
  return outcome;
end;
$$;

create function public.simulate_mock_e_wallet_activation(p_wallet uuid,p_event_key uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  wallet public.e_wallets;
  existing public.e_wallet_verification_events;
  eligible_at timestamptz:=now();
begin
  if not app_private.is_admin() then raise exception 'POEM Admin mock-provider access required';end if;
  if p_event_key is null then raise exception 'Mock activation event key required';end if;
  select * into wallet from public.e_wallets where id=p_wallet for update;
  if not found or wallet.status<>'verified' then raise exception 'Verified mock e-wallet required';end if;

  select * into existing from public.e_wallet_verification_events where provider=wallet.provider and event_key=p_event_key;
  if found then
    if existing.wallet_id<>wallet.id or existing.event_kind<>'activation_override' or existing.outcome<>'eligible' then
      raise exception 'Verification event key reused with different wallet or outcome';
    end if;
    return wallet.withdrawal_eligible_at;
  end if;

  if wallet.withdrawal_eligible_at is null or wallet.withdrawal_eligible_at<=now() then
    raise exception 'Wallet is already eligible for withdrawal';
  end if;

  update public.e_wallets
  set withdrawal_eligible_at=eligible_at,updated_at=now(),version=version+1
  where id=wallet.id;

  insert into public.e_wallet_verification_events(wallet_id,provider,event_key,event_kind,outcome,actor_id,payload)
  values(wallet.id,wallet.provider,p_event_key,'activation_override','eligible',auth.uid(),jsonb_build_object('mode','mock','reason','development sandbox activation override'));

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),wallet.user_id,'e_wallet_mock_activation_override',jsonb_build_object('wallet',wallet.id,'provider',wallet.provider,'event_key',p_event_key));

  return eligible_at;
end;
$$;

create or replace function public.set_default_e_wallet(p_wallet uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare wallet public.e_wallets;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  perform 1 from public.accounts where id=auth.uid() for update;
  select * into wallet from public.e_wallets where id=p_wallet and user_id=auth.uid() for update;
  if not found or wallet.status<>'verified' then raise exception 'Verified own e-wallet required';end if;
  update public.e_wallets set is_default=false,updated_at=now(),version=version+1 where user_id=auth.uid() and is_default and id<>wallet.id;
  update public.e_wallets set is_default=true,updated_at=now(),version=version+1 where id=wallet.id and not is_default;
end;
$$;

create or replace function public.unlink_my_e_wallet(p_wallet uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare wallet public.e_wallets;next_default uuid;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  perform 1 from public.accounts where id=auth.uid() for update;
  select * into wallet from public.e_wallets where id=p_wallet and user_id=auth.uid() for update;
  if not found or wallet.status='unlinked' then raise exception 'Linked own e-wallet required';end if;
  if exists(select 1 from public.e_wallet_withdrawals where wallet_id=wallet.id and status in ('requested','processing')) then raise exception 'Resolve pending withdrawals before unlinking this e-wallet';end if;
  update public.e_wallets
  set status='unlinked',is_default=false,unlinked_at=now(),withdrawal_eligible_at=null,updated_at=now(),version=version+1
  where id=wallet.id;
  if wallet.is_default then
    select id into next_default from public.e_wallets where user_id=auth.uid() and status='verified' and id<>wallet.id order by verified_at nulls last,created_at,id limit 1;
    if next_default is not null then update public.e_wallets set is_default=true,updated_at=now(),version=version+1 where id=next_default;end if;
  end if;
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'e_wallet_unlinked',jsonb_build_object('wallet',wallet.id,'provider',wallet.provider));
end;
$$;

create or replace function public.my_e_wallets()
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
    'id',w.id,
    'provider',w.provider,
    'account_title',w.account_title,
    'account_masked',app_private.mask_pk_wallet_number(w.account_number),
    'status',w.status,
    'verification_mode',w.verification_mode,
    'is_default',w.is_default,
    'verified_at',w.verified_at,
    'withdrawal_eligible_at',w.withdrawal_eligible_at,
    'withdrawal_eligible',(w.status='verified' and w.withdrawal_eligible_at is not null and w.withdrawal_eligible_at<=now()),
    'version',w.version,
    'created_at',w.created_at,
    'updated_at',w.updated_at
  ) order by w.created_at,w.id),'[]'::jsonb)
  into rows_json
  from public.e_wallets w
  where w.user_id=auth.uid() and w.status<>'unlinked';
  return jsonb_build_object('rows',rows_json,'count',jsonb_array_length(rows_json),'max_wallets',2,'providers',jsonb_build_array('jazzcash','easypaisa'),'provider_mode','mock','activation_hold_hours',24);
end;
$$;

create or replace function public.request_e_wallet_withdrawal(p_wallet uuid,p_amount numeric,p_pin text,p_request uuid)
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
  pin_result jsonb;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_request is null then raise exception 'Request ID required';end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<100 or p_amount>999999999999.99 or round(p_amount,2)<>p_amount then
    raise exception 'Withdrawal amount must be at least PKR 100 with at most two decimal places';
  end if;

  -- Serializes request-id replay and aggregate withdrawal reservations for this account.
  perform 1 from public.accounts where id=auth.uid() for update;

  select * into prior from public.e_wallet_withdrawals where request_id=p_request;
  if found then
    if prior.user_id<>auth.uid() or prior.wallet_id<>p_wallet or prior.amount<>p_amount then raise exception 'Request ID reused with different withdrawal details';end if;
    return prior.id;
  end if;

  select * into wallet from public.e_wallets where id=p_wallet and user_id=auth.uid() for update;
  if not found or wallet.status<>'verified' then raise exception 'Verified own e-wallet required';end if;
  if wallet.withdrawal_eligible_at is null or wallet.withdrawal_eligible_at>now() then
    raise exception 'Verified e-wallet is still in the withdrawal activation hold';
  end if;

  pin_result:=app_private.check_withdrawal_pin_attempt(auth.uid(),p_pin);
  if not coalesce((pin_result->>'ok')::boolean,false) then return null;end if;

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

create or replace function public.cancel_my_e_wallet_withdrawal(p_withdrawal uuid,p_version integer)
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
  insert into public.notifications(user_id,title,body)
  values(auth.uid(),'Withdrawal cancelled','Your withdrawal request was cancelled before provider processing and the reserved earnings are available again.');
end;
$$;

create or replace function app_private.protect_wallet_reserved_payable_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.kind not in ('adjustment','payment','payment_reversal') then return new;end if;

  if not exists(
    select 1
    from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals w on w.id=a.withdrawal_id
    where a.unit_id=new.unit_id and w.status in ('requested','processing')
  ) then
    return new;
  end if;

  -- A settlement payment is allowed only for the exact server-generated allocation request id.
  if new.kind='payment' and exists(
    select 1
    from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals w on w.id=a.withdrawal_id
    where a.unit_id=new.unit_id
      and w.status in ('requested','processing')
      and a.payment_request_id=new.request_id
      and a.assignment_id=new.assignment_id
      and a.amount=new.amount
  ) then
    return new;
  end if;

  -- A provider reversal may need to restore a prior payment even while another withdrawal reserves the unit.
  if new.kind='payment_reversal' and exists(
    select 1
    from public.e_wallet_withdrawal_allocations a
    where a.unit_id=new.unit_id
      and a.reversal_request_id=new.request_id
      and a.assignment_id=new.assignment_id
      and a.payment_event_id=new.reverses
      and a.amount=new.amount
  ) then
    return new;
  end if;

  raise exception 'Payable unit is reserved by a pending e-wallet withdrawal';
end;
$$;

create or replace function public.simulate_mock_e_wallet_provider(p_withdrawal uuid,p_outcome text,p_event_key uuid)
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
      insert into public.notifications(user_id,title,body)
      values(w.user_id,'Withdrawal failed','The mock e-wallet provider declined this sandbox withdrawal. Reserved earnings are available again.');
    else raise exception 'Only a requested or processing withdrawal can fail';end if;

  elsif outcome='succeeded' then
    if w.status='succeeded' then null;
    elsif w.status in ('requested','processing') then
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

create or replace function public.admin_mock_e_wallet_queue()
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
    'id',w.id,
    'user_id',w.user_id,
    'user_name',a.full_name,
    'provider',w.provider,
    'account_title',w.account_title,
    'account_masked',app_private.mask_pk_wallet_number(w.account_number),
    'status',w.status,
    'withdrawal_eligible_at',w.withdrawal_eligible_at,
    'withdrawal_eligible',(w.status='verified' and w.withdrawal_eligible_at is not null and w.withdrawal_eligible_at<=now()),
    'created_at',w.created_at,
    'version',w.version
  ) order by w.created_at,w.id),'[]'::jsonb)
  into wallets_json
  from public.e_wallets w
  join public.accounts a on a.id=w.user_id
  where w.status in ('pending','rejected')
     or (w.status='verified' and w.withdrawal_eligible_at is not null and w.withdrawal_eligible_at>now());

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

  return jsonb_build_object('wallets',wallets_json,'withdrawals',withdrawals_json,'provider_mode','mock','activation_hold_hours',24);
end;
$$;

revoke all on function app_private.check_withdrawal_pin_attempt(uuid,text) from public,anon,authenticated;
revoke all on function public.configure_withdrawal_pin(text,text) from authenticated;
revoke all on function public.configure_withdrawal_pin_secure(text,text),public.simulate_mock_e_wallet_activation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.configure_withdrawal_pin_secure(text,text),public.simulate_mock_e_wallet_activation(uuid,uuid) to authenticated;
