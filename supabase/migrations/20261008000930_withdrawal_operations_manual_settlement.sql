-- POEM 2.18.2 — Withdrawal Operations, Manual Settlement & Provider Reconciliation
-- Makes JazzCash/Easypaisa withdrawals operational without live provider APIs.
-- Manual provider execution is recorded; worker payables and the finance ledger remain authoritative.

alter table public.e_wallet_withdrawals
  drop constraint if exists e_wallet_withdrawals_status_check,
  drop constraint if exists e_wallet_withdrawals_provider_mode_check;

alter table public.e_wallet_withdrawals
  add constraint e_wallet_withdrawals_status_check
    check(status in ('requested','approved','processing','succeeded','failed','reversed','cancelled')),
  add constraint e_wallet_withdrawals_provider_mode_check
    check(provider_mode in ('mock','manual')),
  add column approved_at timestamptz,
  add column approved_by uuid references public.accounts(id),
  add column approval_note text,
  add column processing_by uuid references public.accounts(id),
  add column settled_by uuid references public.accounts(id),
  add column failed_by uuid references public.accounts(id),
  add column reversed_by uuid references public.accounts(id),
  add constraint e_wallet_withdrawal_approval_note_check
    check(approval_note is null or length(approval_note) between 3 and 1000);

drop index if exists public.e_wallet_withdrawals_active;
create index e_wallet_withdrawals_active
on public.e_wallet_withdrawals(user_id,currency,status)
where status in ('requested','approved','processing');

create table public.e_wallet_payout_policy (
  id smallint primary key default 1 check(id=1),
  currency text not null default 'PKR' check(currency='PKR'),
  minimum_withdrawal numeric(20,2) not null default 100 check(minimum_withdrawal>=1),
  maximum_withdrawal numeric(20,2) not null default 500000 check(maximum_withdrawal>=minimum_withdrawal),
  daily_limit numeric(20,2) not null default 1000000 check(daily_limit>=minimum_withdrawal),
  dual_control_threshold numeric(20,2) not null default 50000 check(dual_control_threshold>=minimum_withdrawal),
  manual_settlement_enabled boolean not null default true,
  updated_by uuid references public.accounts(id),
  updated_at timestamptz not null default now()
);

insert into public.e_wallet_payout_policy(id)
values(1)
on conflict(id) do nothing;

alter table public.e_wallet_payout_policy enable row level security;
revoke all on public.e_wallet_payout_policy from public,anon,authenticated;
grant all on public.e_wallet_payout_policy to service_role;

create table public.e_wallet_manual_operations (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.e_wallet_withdrawals(id),
  provider text not null check(provider in ('jazzcash','easypaisa')),
  operation_kind text not null check(operation_kind in ('approval','processing','settlement','failure','reversal')),
  request_id uuid not null unique,
  external_reference text,
  note text not null,
  actor_id uuid not null references public.accounts(id),
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  check(length(note) between 3 and 1000),
  check(external_reference is null or length(external_reference) between 5 and 160),
  check((operation_kind in ('settlement','reversal'))=(external_reference is not null))
);

create unique index e_wallet_manual_external_reference_once
on public.e_wallet_manual_operations(provider,lower(external_reference))
where external_reference is not null;

create index e_wallet_manual_operations_withdrawal
on public.e_wallet_manual_operations(withdrawal_id,created_at,id);

alter table public.e_wallet_manual_operations enable row level security;
revoke all on public.e_wallet_manual_operations from public,anon,authenticated;
grant all on public.e_wallet_manual_operations to service_role;

create function app_private.protect_e_wallet_manual_operation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Withdrawal operation history is immutable';
end;
$$;

create trigger protect_e_wallet_manual_operation
before update or delete on public.e_wallet_manual_operations
for each row execute function app_private.protect_e_wallet_manual_operation();

create function public.e_wallet_payout_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare p public.e_wallet_payout_policy;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select * into p from public.e_wallet_payout_policy where id=1;
  return jsonb_build_object(
    'currency',p.currency,
    'minimum_withdrawal',p.minimum_withdrawal::text,
    'maximum_withdrawal',p.maximum_withdrawal::text,
    'daily_limit',p.daily_limit::text,
    'dual_control_threshold',p.dual_control_threshold::text,
    'manual_settlement_enabled',p.manual_settlement_enabled,
    'updated_at',p.updated_at
  );
