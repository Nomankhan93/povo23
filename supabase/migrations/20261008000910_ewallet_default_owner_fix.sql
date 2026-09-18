-- POEM 2.18.0 follow-up
-- Fix default-wallet ownership lookup during mock verification.
--
-- simulate_mock_e_wallet_verification() is executed by a POEM Admin,
-- so auth.uid() identifies the administrator, not the wallet owner.
-- The first verified wallet for the actual wallet owner should become
-- default; later verified wallets must remain non-default.
--
-- Also serialize verification per wallet owner to avoid concurrent
-- verification attempts creating competing defaults.

create or replace function public.simulate_mock_e_wallet_verification(
  p_wallet uuid,
  p_outcome text,
  p_event_key uuid
)
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
  if not app_private.is_admin() then
    raise exception 'POEM Admin mock-provider access required';
  end if;

  if p_event_key is null or outcome not in ('verified','rejected') then
    raise exception 'Mock verification outcome and event key required';
  end if;

  select *
  into wallet
  from public.e_wallets
  where id=p_wallet
  for update;

  if not found or wallet.status='unlinked' then
    raise exception 'E-wallet not found';
  end if;

  ref:='MOCK-VERIFY-'||p_event_key::text;

  if wallet.verification_reference=ref then
    return wallet.status;
  end if;

  if wallet.status='verified' then
    raise exception 'Wallet is already verified';
  end if;

  if wallet.status='suspended' then
    raise exception 'Suspended wallet cannot be mock-verified';
  end if;

  if outcome='verified' then

    -- Serialize default-wallet selection for this wallet owner.
    perform 1
    from public.accounts
    where id=wallet.user_id
    for update;

    select full_name
    into owner_name
    from public.accounts
    where id=wallet.user_id;

    if app_private.normalized_wallet_owner_name(owner_name)=''
       or app_private.normalized_wallet_owner_name(owner_name)
          <> app_private.normalized_wallet_owner_name(wallet.account_title)
    then
      raise exception
        'Mock ownership verification requires the wallet account title to match the POEM account name';
    end if;

    select exists(
      select 1
      from public.e_wallets
      where user_id=wallet.user_id
        and id<>wallet.id
        and status='verified'
        and is_default
    )
    into has_default;

    update public.e_wallets
    set
      status='verified',
      verification_reference=ref,
      verified_at=now(),
      rejected_at=null,
      is_default=not has_default,
      updated_at=now(),
      version=version+1
    where id=wallet.id;

  else

    update public.e_wallets
    set
      status='rejected',
      verification_reference=ref,
      rejected_at=now(),
      verified_at=null,
      is_default=false,
      updated_at=now(),
      version=version+1
    where id=wallet.id;

  end if;

  insert into public.audit_events(
    actor_id,
    subject_id,
    action,
    detail
  )
  values(
    auth.uid(),
    wallet.user_id,
    'e_wallet_mock_verification',
    jsonb_build_object(
      'wallet',wallet.id,
      'provider',wallet.provider,
      'outcome',outcome,
      'event_key',p_event_key
    )
  );

  return outcome;
end;
$$;

revoke all
on function public.simulate_mock_e_wallet_verification(uuid,text,uuid)
from public,anon,authenticated;

grant execute
on function public.simulate_mock_e_wallet_verification(uuid,text,uuid)
to authenticated;
