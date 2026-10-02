-- Production has no live wallet verification provider. Sandbox enrollment and
-- mock outcomes are off unless a database administrator explicitly enables a
-- dedicated development database. No browser role can write this setting.
create table app_private.wallet_capabilities (
 singleton boolean primary key default true check(singleton),
 sandbox_enabled boolean not null default false
);
insert into app_private.wallet_capabilities(singleton,sandbox_enabled) values(true,false);
revoke all on app_private.wallet_capabilities from public,anon,authenticated,service_role;

create function app_private.wallet_sandbox_enabled() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select sandbox_enabled from app_private.wallet_capabilities where singleton),false)
$$;
revoke all on function app_private.wallet_sandbox_enabled() from public,anon,authenticated,service_role;

create function public.wallet_capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 return jsonb_build_object(
  'sandbox_enabled',app_private.wallet_sandbox_enabled(),
  'enrollment_available',app_private.wallet_sandbox_enabled(),
  'production_verification_available',false,
  'verification_mode',case when app_private.wallet_sandbox_enabled() then 'mock' else 'unavailable' end
 );
end;
$$;
revoke all on function public.wallet_capabilities() from public,anon,authenticated;
grant execute on function public.wallet_capabilities() to authenticated;

-- Preserve existing implementations and their data/accounting rules behind
-- guarded public entry points. Private implementations have no client grants.
alter function public.save_my_e_wallet(text,text,text) set schema app_private;
alter function public.simulate_mock_e_wallet_verification(uuid,text,uuid) set schema app_private;
alter function public.simulate_mock_e_wallet_activation(uuid,uuid) set schema app_private;
alter function public.simulate_mock_e_wallet_provider(uuid,text,uuid) set schema app_private;
alter function public.admin_mock_e_wallet_queue() set schema app_private;
revoke all on function
 app_private.save_my_e_wallet(text,text,text),
 app_private.simulate_mock_e_wallet_verification(uuid,text,uuid),
 app_private.simulate_mock_e_wallet_activation(uuid,uuid),
 app_private.simulate_mock_e_wallet_provider(uuid,text,uuid),
 app_private.admin_mock_e_wallet_queue()
 from public,anon,authenticated,service_role;

create function public.save_my_e_wallet(p_provider text,p_account_title text,p_account_number text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not app_private.wallet_sandbox_enabled() then raise exception 'Wallet enrollment and verification are unavailable in this environment';end if;
 return app_private.save_my_e_wallet(p_provider,p_account_title,p_account_number);
end;
$$;
create function public.simulate_mock_e_wallet_verification(p_wallet uuid,p_outcome text,p_event_key uuid)
returns text language plpgsql security definer set search_path='' as $$
begin
 if not app_private.wallet_sandbox_enabled() then raise exception 'Wallet sandbox is disabled in this environment';end if;
 return app_private.simulate_mock_e_wallet_verification(p_wallet,p_outcome,p_event_key);
end;
$$;
create function public.simulate_mock_e_wallet_activation(p_wallet uuid,p_event_key uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
begin
 if not app_private.wallet_sandbox_enabled() then raise exception 'Wallet sandbox is disabled in this environment';end if;
 return app_private.simulate_mock_e_wallet_activation(p_wallet,p_event_key);
end;
$$;
create function public.simulate_mock_e_wallet_provider(p_withdrawal uuid,p_outcome text,p_event_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not app_private.wallet_sandbox_enabled() then raise exception 'Wallet sandbox is disabled in this environment';end if;
 return app_private.simulate_mock_e_wallet_provider(p_withdrawal,p_outcome,p_event_key);
end;
$$;
create function public.admin_mock_e_wallet_queue()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not app_private.wallet_sandbox_enabled() then raise exception 'Wallet sandbox is disabled in this environment';end if;
 return app_private.admin_mock_e_wallet_queue();
end;
$$;
revoke all on function public.save_my_e_wallet(text,text,text),
 public.simulate_mock_e_wallet_verification(uuid,text,uuid),
 public.simulate_mock_e_wallet_activation(uuid,uuid),
 public.simulate_mock_e_wallet_provider(uuid,text,uuid),
 public.admin_mock_e_wallet_queue() from public,anon,authenticated;
grant execute on function public.save_my_e_wallet(text,text,text),
 public.simulate_mock_e_wallet_verification(uuid,text,uuid),
 public.simulate_mock_e_wallet_activation(uuid,uuid),
 public.simulate_mock_e_wallet_provider(uuid,text,uuid),
 public.admin_mock_e_wallet_queue() to authenticated;

-- RPC execution owner must reach the preserved private implementations even
-- when local migrations were previously applied by the other trusted owner.
do $$
declare f regprocedure;
begin
 foreach f in array array[
 'app_private.save_my_e_wallet(text,text,text)'::regprocedure,
 'app_private.simulate_mock_e_wallet_verification(uuid,text,uuid)'::regprocedure,
 'app_private.simulate_mock_e_wallet_activation(uuid,uuid)'::regprocedure,
 'app_private.simulate_mock_e_wallet_provider(uuid,text,uuid)'::regprocedure,
 'app_private.admin_mock_e_wallet_queue()'::regprocedure]
 loop execute format('grant execute on function %s to %I',f,current_user);end loop;
end;$$;