end;
$$;

create function public.configure_e_wallet_payout_policy(
  p_minimum numeric,
  p_maximum numeric,
  p_daily numeric,
  p_dual_control numeric,
  p_manual_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare p public.e_wallet_payout_policy;
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if p_minimum is null or p_maximum is null or p_daily is null or p_dual_control is null
     or p_minimum::text in ('NaN','Infinity','-Infinity')
     or p_maximum::text in ('NaN','Infinity','-Infinity')
     or p_daily::text in ('NaN','Infinity','-Infinity')
     or p_dual_control::text in ('NaN','Infinity','-Infinity')
     or round(p_minimum,2)<>p_minimum or round(p_maximum,2)<>p_maximum
     or round(p_daily,2)<>p_daily or round(p_dual_control,2)<>p_dual_control
     or p_minimum<1 or p_maximum<p_minimum or p_daily<p_minimum or p_dual_control<p_minimum then
    raise exception 'Valid PKR payout policy amounts are required';
  end if;

  update public.e_wallet_payout_policy
  set minimum_withdrawal=p_minimum,
      maximum_withdrawal=p_maximum,
      daily_limit=p_daily,
      dual_control_threshold=p_dual_control,
      manual_settlement_enabled=coalesce(p_manual_enabled,false),
      updated_by=auth.uid(),
      updated_at=now()
  where id=1
  returning * into p;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),auth.uid(),'e_wallet_payout_policy_changed',jsonb_build_object(
    'minimum_withdrawal',p.minimum_withdrawal,
    'maximum_withdrawal',p.maximum_withdrawal,
    'daily_limit',p.daily_limit,
    'dual_control_threshold',p.dual_control_threshold,
    'manual_settlement_enabled',p.manual_settlement_enabled
  ));

  return public.e_wallet_payout_policy();
end;
$$;

create or replace function app_private.my_withdrawable_totals(p_user uuid,p_currency text)
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
  where user_id=p_user and currency=upper(p_currency) and status in ('requested','approved','processing');

  return jsonb_build_object(
    'approved',approved::text,
    'paid',paid::text,
    'gross_balance',greatest(approved-paid,0)::text,
    'pending_withdrawals',pending::text,
    'available',greatest(approved-paid-pending,0)::text
  );
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
  if exists(select 1 from public.e_wallet_withdrawals where wallet_id=wallet.id and status in ('requested','approved','processing')) then raise exception 'Resolve pending withdrawals before unlinking this e-wallet';end if;
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

