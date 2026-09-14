-- POEM 2.12: source units, immutable journal and manual settlement.
create table public.work_payable_units (
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.work_assignments(id),
 source_kind text not null check(source_kind in ('survey','day','fixed')),response_id uuid unique references public.survey_responses(id),work_date date not null,
 rate numeric(14,2) not null check(rate>0 and rate::text not in ('NaN','Infinity','-Infinity')),currency text not null,terms_snapshot jsonb not null,
 eligible boolean not null default true,status text not null default 'pending' check(status in ('pending','approved','disputed','rejected','voided')),
 note text not null,created_by uuid references public.accounts(id),created_at timestamptz not null default now(),version integer not null default 1,
 check((source_kind='survey')=(response_id is not null))
);
create unique index work_day_once on public.work_payable_units(assignment_id,work_date) where source_kind='day';
create unique index work_fixed_once on public.work_payable_units(assignment_id) where source_kind='fixed';
create index work_units_assignment on public.work_payable_units(assignment_id,created_at,id);
create table public.work_payable_receipts (
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.work_assignments(id),uploaded_by uuid not null references public.accounts(id),filename text not null,mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),size_bytes integer not null check(size_bytes between 1 and 5242880),created_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('work-payable-receipts','work-payable-receipts',false,5242880,array['application/pdf','image/jpeg','image/png']);
create table public.work_payable_events (
 id uuid primary key default gen_random_uuid(),unit_id uuid not null references public.work_payable_units(id),
 assignment_id uuid not null references public.work_assignments(id),
 kind text not null check(kind in ('accrual','adjustment','payment','payment_reversal','dispute','resolve','reject')),
 amount numeric(14,2) not null default 0,note text not null,reference text,occurred_on date,
 reverses uuid unique references public.work_payable_events(id),actor_id uuid references public.accounts(id),created_at timestamptz not null default now(),
 receipt_id uuid unique references public.work_payable_receipts(id),request_id uuid unique,request_payload jsonb,
 check((kind in ('accrual','payment','payment_reversal') and amount>0) or kind='adjustment' or (kind in ('dispute','resolve','reject') and amount=0))
);
create unique index work_payment_reference_once on public.work_payable_events(assignment_id,lower(reference)) where kind='payment';
create index work_events_unit on public.work_payable_events(unit_id,created_at,id);
create function app_private.can_read_payables(a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and exists(select 1 from public.work_assignments w where w.id=a and (w.user_id=auth.uid() or app_private.ngo_admin(w.organization_id)));
$$;
alter table public.work_payable_units enable row level security;
alter table public.work_payable_events enable row level security;
create policy payable_unit_read on public.work_payable_units for select to authenticated using(app_private.can_read_payables(assignment_id));
create policy payable_event_read on public.work_payable_events for select to authenticated using(app_private.can_read_payables(assignment_id));
revoke all on public.work_payable_units,public.work_payable_events from public,anon,authenticated;
grant select on public.work_payable_units,public.work_payable_events to authenticated;

create function app_private.protect_work_terms() returns trigger language plpgsql set search_path='' as $$
 begin
 if (to_jsonb(new)-array['status','version','responded_at','completed_at','completed_by','completion_feedback','completion_note','cancelled_at','cancelled_by','cancellation_note']) is distinct from
 (to_jsonb(old)-array['status','version','responded_at','completed_at','completed_by','completion_feedback','completion_note','cancelled_at','cancelled_by','cancellation_note']) then raise exception 'Contract terms are immutable; offer a replacement assignment';end if;
 return new;
 end;$$;
create trigger protect_work_terms before update on public.work_assignments for each row execute function app_private.protect_work_terms();
create function app_private.payable_snapshot(w public.work_assignments) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('assignment_id',w.id,'organization_id',w.organization_id,'user_id',w.user_id,'project_id',w.survey_project_id,'rate',w.rate,'currency',w.currency,'compensation_type',w.compensation_type,'start_date',w.start_date,'end_date',w.end_date,'terms_note',w.terms_note,'accepted_at',w.responded_at);
$$;
-- Future rate amendments require explicit volunteer acceptance before their start day.
create table public.work_contract_amendments (
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.work_assignments(id),rate numeric(14,2) not null check(rate>0 and rate::text<>'NaN'),effective_on date not null,terms_note text not null,
 status text not null default 'offered' check(status in ('offered','accepted','declined','cancelled')),offered_by uuid not null references public.accounts(id),offered_at timestamptz not null default now(),responded_at timestamptz,
 unique(assignment_id,effective_on)
);
create unique index amendment_pending_once on public.work_contract_amendments(assignment_id) where status='offered';
alter table public.work_contract_amendments enable row level security;
revoke all on public.work_contract_amendments from public,anon,authenticated;
grant select on public.work_contract_amendments to authenticated;
create policy amendment_read on public.work_contract_amendments for select to authenticated using(app_private.can_read_payables(assignment_id));
create function public.offer_work_amendment(p_assignment uuid,p_rate numeric,p_effective date,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
 declare w public.work_assignments;result uuid;
 begin
 select * into w from public.work_assignments where id=p_assignment for update;
 if not found or not app_private.ngo_admin(w.organization_id) or w.user_id=auth.uid() then raise exception 'Independent NGO Admin required';end if;
 if w.status<>'active' or w.work_mode<>'paid' or p_rate is null or p_rate<=0 or p_rate::text in ('NaN','Infinity','-Infinity') or round(p_rate,2)<>p_rate or p_effective is null or p_effective<=(now() at time zone 'UTC')::date or p_effective not between w.start_date and w.end_date or p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Active paid contract, positive rate, future work date and terms required';end if;
 insert into public.work_contract_amendments(assignment_id,rate,effective_on,terms_note,offered_by) values(w.id,p_rate,p_effective,trim(p_note),auth.uid()) returning id into result;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),w.user_id,w.organization_id,'contract_amendment_offered',jsonb_build_object('amendment',result,'rate',p_rate,'effective',p_effective));
 insert into public.notifications(user_id,title,body) values(w.user_id,'Contract amendment offered','Review and accept or decline future rate terms in Workforce payables. Existing earned amounts remain unchanged.');
 return result;
 end;$$;
