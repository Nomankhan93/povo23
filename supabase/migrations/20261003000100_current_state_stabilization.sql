-- POEM 2.12.5 — Current State Stabilization
-- Forward-only cleanup for volunteer recruitment visibility, verification semantics,
-- and canonical reconciliation invariants. Existing historical migrations remain untouched.

-- Public recruitment is discoverable independently of permanent NGO profile sharing.
-- `area` continues to describe the work area but no longer hides the opportunity from
-- volunteers who live elsewhere. `invite_only` remains private.
create or replace function app_private.work_opportunity_visible(p_opportunity uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from public.work_opportunities o
  join public.accounts a on a.id=p_user and a.status='active'
  where o.id=p_opportunity
    and o.survey_project_id is not null
    and o.publication_state='published'
    and o.applications_open
    and o.status='open'
    and o.reply_by>now()
    and (
      o.visibility in ('all','area')
      or (o.visibility='invite_only' and exists(
        select 1 from public.work_invitations i
        where i.opportunity_id=o.id and i.user_id=p_user and i.status in ('pending','accepted')
      ))
    )
 );
$$;

create or replace function public.available_work_opportunities(
 p_page integer default 0,p_organization uuid default null,p_area uuid default null,p_payment text default null,
 p_skill text default '',p_work_date date default null,p_deadline date default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;details jsonb:='{}'::jsonb;profile_status text:='missing';
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page';end if;
 if p_payment is not null and p_payment not in ('paid','unpaid') then raise exception 'Invalid payment filter';end if;
 if p_skill is null or length(p_skill)>100 then raise exception 'Invalid skill filter';end if;
 select coalesce(v.details,'{}'::jsonb),v.status into details,profile_status
 from public.volunteer_profiles v where v.user_id=auth.uid();

 with matched as materialized (
  select o.id,o.organization_id,o.title,o.description,o.geography_id,o.start_date,o.end_date,o.reply_by,o.payment_type,o.payment_note,o.status,o.survey_project_id,o.required_volunteers,o.required_skill,o.required_language,o.visibility,o.publication_state,o.applications_open,o.eligibility_note,o.created_at,org.name organization_name,p.title project_title,a.status application_status,i.status invitation_status,
   (o.required_skill='' or strpos(lower(coalesce(details->>'skills','')),lower(o.required_skill))>0) skill_match,
   (o.required_language='' or strpos(lower(coalesce(details->>'languages','')),lower(o.required_language))>0) language_match,
   app_private.profile_in_area(auth.uid(),o.geography_id) area_match
  from public.work_opportunities o
  join public.organizations org on org.id=o.organization_id and org.status='active'
  join public.survey_projects p on p.id=o.survey_project_id and p.status='active'
  left join public.work_applications a on a.opportunity_id=o.id and a.user_id=auth.uid() and a.status in ('pending','shortlisted','selected')
  left join public.work_invitations i on i.opportunity_id=o.id and i.user_id=auth.uid() and i.status in ('pending','accepted')
  where app_private.work_opportunity_visible(o.id,auth.uid())
    and (p_organization is null or o.organization_id=p_organization)
    and (p_payment is null or o.payment_type=p_payment)
    and (p_work_date is null or p_work_date between o.start_date and o.end_date)
    and (p_deadline is null or (o.reply_by at time zone 'UTC')::date<=p_deadline)
    and (trim(p_skill)='' or strpos(lower(o.required_skill),lower(trim(p_skill)))>0 or strpos(lower(o.description),lower(trim(p_skill)))>0)
    and (p_area is null or exists(with recursive areas as (select id from public.geographies where id=p_area union all select g.id from public.geographies g join areas x on g.parent_id=x.id) select 1 from areas where id=o.geography_id))
 ), enriched as (
   select m.*,
    (profile_status='verified' and m.application_status is null and m.invitation_status is null and m.skill_match and m.language_match) can_apply,
    case
      when profile_status<>'verified' then 'Publish an active volunteer profile before applying'
      when m.application_status is not null then 'Application already submitted'
      when m.invitation_status is not null then 'Respond to the existing invitation'
      when not m.skill_match then 'Required skill is not listed on your profile'
      when not m.language_match then 'Required language is not listed on your profile'
      when m.visibility='area' and not m.area_match then 'Work area is outside your current profile location; you may still apply if you can work there'
      else ''
    end eligibility_reason
   from matched m
 ), batch as (select * from enriched order by start_date,created_at,id limit 50 offset p_page*50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(b) order by start_date,created_at,id) from batch b),'[]'::jsonb),'total',(select count(*) from enriched),'page',p_page,'page_size',50) into result;
 return result;
end;$$;