create or replace function public.request_e_wallet_withdrawal(p_wallet uuid,p_amount numeric,p_pin text,p_request uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  wallet public.e_wallets;
  prior public.e_wallet_withdrawals;
  policy public.e_wallet_payout_policy;
  withdrawal_id uuid:=gen_random_uuid();
  remaining numeric(20,2);
  take_amount numeric(20,2);
  net numeric(30,2);
  paid numeric(30,2);
  allocated numeric(30,2);
  available numeric(30,2);
  requested_today numeric(30,2):=0;
  r record;
  provider_ref text;
  pin_result jsonb;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_request is null then raise exception 'Request ID required';end if;

  perform 1 from public.accounts where id=auth.uid() for update;
  select * into policy from public.e_wallet_payout_policy where id=1;

  select * into prior from public.e_wallet_withdrawals where request_id=p_request;
  if found then
    if prior.user_id<>auth.uid() or prior.wallet_id<>p_wallet or prior.amount<>p_amount then raise exception 'Request ID reused with different withdrawal details';end if;
    return prior.id;
  end if;

  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<>p_amount
     or p_amount<policy.minimum_withdrawal or p_amount>policy.maximum_withdrawal then
    raise exception 'Withdrawal amount is outside the configured payout limits';
  end if;

  select coalesce(sum(amount),0) into requested_today
  from public.e_wallet_withdrawals
  where user_id=auth.uid()
    and currency='PKR'
    and status not in ('failed','cancelled','reversed')
    and timezone('Asia/Karachi',requested_at)::date=timezone('Asia/Karachi',now())::date;
  if requested_today+p_amount>policy.daily_limit then raise exception 'Daily withdrawal limit exceeded';end if;

  select * into wallet from public.e_wallets where id=p_wallet and user_id=auth.uid() for update;
  if not found or wallet.status<>'verified' then raise exception 'Verified own e-wallet required';end if;
  if wallet.withdrawal_eligible_at is null or wallet.withdrawal_eligible_at>now() then raise exception 'Verified e-wallet is still in the withdrawal activation hold';end if;

  pin_result:=app_private.check_withdrawal_pin_attempt(auth.uid(),p_pin);
  if not coalesce((pin_result->>'ok')::boolean,false) then return null;end if;

  provider_ref:='POEM-'||upper(wallet.provider)||'-'||replace(withdrawal_id::text,'-','');
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
    into net,paid from public.work_payable_events e where e.unit_id=r.unit_id;

    select coalesce(sum(a.amount),0) into allocated
    from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals wd on wd.id=a.withdrawal_id
    where a.unit_id=r.unit_id and wd.status in ('requested','approved','processing');

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
  values(auth.uid(),'Withdrawal requested','Your JazzCash/Easypaisa withdrawal request was created and its approved earnings are reserved for processing.');
  return withdrawal_id;
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
    select 1 from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals w on w.id=a.withdrawal_id
    where a.unit_id=new.unit_id and w.status in ('requested','approved','processing')
  ) then return new;end if;

  if new.kind='payment' and exists(
    select 1 from public.e_wallet_withdrawal_allocations a
    join public.e_wallet_withdrawals w on w.id=a.withdrawal_id
    where a.unit_id=new.unit_id
      and w.status in ('requested','approved','processing')
      and a.payment_request_id=new.request_id
      and a.assignment_id=new.assignment_id
      and a.amount=new.amount
  ) then return new;end if;

  if new.kind='payment_reversal' and exists(
    select 1 from public.e_wallet_withdrawal_allocations a
    where a.unit_id=new.unit_id
      and a.reversal_request_id=new.request_id
      and a.assignment_id=new.assignment_id
      and a.payment_event_id=new.reverses
      and a.amount=new.amount
  ) then return new;end if;

  raise exception 'Payable unit is reserved by a pending e-wallet withdrawal';
end;
$$;

create function public.approve_manual_e_wallet_withdrawal(p_withdrawal uuid,p_version integer,p_note text,p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare w public.e_wallet_withdrawals;op public.e_wallet_manual_operations;policy public.e_wallet_payout_policy;note text:=trim(coalesce(p_note,''));
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if p_request is null or length(note) not between 3 and 1000 then raise exception 'Approval request and note required';end if;
  select * into policy from public.e_wallet_payout_policy where id=1;
  if not policy.manual_settlement_enabled then raise exception 'Manual e-wallet settlement is disabled';end if;
  select * into op from public.e_wallet_manual_operations where request_id=p_request;
  if found then
    if op.withdrawal_id<>p_withdrawal or op.operation_kind<>'approval' then raise exception 'Operation request ID reused with different details';end if;
    select * into w from public.e_wallet_withdrawals where id=p_withdrawal;
    return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'idempotent',true);
  end if;
  select * into w from public.e_wallet_withdrawals where id=p_withdrawal for update;
  if not found then raise exception 'Withdrawal not found';end if;
  if w.version is distinct from p_version then raise exception 'Withdrawal changed; reload before approval';end if;
  if w.status<>'requested' then raise exception 'Only a requested withdrawal can be approved for manual settlement';end if;
  update public.e_wallet_withdrawals
  set status='approved',provider_mode='manual',approved_at=now(),approved_by=auth.uid(),approval_note=note,version=version+1
  where id=w.id returning * into w;
  insert into public.e_wallet_manual_operations(withdrawal_id,provider,operation_kind,request_id,note,actor_id,payload)
  values(w.id,w.provider,'approval',p_request,note,auth.uid(),jsonb_build_object('amount',w.amount,'currency',w.currency));
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),w.user_id,'e_wallet_withdrawal_approved',jsonb_build_object('withdrawal',w.id,'provider',w.provider,'amount',w.amount,'mode','manual'));
  insert into public.notifications(user_id,title,body)
  values(w.user_id,'Withdrawal approved','Your e-wallet withdrawal was approved for manual provider processing.');
  return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'idempotent',false);
end;
$$;