create function public.respond_work_amendment(p_amendment uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
 declare a public.work_contract_amendments;w public.work_assignments;
 begin
 select * into a from public.work_contract_amendments where id=p_amendment for update;
 if not found or not app_private.can_read_payables(a.assignment_id) then raise exception 'Amendment access required';end if;
 select * into w from public.work_assignments where id=a.assignment_id;
 if p_status is null or not ((auth.uid()=w.user_id and p_status in ('accepted','declined')) or (app_private.ngo_admin(w.organization_id) and w.user_id<>auth.uid() and p_status='cancelled')) then raise exception 'Authorized amendment response required';end if;
 if a.status=p_status then return;end if;
 if a.status<>'offered' or (p_status='accepted' and (a.effective_on<=(now() at time zone 'UTC')::date or w.status<>'active' or not exists(select 1 from public.organizations where id=w.organization_id and status='active'))) then raise exception 'Offer changed or effective day already started';end if;
 update public.work_contract_amendments set status=p_status,responded_at=now() where id=a.id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),w.user_id,w.organization_id,'contract_amendment_'||p_status,jsonb_build_object('amendment',a.id));
 end;$$;
create function app_private.payable_effective_terms(w public.work_assignments,d date) returns jsonb language sql stable security definer set search_path='' as $$
 select app_private.payable_snapshot(w)||coalesce((select jsonb_build_object('amendment_id',a.id,'rate',a.rate,'terms_note',a.terms_note,'effective_on',a.effective_on,'amendment_accepted_at',a.responded_at) from public.work_contract_amendments a where a.assignment_id=w.id and a.status='accepted' and a.effective_on<=d order by a.effective_on desc limit 1),'{}'::jsonb);
