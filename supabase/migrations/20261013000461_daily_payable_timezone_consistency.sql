-- FieldLance 2.41.1 corrective: daily-rate payable recovery must use the approved
-- attendance workday (which is project-timezone based) rather than reinterpreting
-- that date against the current UTC calendar day.
create or replace function public.claim_work_payable(p_assignment uuid,p_day date,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.work_assignments;u uuid;k text;s public.assignment_work_sessions;
begin
  select * into w from public.work_assignments where id=p_assignment for update;
  if not found or not app_private.is_active() or not (auth.uid()=w.user_id or app_private.ngo_admin(w.organization_id)) then raise exception 'Assignment access required';end if;
  if not exists(select 1 from public.organizations where id=w.organization_id and status='active') then raise exception 'Active organization required';end if;
  if w.work_mode<>'paid' or w.responded_at is null or w.status not in ('active','completed','cancelled') then raise exception 'Accepted paid assignment required';end if;
  if p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Work evidence note required (5–2000 characters)';end if;
  k:=case w.compensation_type when 'daily_rate' then 'day' when 'fixed_assignment' then 'fixed' else null end;
  if k is null then raise exception 'Surveys generate units from approval';end if;

  if k='fixed' then
    if w.status<>'completed' or w.completed_at is null or p_day is distinct from least((w.completed_at at time zone 'UTC')::date,w.end_date) then raise exception 'Completed assignment required for fixed payment';end if;
    if p_day is null or p_day not between w.start_date and w.end_date or p_day>(now() at time zone 'UTC')::date or p_day<(w.responded_at at time zone 'UTC')::date or (w.cancelled_at is not null and p_day>(w.cancelled_at at time zone 'UTC')::date) then raise exception 'Eligible work date required';end if;
  else
    if p_day is null or p_day not between w.start_date and w.end_date then raise exception 'Eligible work date required';end if;
    select * into s from public.assignment_work_sessions where assignment_id=w.id and work_date=p_day and status='approved';
    if not found then raise exception 'Approved attendance required for daily-rate payable';end if;
    if s.check_in_captured_at<w.responded_at or (w.cancelled_at is not null and s.check_in_captured_at>w.cancelled_at) then raise exception 'Eligible work date required';end if;
  end if;

  select id into u from public.work_payable_units where assignment_id=w.id and source_kind=k and (k='fixed' or work_date=p_day);
  if u is null then
    insert into public.work_payable_units(assignment_id,source_kind,work_date,rate,currency,terms_snapshot,note,created_by)
    values(w.id,k,p_day,(app_private.payable_effective_terms(w,p_day)->>'rate')::numeric,w.currency,app_private.payable_effective_terms(w,p_day),trim(p_note),auth.uid()) returning id into u;
    insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
    values(auth.uid(),w.user_id,w.organization_id,'work_payable_claimed',jsonb_build_object('unit',u,'kind',k,'day',p_day));
  end if;
  if k='day' and s.payable_unit_id is distinct from u then
    update public.assignment_work_sessions set payable_unit_id=u,updated_at=now() where id=s.id;
    insert into public.attendance_events(session_id,event_type,actor_id,detail) values(s.id,'payable_linked',auth.uid(),jsonb_build_object('unit',u));
  end if;
  return u;
end;
$$;