create function public.start_manual_e_wallet_withdrawal(p_withdrawal uuid,p_version integer,p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare w public.e_wallet_withdrawals;op public.e_wallet_manual_operations;
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if p_request is null then raise exception 'Processing request ID required';end if;
  select * into op from public.e_wallet_manual_operations where request_id=p_request;
  if found then
    if op.withdrawal_id<>p_withdrawal or op.operation_kind<>'processing' then raise exception 'Operation request ID reused with different details';end if;
    select * into w from public.e_wallet_withdrawals where id=p_withdrawal;
    return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'idempotent',true);
  end if;
  select * into w from public.e_wallet_withdrawals where id=p_withdrawal for update;
  if not found or w.provider_mode<>'manual' then raise exception 'Manual withdrawal required';end if;
  if w.version is distinct from p_version then raise exception 'Withdrawal changed; reload before processing';end if;
  if w.status<>'approved' then raise exception 'Only an approved manual withdrawal can enter processing';end if;
  update public.e_wallet_withdrawals
  set status='processing',processing_at=now(),processing_by=auth.uid(),version=version+1
  where id=w.id returning * into w;
  insert into public.e_wallet_manual_operations(withdrawal_id,provider,operation_kind,request_id,note,actor_id,payload)
  values(w.id,w.provider,'processing',p_request,'Manual provider processing started',auth.uid(),jsonb_build_object('amount',w.amount,'currency',w.currency));
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),w.user_id,'e_wallet_withdrawal_processing',jsonb_build_object('withdrawal',w.id,'provider',w.provider,'mode','manual'));
  insert into public.notifications(user_id,title,body)
  values(w.user_id,'Withdrawal processing','Your approved e-wallet withdrawal is being processed manually by POEM.');
  return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'idempotent',false);
end;
$$;

create function public.settle_manual_e_wallet_withdrawal(
  p_withdrawal uuid,p_external_reference text,p_settled_on date,p_note text,p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  w public.e_wallet_withdrawals;
  op public.e_wallet_manual_operations;
  policy public.e_wallet_payout_policy;
  a public.e_wallet_withdrawal_allocations;
  external_ref text:=trim(coalesce(p_external_reference,''));
  note text:=trim(coalesce(p_note,''));
  net numeric(30,2);paid numeric(30,2);event_id uuid;
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if p_request is null or length(external_ref) not between 5 and 160 or length(note) not between 3 and 1000 then raise exception 'External provider reference, settlement note and request ID required';end if;
  if p_settled_on is null or p_settled_on>(now() at time zone 'Asia/Karachi')::date then raise exception 'Valid settlement date required';end if;
  select * into op from public.e_wallet_manual_operations where request_id=p_request;
  if found then
    if op.withdrawal_id<>p_withdrawal or op.operation_kind<>'settlement' or lower(op.external_reference)<>lower(external_ref) then raise exception 'Operation request ID reused with different details';end if;
    select * into w from public.e_wallet_withdrawals where id=p_withdrawal;
    return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'external_reference',external_ref,'idempotent',true);
  end if;
  select * into w from public.e_wallet_withdrawals where id=p_withdrawal for update;
  if not found or w.provider_mode<>'manual' then raise exception 'Manual withdrawal required';end if;
  if w.status<>'processing' then raise exception 'Only a processing manual withdrawal can be settled';end if;
  select * into policy from public.e_wallet_payout_policy where id=1;
  if w.amount>=policy.dual_control_threshold and w.approved_by=auth.uid() then raise exception 'Dual control requires a different finance administrator to settle this withdrawal';end if;
  if exists(select 1 from public.e_wallet_manual_operations where provider=w.provider and lower(external_reference)=lower(external_ref)) then raise exception 'External provider reference is already recorded';end if;

  for a in select * from public.e_wallet_withdrawal_allocations where withdrawal_id=w.id order by created_at,id for update loop
    if a.payment_event_id is not null then continue;end if;
    select
      coalesce(sum(e.amount) filter(where e.kind in ('accrual','adjustment')),0),
      coalesce(sum(case when e.kind='payment' then e.amount when e.kind='payment_reversal' then -e.amount else 0 end),0)
    into net,paid from public.work_payable_events e where e.unit_id=a.unit_id;
    if net-paid<a.amount then raise exception 'Allocated payable balance changed before manual settlement';end if;
    insert into public.work_payable_events(
      unit_id,assignment_id,kind,amount,note,reference,occurred_on,actor_id,request_id,request_payload
    ) values(
      a.unit_id,a.assignment_id,'payment',a.amount,note,external_ref||':'||left(a.id::text,8),p_settled_on,auth.uid(),a.payment_request_id,
      jsonb_build_object('source','e_wallet_withdrawal','withdrawal_id',w.id,'allocation_id',a.id,'provider',w.provider,'mode','manual','external_reference',external_ref)
    ) returning id into event_id;
    update public.e_wallet_withdrawal_allocations set payment_event_id=event_id where id=a.id;
    update public.work_payable_units set version=version+1 where id=a.unit_id;
  end loop;

  update public.e_wallet_withdrawals
  set status='succeeded',settled_at=now(),settled_by=auth.uid(),failure_code=null,failure_message=null,version=version+1
  where id=w.id returning * into w;
  insert into public.e_wallet_manual_operations(withdrawal_id,provider,operation_kind,request_id,external_reference,note,actor_id,payload)
  values(w.id,w.provider,'settlement',p_request,external_ref,note,auth.uid(),jsonb_build_object('amount',w.amount,'currency',w.currency,'settled_on',p_settled_on));
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),w.user_id,'e_wallet_manual_settlement',jsonb_build_object('withdrawal',w.id,'provider',w.provider,'amount',w.amount,'external_reference',external_ref));
  insert into public.notifications(user_id,title,body)
  values(w.user_id,'Withdrawal completed','Your JazzCash/Easypaisa withdrawal was recorded as paid by POEM. Check the settlement reference in withdrawal history.');
  return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'external_reference',external_ref,'idempotent',false);