$$;
revoke all on function public.offer_work_amendment(uuid,numeric,date,text),public.respond_work_amendment(uuid,text),app_private.payable_effective_terms(public.work_assignments,date) from public,anon,authenticated;
grant execute on function public.offer_work_amendment(uuid,numeric,date,text),public.respond_work_amendment(uuid,text) to authenticated;
-- The response row is always locked before its unit, including manual catch-up.
create function app_private.sync_survey_payable(r public.survey_responses) returns uuid language plpgsql security definer set search_path='' as $$
 declare u public.work_payable_units;w public.work_assignments;net numeric;valid boolean;
 begin
 select * into u from public.work_payable_units where response_id=r.id for update;
 if u.id is null then
  if r.status<>'approved' or r.reviewed_by is null or r.reviewed_by=r.collector_id then return null;end if;
  select * into w from public.work_assignments where survey_project_id=r.project_id and user_id=r.collector_id and work_mode='paid' and compensation_type='per_verified_survey'
   and status in ('active','completed','cancelled') and responded_at is not null and responded_at<=r.created_at
   and (cancelled_at is null or r.created_at<cancelled_at) and (r.created_at at time zone 'UTC')::date between start_date and end_date order by responded_at desc limit 1;
  if w.id is null then return null;end if;
  insert into public.work_payable_units(assignment_id,source_kind,response_id,work_date,rate,currency,terms_snapshot,note,created_by)
   values(w.id,'survey',r.id,(r.created_at at time zone 'UTC')::date,(app_private.payable_effective_terms(w,(r.created_at at time zone 'UTC')::date)->>'rate')::numeric,w.currency,app_private.payable_effective_terms(w,(r.created_at at time zone 'UTC')::date),'Accepted survey; financial approval pending',r.reviewed_by) returning * into u;
 else
  valid:=r.status='approved' and r.reviewed_by is not null and r.reviewed_by<>r.collector_id;
  if valid=u.eligible then return u.id;end if;
  if not valid then
   select coalesce(sum(amount),0) into net from public.work_payable_events where unit_id=u.id and kind in ('accrual','adjustment');
   if net<>0 then insert into public.work_payable_events(unit_id,assignment_id,kind,amount,note,actor_id) values(u.id,u.assignment_id,'adjustment',-net,'Survey approval withdrawn; prior payments retained',auth.uid());end if;
  end if;
  update public.work_payable_units set eligible=valid,status=case when valid then 'pending' else 'voided' end,version=version+1 where id=u.id;
 end if;
 select * into w from public.work_assignments where id=u.assignment_id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),w.user_id,w.organization_id,'survey_payable_reconciled',jsonb_build_object('unit',u.id,'response',r.id,'status',r.status));
 return u.id;
 end;$$;