-- Independent volunteer verification tracks identity-relevant data only. Skills,
-- availability, preferred work areas and other CV edits no longer stale identity evidence.
create or replace function app_private.verification_subject(k text,s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if k='organization' then
  select jsonb_build_object('id',id,'name',name,'registration_number',registration_number,'verification_revision',verification_revision) into result
  from public.organizations where id=s;
 elsif k='volunteer' then
  select jsonb_build_object('id',user_id,'full_name',coalesce(details->>'full_name','')) into result
  from public.volunteer_profiles where user_id=s;
 elsif k='beneficiary' then
  select jsonb_build_object('id',id,'display_name',display_name,'birth_date',birth_date,'version',version,'review_required',review_required,'identity_status',identity_status) into result
  from public.canonical_persons where id=s;
 end if;
 return result;
end;$$;

-- Preserve current verification cases only when the identity name reviewed in the old
-- snapshot still matches the current volunteer identity. Changed identities remain stale.
update public.independent_verifications iv
set subject_snapshot=jsonb_build_object('id',iv.volunteer_id,'full_name',coalesce(v.details->>'full_name',''))
from public.volunteer_profiles v
where iv.kind='volunteer'
  and iv.volunteer_id=v.user_id
  and coalesce(iv.subject_snapshot#>>'{details,full_name}',iv.subject_snapshot->>'full_name','')=coalesce(v.details->>'full_name','');

create or replace function public.review_independent_verification(p_id uuid,p_decision text,p_method text,p_note text,p_expires timestamptz,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare v public.independent_verifications;s uuid;
begin
 select * into v from public.independent_verifications where id=p_id for update;
 if v.id is null then raise exception 'Verification case not found'; end if;
 s:=coalesce(v.organization_id,v.volunteer_id,v.canonical_id);
 if p_decision='withdrawn' then
  if v.requested_by<>auth.uid() or not app_private.can_read_verification(v) or v.status<>'pending' then raise exception 'Only requester can withdraw a pending case'; end if;
 else
  if not app_private.verification_manager(v.kind) then raise exception 'Independent reviewer permission required'; end if;
  if p_decision in ('verified','rejected') and (v.requested_by=auth.uid() or v.volunteer_id=auth.uid() or exists(select 1 from public.organization_memberships where organization_id=v.organization_id and user_id=auth.uid() and status='active')) then raise exception 'An independent reviewer who did not request this case or belong to this NGO is required'; end if;
 end if;
 if v.version is distinct from p_version then raise exception 'Verification changed; reload'; end if;
 if p_note is null or length(trim(p_note)) not between 5 and 1000 or p_decision is null or p_decision not in ('verified','rejected','revoked','withdrawn') then raise exception 'Decision and reason required'; end if;
 if p_decision in ('verified','rejected') and v.status<>'pending' then raise exception 'Pending verification required'; end if;
 if p_decision='revoked' and v.status<>'verified' then raise exception 'Only a verified case can be revoked'; end if;
 if p_decision='verified' then
  if app_private.verification_subject(v.kind,s) is distinct from v.subject_snapshot then raise exception 'Subject changed; withdraw and create a fresh verification case'; end if;
  if v.kind='beneficiary' and ((v.subject_snapshot->>'review_required')::boolean or v.subject_snapshot->>'identity_status'='merged') then raise exception 'Resolve canonical identity review first'; end if;
  if v.kind='organization' and length(trim(coalesce(v.subject_snapshot->>'registration_number','')))<2 then raise exception 'Complete NGO registration number before independent verification'; end if;
  if v.kind='volunteer' and length(trim(coalesce(v.subject_snapshot->>'full_name','')))<2 then raise exception 'Complete volunteer identity name before independent verification'; end if;
  if p_method is null or p_method not in ('document_review','issuer_check','in_person_check') or p_expires is null or p_expires<=now() or p_expires>now()+interval '366 days' then raise exception 'Review method and expiry within one year required'; end if;
 end if;
 update public.independent_verifications set status=p_decision,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),method=case when p_decision='verified' then p_method else method end,expires_at=case when p_decision='verified' then p_expires else expires_at end,version=version+1 where id=v.id returning * into v;
 insert into public.independent_verification_events(verification_id,actor_id,action,reason,snapshot) values(v.id,auth.uid(),p_decision,trim(p_note),to_jsonb(v));
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'independent_verification_reviewed',jsonb_build_object('case',v.id,'decision',p_decision));
 insert into public.notifications(user_id,title,body) values(v.requested_by,'Verification updated','Your independent verification case was updated. Open Verification to inspect the decision.');
end;$$;

-- Canonical display reconciliation cannot hide an unresolved or stale match decision.
create or replace function app_private.canonical_has_unresolved_matches(p_canonical uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from public.canonical_match_decisions d
  join public.registry_persons a on a.id=d.person_a
  join public.registry_persons b on b.id=d.person_b
  where exists(
    select 1 from public.canonical_person_links l
    where l.canonical_person_id=p_canonical and l.project_person_id in (d.person_a,d.person_b)
  )
  and (d.status='needs_review' or d.person_a_version<>a.version or d.person_b_version<>b.version)
 );
$$;
revoke all on function app_private.canonical_has_unresolved_matches(uuid) from public,anon,authenticated;

create or replace function public.reconcile_canonical_identity(p_person uuid,p_source_version integer,p_canonical_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.registry_persons;c public.canonical_persons;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 perform pg_advisory_xact_lock(276,1);
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Review reason required'; end if;
 select * into s from public.registry_persons where id=p_person for update;
 select cp.* into c from public.canonical_persons cp join public.canonical_person_links l on l.canonical_person_id=cp.id where l.project_person_id=p_person for update of cp;
 if s.id is null or c.id is null or c.identity_status='merged' then raise exception 'Canonical identity unavailable'; end if;
 if s.version is distinct from p_source_version or c.version is distinct from p_canonical_version then raise exception 'Identity changed; refresh before review'; end if;
 if app_private.canonical_has_unresolved_matches(c.id) then raise exception 'Resolve unresolved or stale canonical match decisions before reconciliation'; end if;
 update public.canonical_persons set display_name=s.full_name,birth_date=s.birth_date,review_required=false,version=version+1,updated_at=now() where id=c.id;
 perform app_private.capture_canonical_revision(c.id,'Authoritative source '||s.id||': '||trim(p_reason),auth.uid());
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_identity_reconciled',jsonb_build_object('canonical',c.id,'source_person',s.id,'source_version',s.version,'reason',trim(p_reason)));
end;$$;