end;
$$;

create function public.fail_manual_e_wallet_withdrawal(
  p_withdrawal uuid,p_code text,p_note text,p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare w public.e_wallet_withdrawals;op public.e_wallet_manual_operations;code text:=upper(trim(coalesce(p_code,'')));note text:=trim(coalesce(p_note,''));
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if p_request is null or length(code) not between 2 and 80 or length(note) not between 3 and 500 then raise exception 'Failure code, note and request ID required';end if;
  select * into op from public.e_wallet_manual_operations where request_id=p_request;
  if found then
    if op.withdrawal_id<>p_withdrawal or op.operation_kind<>'failure' then raise exception 'Operation request ID reused with different details';end if;
    select * into w from public.e_wallet_withdrawals where id=p_withdrawal;
    return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'idempotent',true);
  end if;
  select * into w from public.e_wallet_withdrawals where id=p_withdrawal for update;
  if not found or w.provider_mode<>'manual' then raise exception 'Manual withdrawal required';end if;
  if w.status not in ('approved','processing') then raise exception 'Only an approved or processing manual withdrawal can fail';end if;
  update public.e_wallet_withdrawals
  set status='failed',failure_code=code,failure_message=note,failed_at=now(),failed_by=auth.uid(),version=version+1
  where id=w.id returning * into w;
  insert into public.e_wallet_manual_operations(withdrawal_id,provider,operation_kind,request_id,note,actor_id,payload)
  values(w.id,w.provider,'failure',p_request,note,auth.uid(),jsonb_build_object('failure_code',code,'amount',w.amount,'currency',w.currency));
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),w.user_id,'e_wallet_manual_failure',jsonb_build_object('withdrawal',w.id,'provider',w.provider,'code',code));
  insert into public.notifications(user_id,title,body)
  values(w.user_id,'Withdrawal failed','Your e-wallet withdrawal could not be completed. Its reserved earnings are available again.');
  return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'idempotent',false);
end;
$$;