create function app_private.survey_payable_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin perform app_private.sync_survey_payable(new);return new;end;$$;
create trigger survey_payable_changed after insert or update of status,reviewed_by on public.survey_responses for each row execute function app_private.survey_payable_trigger();
create function public.reconcile_survey_payable(p_response uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare r public.survey_responses;
 begin
 select * into r from public.survey_responses where id=p_response for update;
 if not found or not exists(select 1 from public.survey_projects p where p.id=r.project_id and app_private.ngo_admin(p.organization_id)) then raise exception 'Relevant active NGO Admin required';end if;
 return app_private.sync_survey_payable(r);
 end;$$;

create function public.claim_work_payable(p_assignment uuid,p_day date,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
 declare w public.work_assignments;u uuid;k text;
 begin
 select * into w from public.work_assignments where id=p_assignment for update;
 if not found or not app_private.is_active() or not (auth.uid()=w.user_id or app_private.ngo_admin(w.organization_id)) then raise exception 'Assignment access required';end if;
 if not exists(select 1 from public.organizations where id=w.organization_id and status='active') then raise exception 'Active organization required';end if;
 if w.work_mode<>'paid' or w.responded_at is null or w.status not in ('active','completed','cancelled') then raise exception 'Accepted paid assignment required';end if;
 if p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Work evidence note required (5–2000 characters)';end if;
 k:=case w.compensation_type when 'daily_rate' then 'day' when 'fixed_assignment' then 'fixed' else null end;
 if k is null then raise exception 'Surveys generate units from approval';end if;
 if k='fixed' and (w.status<>'completed' or w.completed_at is null or p_day is distinct from least((w.completed_at at time zone 'UTC')::date,w.end_date)) then raise exception 'Completed assignment required for fixed payment';end if;
 if p_day is null or p_day not between w.start_date and w.end_date or p_day>(now() at time zone 'UTC')::date or p_day<(w.responded_at at time zone 'UTC')::date or (w.cancelled_at is not null and p_day>(w.cancelled_at at time zone 'UTC')::date) then raise exception 'Eligible work date required';end if;
 select id into u from public.work_payable_units where assignment_id=w.id and source_kind=k and (k='fixed' or work_date=p_day);
 if u is not null then return u;end if;
 insert into public.work_payable_units(assignment_id,source_kind,work_date,rate,currency,terms_snapshot,note,created_by) values(w.id,k,p_day,(app_private.payable_effective_terms(w,p_day)->>'rate')::numeric,w.currency,app_private.payable_effective_terms(w,p_day),trim(p_note),auth.uid()) returning id into u;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),w.user_id,w.organization_id,'work_payable_claimed',jsonb_build_object('unit',u,'kind',k,'day',p_day));
 return u;
 end;$$;

-- All monetary calculations and balance checks happen in PostgreSQL numeric.
create function public.act_work_payable(p_unit uuid,p_action text,p_amount numeric,p_note text,p_reference text,p_date date,p_reverses uuid,p_version integer,p_request uuid,p_receipt uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare u public.work_payable_units;w public.work_assignments;prior public.work_payable_events;target public.work_payable_events;payload jsonb;event_id uuid;net numeric;paid numeric;entry_amount numeric;k text;next_status text;is_manager boolean;
 begin
 select * into u from public.work_payable_units where id=p_unit for update;
 if not found or not app_private.can_read_payables(u.assignment_id) then raise exception 'Payable access required';end if;
 select * into w from public.work_assignments where id=u.assignment_id;
 is_manager:=app_private.ngo_admin(w.organization_id) and w.user_id<>auth.uid();
 if p_action is null or p_action not in ('approve','dispute','resolve','reject','adjust','pay','reverse_payment') or (p_action<>'dispute' and not is_manager) then raise exception 'Independent NGO Admin required';end if;
 if p_request is null or p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Request ID and reason required';end if;
 payload:=jsonb_build_object('unit',p_unit,'action',p_action,'amount',p_amount,'note',trim(p_note),'reference',p_reference,'date',p_date,'reverses',p_reverses,'version',p_version,'receipt',p_receipt);
 select * into prior from public.work_payable_events where request_id=p_request;
 if found then
  if prior.actor_id is distinct from auth.uid() or prior.request_payload is distinct from payload then raise exception 'Request ID reused with different details';end if;
  return prior.id;
 end if;
 if u.version is distinct from p_version then raise exception 'Payable changed; reload before continuing';end if;
 if p_amount is not null and (p_amount::text in ('NaN','Infinity','-Infinity') or abs(p_amount)>999999999999.99 or round(p_amount,2)<>p_amount) then raise exception 'Finite amount with at most two decimals required';end if;
 select coalesce(sum(amount) filter(where kind in ('accrual','adjustment')),0),coalesce(sum(case when kind='payment' then amount when kind='payment_reversal' then -amount else 0 end),0) into net,paid from public.work_payable_events where unit_id=u.id;
 entry_amount:=0;next_status:=u.status;
 case p_action
 when 'approve' then
  if not u.eligible or u.status<>'pending' or net<>0 then raise exception 'Eligible pending unit required';end if;
  entry_amount:=u.rate;k:='accrual';next_status:='approved';
 when 'dispute' then
  if u.status='disputed' then raise exception 'Already disputed';end if;
  k:='dispute';next_status:='disputed';
 when 'resolve' then
  if u.status<>'disputed' then raise exception 'Disputed unit required';end if;
  k:='resolve';next_status:=case when not u.eligible then 'voided' when net>0 then 'approved' else 'pending' end;
 when 'reject' then
  if u.status not in ('pending','disputed') or net<>0 then raise exception 'Unaccrued pending or disputed unit required';end if;
  k:='reject';next_status:='rejected';
 when 'adjust' then
  if not u.eligible or u.status<>'approved' or p_amount is null or p_amount=0 or net+p_amount<0 or net+p_amount>u.rate then raise exception 'Adjustment must leave entitlement between zero and snapshot rate';end if;
  k:='adjustment';entry_amount:=p_amount;
 when 'pay' then
  if not u.eligible or u.status<>'approved' or p_amount is null or p_amount<=0 or p_amount>net-paid then raise exception 'Payment exceeds approved available balance or is blocked';end if;
  if p_reference is null or length(trim(p_reference)) not between 3 and 160 or p_date is null or p_date>(now() at time zone 'UTC')::date or p_date<u.work_date then raise exception 'Payment date and unique reference required';end if;
  if p_receipt is not null and not exists(select 1 from public.work_payable_receipts f join storage.objects o on o.bucket_id='work-payable-receipts' and o.name=f.id::text where f.id=p_receipt and f.assignment_id=w.id and f.uploaded_by=auth.uid() and (o.metadata->>'size')::numeric=f.size_bytes and o.metadata->>'mimetype'=f.mime_type) then raise exception 'Uploaded receipt matching this assignment required';end if;
  k:='payment';entry_amount:=p_amount;
 when 'reverse_payment' then
  select * into target from public.work_payable_events where id=p_reverses and unit_id=u.id and kind='payment';
  if not found or exists(select 1 from public.work_payable_events where reverses=p_reverses) then raise exception 'Unreversed payment required';end if;
  k:='payment_reversal';entry_amount:=target.amount;
 end case;
 insert into public.work_payable_events(unit_id,assignment_id,kind,amount,note,reference,occurred_on,reverses,actor_id,request_id,request_payload,receipt_id)
 values(u.id,u.assignment_id,k,entry_amount,trim(p_note),case when k='payment' then trim(p_reference) end,case when k='payment' then p_date end,case when k='payment_reversal' then p_reverses end,auth.uid(),p_request,payload,case when k='payment' then p_receipt end) returning id into event_id;
 update public.work_payable_units set status=next_status,version=version+1 where id=u.id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),w.user_id,w.organization_id,'work_payable_'||p_action,jsonb_build_object('unit',u.id,'event',event_id,'amount',entry_amount,'currency',u.currency));
 insert into public.notifications(user_id,title,body) values(w.user_id,'Work payable updated','An assignment payable has a new accounting event. Open Workforce payables for details.');
 return event_id;
 end;$$;