create function public.reverse_manual_e_wallet_withdrawal(
  p_withdrawal uuid,p_external_reference text,p_note text,p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  w public.e_wallet_withdrawals;op public.e_wallet_manual_operations;a public.e_wallet_withdrawal_allocations;
  external_ref text:=trim(coalesce(p_external_reference,''));note text:=trim(coalesce(p_note,''));event_id uuid;
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if p_request is null or length(external_ref) not between 5 and 160 or length(note) not between 3 and 1000 then raise exception 'External reversal reference, note and request ID required';end if;
  select * into op from public.e_wallet_manual_operations where request_id=p_request;
  if found then
    if op.withdrawal_id<>p_withdrawal or op.operation_kind<>'reversal' or lower(op.external_reference)<>lower(external_ref) then raise exception 'Operation request ID reused with different details';end if;
    select * into w from public.e_wallet_withdrawals where id=p_withdrawal;
    return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'external_reference',external_ref,'idempotent',true);
  end if;
  select * into w from public.e_wallet_withdrawals where id=p_withdrawal for update;
  if not found or w.provider_mode<>'manual' then raise exception 'Manual withdrawal required';end if;
  if w.status<>'succeeded' then raise exception 'Only a succeeded manual withdrawal can be reversed';end if;
  if exists(select 1 from public.e_wallet_manual_operations where provider=w.provider and lower(external_reference)=lower(external_ref)) then raise exception 'External provider reference is already recorded';end if;
  for a in select * from public.e_wallet_withdrawal_allocations where withdrawal_id=w.id order by created_at,id for update loop
    if a.payment_event_id is null then raise exception 'Withdrawal allocation has no payment event to reverse';end if;
    if a.reversal_event_id is not null then continue;end if;
    insert into public.work_payable_events(
      unit_id,assignment_id,kind,amount,note,reverses,actor_id,request_id,request_payload
    ) values(
      a.unit_id,a.assignment_id,'payment_reversal',a.amount,note,a.payment_event_id,auth.uid(),a.reversal_request_id,
      jsonb_build_object('source','e_wallet_withdrawal_reversal','withdrawal_id',w.id,'allocation_id',a.id,'provider',w.provider,'mode','manual','external_reference',external_ref)
    ) returning id into event_id;
    update public.e_wallet_withdrawal_allocations set reversal_event_id=event_id where id=a.id;
    update public.work_payable_units set version=version+1 where id=a.unit_id;
  end loop;
  update public.e_wallet_withdrawals
  set status='reversed',reversed_at=now(),reversed_by=auth.uid(),version=version+1
  where id=w.id returning * into w;
  insert into public.e_wallet_manual_operations(withdrawal_id,provider,operation_kind,request_id,external_reference,note,actor_id,payload)
  values(w.id,w.provider,'reversal',p_request,external_ref,note,auth.uid(),jsonb_build_object('amount',w.amount,'currency',w.currency));
  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(auth.uid(),w.user_id,'e_wallet_manual_reversal',jsonb_build_object('withdrawal',w.id,'provider',w.provider,'external_reference',external_ref));
  insert into public.notifications(user_id,title,body)
  values(w.user_id,'Withdrawal reversed','The recorded provider payout was reversed and the payable balance was restored.');
  return jsonb_build_object('withdrawal_id',w.id,'status',w.status,'external_reference',external_ref,'idempotent',false);
end;
$$;

create or replace function public.my_e_wallet_withdrawals(p_before timestamptz default null,p_limit integer default 50)
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
           w.failure_code,w.failure_message,w.requested_at,w.approved_at,w.processing_at,w.settled_at,w.failed_at,w.reversed_at,w.cancelled_at,w.version,
           (select o.external_reference from public.e_wallet_manual_operations o where o.withdrawal_id=w.id and o.operation_kind='settlement' order by o.created_at desc,o.id desc limit 1) settlement_reference,
           (select o.external_reference from public.e_wallet_manual_operations o where o.withdrawal_id=w.id and o.operation_kind='reversal' order by o.created_at desc,o.id desc limit 1) reversal_reference,
           (select count(*)::int from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id) allocation_count
    from public.e_wallet_withdrawals w
    where w.user_id=auth.uid() and (p_before is null or w.requested_at<p_before)
    order by w.requested_at desc,w.id desc
    limit lim
  ) x;
  return jsonb_build_object('rows',rows_json,'count',jsonb_array_length(rows_json),'settlement_modes',jsonb_build_array('mock','manual'));
end;
$$;

create function public.admin_e_wallet_operations_queue(p_status text default null,p_provider text default null,p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare rows_json jsonb;policy_json jsonb;lim integer:=least(greatest(coalesce(p_limit,200),1),500);status_filter text:=lower(trim(coalesce(p_status,'')));provider_filter text:=lower(trim(coalesce(p_provider,'')));
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if status_filter<>'' and status_filter not in ('requested','approved','processing','succeeded','failed','reversed','cancelled') then raise exception 'Valid withdrawal status filter required';end if;
  if provider_filter<>'' and provider_filter not in ('jazzcash','easypaisa') then raise exception 'Valid e-wallet provider filter required';end if;
  policy_json:=public.e_wallet_payout_policy();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at,x.id),'[]'::jsonb) into rows_json
  from (
    select w.id,w.user_id,a.full_name user_name,w.provider,w.account_title_snapshot,w.account_masked_snapshot,w.amount::text amount,w.currency,
           w.status,w.provider_mode,w.provider_reference,w.requested_at,w.approved_at,w.approved_by,w.processing_at,w.processing_by,w.settled_at,w.settled_by,
           w.failed_at,w.failed_by,w.failure_code,w.failure_message,w.reversed_at,w.reversed_by,w.cancelled_at,w.version,
           (select count(*)::int from public.e_wallet_withdrawal_allocations al where al.withdrawal_id=w.id) allocation_count,
           (select o.external_reference from public.e_wallet_manual_operations o where o.withdrawal_id=w.id and o.operation_kind='settlement' order by o.created_at desc,o.id desc limit 1) settlement_reference,
           (select o.external_reference from public.e_wallet_manual_operations o where o.withdrawal_id=w.id and o.operation_kind='reversal' order by o.created_at desc,o.id desc limit 1) reversal_reference
    from public.e_wallet_withdrawals w
    join public.accounts a on a.id=w.user_id
    where (status_filter='' or w.status=status_filter)
      and (provider_filter='' or w.provider=provider_filter)
    order by w.requested_at,w.id
    limit lim
  ) x;
  return jsonb_build_object('rows',rows_json,'count',jsonb_array_length(rows_json),'policy',policy_json,'providers',jsonb_build_array('jazzcash','easypaisa'),'settlement_modes',jsonb_build_array('mock','manual'));
end;
$$;