create function public.work_payable_statement(p_assignment uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;totals jsonb;w public.work_assignments;
 begin
 if not app_private.can_read_payables(p_assignment) then raise exception 'Assignment payable access required';end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Valid page required';end if;
 select * into w from public.work_assignments where id=p_assignment;
 select jsonb_build_object('currency',w.currency,'estimated',coalesce(sum(case when eligible and status='pending' then rate else 0 end),0)::text) into totals from public.work_payable_units where assignment_id=p_assignment;
 select totals||jsonb_build_object('approved',coalesce(sum(amount) filter(where kind in ('accrual','adjustment')),0)::text,'paid',coalesce(sum(case when kind='payment' then amount when kind='payment_reversal' then -amount else 0 end),0)::text,'balance',(coalesce(sum(amount) filter(where kind in ('accrual','adjustment')),0)-coalesce(sum(case when kind='payment' then amount when kind='payment_reversal' then -amount else 0 end),0))::text) into totals from public.work_payable_events where assignment_id=p_assignment;
 select coalesce(jsonb_agg(x order by x.created_at,x.id),'[]'::jsonb) into result from (
 select u.*,coalesce(e.net,0)::text approved_amount,coalesce(e.paid,0)::text paid_amount,(coalesce(e.net,0)-coalesce(e.paid,0))::text balance,
 case when u.status<>'approved' then u.status when coalesce(e.net,0)<coalesce(e.paid,0) then 'overpaid' when coalesce(e.net,0)=coalesce(e.paid,0) then 'settled' when coalesce(e.paid,0)>0 then 'partially_paid' else 'approved' end settlement_status
 from public.work_payable_units u left join lateral(select sum(amount) filter(where kind in ('accrual','adjustment')) net,sum(case when kind='payment' then amount when kind='payment_reversal' then -amount else 0 end) paid from public.work_payable_events where unit_id=u.id) e on true
 where assignment_id=p_assignment order by u.created_at,u.id limit 50 offset p_page*50) x;
 return jsonb_build_object('totals',totals,'rows',result,'count',(select count(*) from public.work_payable_units where assignment_id=p_assignment),'can_manage',app_private.ngo_admin(w.organization_id) and w.user_id<>auth.uid());
 end;$$;
revoke all on function app_private.can_read_payables(uuid),app_private.protect_work_terms(),app_private.payable_snapshot(public.work_assignments),app_private.sync_survey_payable(public.survey_responses),app_private.survey_payable_trigger() from public,anon,authenticated;
grant execute on function app_private.can_read_payables(uuid) to authenticated;
revoke all on function public.reconcile_survey_payable(uuid),public.claim_work_payable(uuid,date,text),public.act_work_payable(uuid,text,numeric,text,text,date,uuid,integer,uuid,uuid),public.work_payable_statement(uuid,integer) from public,anon,authenticated;
grant execute on function public.reconcile_survey_payable(uuid),public.claim_work_payable(uuid,date,text),public.act_work_payable(uuid,text,numeric,text,text,date,uuid,integer,uuid,uuid),public.work_payable_statement(uuid,integer) to authenticated;

alter table public.work_payable_receipts enable row level security;
revoke all on public.work_payable_receipts from public,anon,authenticated;
grant select on public.work_payable_receipts to authenticated;
create policy receipt_metadata_read on public.work_payable_receipts for select to authenticated using(app_private.can_read_payables(assignment_id) and (uploaded_by=auth.uid() or exists(select 1 from public.work_payable_events e where e.receipt_id=work_payable_receipts.id)));
create policy payable_receipt_upload on storage.objects for insert to authenticated with check(bucket_id='work-payable-receipts' and exists(select 1 from public.work_payable_receipts f join public.work_assignments w on w.id=f.assignment_id where f.id::text=name and f.uploaded_by=auth.uid() and w.user_id<>auth.uid() and app_private.ngo_admin(w.organization_id)));
create policy payable_receipt_read on storage.objects for select to authenticated using(bucket_id='work-payable-receipts' and exists(select 1 from public.work_payable_receipts f where f.id::text=name and app_private.can_read_payables(f.assignment_id) and (f.uploaded_by=auth.uid() or exists(select 1 from public.work_payable_events e where e.receipt_id=f.id))));
create function public.reserve_payable_receipt(p_assignment uuid,p_filename text,p_mime text,p_size integer) returns uuid language plpgsql security definer set search_path='' as $$
 declare w public.work_assignments;result uuid;
 begin
 select * into w from public.work_assignments where id=p_assignment;
 if not found or not app_private.ngo_admin(w.organization_id) or w.user_id=auth.uid() then raise exception 'Independent NGO Admin required';end if;
 if p_filename is null or length(trim(p_filename)) not between 1 and 180 or p_mime is null or p_mime not in ('application/pdf','image/jpeg','image/png') or p_size is null or p_size not between 1 and 5242880 then raise exception 'PDF, JPEG or PNG receipt up to 5 MiB required';end if;
 insert into public.work_payable_receipts(assignment_id,uploaded_by,filename,mime_type,size_bytes) values(w.id,auth.uid(),trim(p_filename),p_mime,p_size) returning id into result;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),w.organization_id,'payable_receipt_reserved',jsonb_build_object('id',result,'assignment',w.id));
 return result;
 end;$$;