create function public.admin_e_wallet_provider_reconciliation(p_status text default null,p_provider text default null,p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare rows_json jsonb;lim integer:=least(greatest(coalesce(p_limit,200),1),500);status_filter text:=lower(trim(coalesce(p_status,'')));provider_filter text:=lower(trim(coalesce(p_provider,'')));matched_count integer:=0;review_count integer:=0;
begin
  if not app_private.can_manage_finance() then raise exception 'POEM finance administration required';end if;
  if status_filter<>'' and status_filter not in ('requested','approved','processing','succeeded','failed','reversed','cancelled') then raise exception 'Valid withdrawal status filter required';end if;
  if provider_filter<>'' and provider_filter not in ('jazzcash','easypaisa') then raise exception 'Valid e-wallet provider filter required';end if;

  with base as (
    select w.*,
      coalesce((select sum(a.amount) from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id),0)::numeric(30,2) allocation_total,
      (select count(*)::int from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id) allocation_count,
      coalesce((select sum(a.amount) from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id and a.payment_event_id is not null),0)::numeric(30,2) payment_total,
      (select count(*)::int from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id and a.payment_event_id is not null) payment_count,
      (select count(*)::int from public.e_wallet_withdrawal_allocations a join public.finance_payable_event_links l on l.event_id=a.payment_event_id where a.withdrawal_id=w.id and a.payment_event_id is not null) payment_bridge_count,
      coalesce((select sum(a.amount) from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id and a.reversal_event_id is not null),0)::numeric(30,2) reversal_total,
      (select count(*)::int from public.e_wallet_withdrawal_allocations a where a.withdrawal_id=w.id and a.reversal_event_id is not null) reversal_count,
      (select count(*)::int from public.e_wallet_withdrawal_allocations a join public.finance_payable_event_links l on l.event_id=a.reversal_event_id where a.withdrawal_id=w.id and a.reversal_event_id is not null) reversal_bridge_count,
      (select o.external_reference from public.e_wallet_manual_operations o where o.withdrawal_id=w.id and o.operation_kind='settlement' order by o.created_at desc,o.id desc limit 1) settlement_reference,
      (select o.external_reference from public.e_wallet_manual_operations o where o.withdrawal_id=w.id and o.operation_kind='reversal' order by o.created_at desc,o.id desc limit 1) reversal_reference
    from public.e_wallet_withdrawals w
    where (status_filter='' or w.status=status_filter) and (provider_filter='' or w.provider=provider_filter)
    order by w.requested_at desc,w.id desc
    limit lim
  ), assessed as (
    select b.*,
      case
        when b.allocation_total<>b.amount then 'allocation_mismatch'
        when b.status in ('requested','approved','processing','failed','cancelled') and (b.payment_count<>0 or b.reversal_count<>0) then 'unexpected_payable_events'
        when b.status='succeeded' and (b.payment_total<>b.amount or b.payment_count<>b.allocation_count) then 'payment_mismatch'
        when b.status='succeeded' and b.payment_bridge_count<>b.payment_count then 'finance_bridge_mismatch'
        when b.status='succeeded' and b.provider_mode='manual' and b.settlement_reference is null then 'missing_external_reference'
        when b.status='reversed' and (b.payment_total<>b.amount or b.payment_count<>b.allocation_count) then 'payment_mismatch'
        when b.status='reversed' and (b.reversal_total<>b.amount or b.reversal_count<>b.allocation_count) then 'reversal_mismatch'
        when b.status='reversed' and (b.payment_bridge_count<>b.payment_count or b.reversal_bridge_count<>b.reversal_count) then 'finance_bridge_mismatch'
        when b.status='reversed' and b.provider_mode='manual' and (b.settlement_reference is null or b.reversal_reference is null) then 'missing_external_reference'
        else null
      end issue
    from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'withdrawal_id',id,'user_id',user_id,'provider',provider,'amount',amount::text,'currency',currency,'status',status,'provider_mode',provider_mode,
      'provider_reference',provider_reference,'settlement_reference',settlement_reference,'reversal_reference',reversal_reference,
      'allocation_total',allocation_total::text,'allocation_count',allocation_count,'payment_total',payment_total::text,'payment_count',payment_count,
      'payment_bridge_count',payment_bridge_count,'reversal_total',reversal_total::text,'reversal_count',reversal_count,'reversal_bridge_count',reversal_bridge_count,
      'matched',issue is null,'issue',issue,'requested_at',requested_at,'settled_at',settled_at,'reversed_at',reversed_at
    ) order by requested_at desc,id desc),'[]'::jsonb),
    count(*) filter(where issue is null)::int,
    count(*) filter(where issue is not null)::int
  into rows_json,matched_count,review_count
  from assessed;

  return jsonb_build_object('rows',rows_json,'matched',matched_count,'needs_review',review_count,'providers',jsonb_build_array('jazzcash','easypaisa'));
end;
$$;

revoke all on function app_private.protect_e_wallet_manual_operation(),app_private.my_withdrawable_totals(uuid,text),app_private.protect_wallet_reserved_payable_event() from public,anon,authenticated;
revoke all on function public.e_wallet_payout_policy(),public.configure_e_wallet_payout_policy(numeric,numeric,numeric,numeric,boolean),public.approve_manual_e_wallet_withdrawal(uuid,integer,text,uuid),public.start_manual_e_wallet_withdrawal(uuid,integer,uuid),public.settle_manual_e_wallet_withdrawal(uuid,text,date,text,uuid),public.fail_manual_e_wallet_withdrawal(uuid,text,text,uuid),public.reverse_manual_e_wallet_withdrawal(uuid,text,text,uuid),public.admin_e_wallet_operations_queue(text,text,integer),public.admin_e_wallet_provider_reconciliation(text,text,integer) from public,anon,authenticated;

grant execute on function public.e_wallet_payout_policy(),public.configure_e_wallet_payout_policy(numeric,numeric,numeric,numeric,boolean),public.approve_manual_e_wallet_withdrawal(uuid,integer,text,uuid),public.start_manual_e_wallet_withdrawal(uuid,integer,uuid),public.settle_manual_e_wallet_withdrawal(uuid,text,date,text,uuid),public.fail_manual_e_wallet_withdrawal(uuid,text,text,uuid),public.reverse_manual_e_wallet_withdrawal(uuid,text,text,uuid),public.admin_e_wallet_operations_queue(text,text,integer),public.admin_e_wallet_provider_reconciliation(text,text,integer) to authenticated;