create function public.authorize_payable_receipt(p_receipt uuid) returns text language plpgsql security definer set search_path='' as $$
 declare f public.work_payable_receipts;w public.work_assignments;
 begin
 select * into f from public.work_payable_receipts where id=p_receipt;
 if not found or not app_private.can_read_payables(f.assignment_id) or not (f.uploaded_by=auth.uid() or exists(select 1 from public.work_payable_events where receipt_id=f.id)) then raise exception 'Receipt access required';end if;
 select * into w from public.work_assignments where id=f.assignment_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),w.organization_id,'payable_receipt_view',jsonb_build_object('id',f.id));
 return f.id::text;
 end;$$;
revoke all on function public.reserve_payable_receipt(uuid,text,text,integer),public.authorize_payable_receipt(uuid) from public,anon,authenticated;
grant execute on function public.reserve_payable_receipt(uuid,text,text,integer),public.authorize_payable_receipt(uuid) to authenticated;

-- Structural invariants supplement RPC permissions.
alter table public.work_payable_units add constraint payable_unit_assignment_unique unique(id,assignment_id);
alter table public.work_payable_receipts add constraint payable_receipt_assignment_unique unique(id,assignment_id);
alter table public.work_payable_events add constraint event_unit_assignment foreign key(unit_id,assignment_id) references public.work_payable_units(id,assignment_id),
 add constraint event_receipt_assignment foreign key(receipt_id,assignment_id) references public.work_payable_receipts(id,assignment_id),
 add constraint event_reversal_required check((kind='payment_reversal')=(reverses is not null)),
 add constraint event_payment_reference_required check((kind='payment')=(reference is not null and occurred_on is not null)),
 add constraint event_amount_finite check(amount::text not in ('NaN','Infinity','-Infinity'));
create function app_private.protect_payable_journal() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Payable journal is append-only; record a correcting event';end;$$;
create trigger protect_payable_journal before update or delete on public.work_payable_events for each row execute function app_private.protect_payable_journal();
create function app_private.protect_payable_unit() returns trigger language plpgsql set search_path='' as $$begin
 if (to_jsonb(new)-array['eligible','status','version']) is distinct from (to_jsonb(old)-array['eligible','status','version']) then raise exception 'Payable source and snapshot are immutable';end if;return new;
end;$$;
create trigger protect_payable_unit before update on public.work_payable_units for each row execute function app_private.protect_payable_unit();
revoke all on function app_private.protect_payable_journal(),app_private.protect_payable_unit() from public,anon,authenticated;

create function app_private.protect_work_amendment() returns trigger language plpgsql set search_path='' as $$begin
 if (to_jsonb(new)-array['status','responded_at']) is distinct from (to_jsonb(old)-array['status','responded_at']) then raise exception 'Amendment terms are immutable';end if;return new;
end;$$;
create trigger protect_work_amendment before update on public.work_contract_amendments for each row execute function app_private.protect_work_amendment();
revoke all on function app_private.protect_work_amendment() from public,anon,authenticated;
