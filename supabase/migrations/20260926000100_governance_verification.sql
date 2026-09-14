-- POEM 2.9: independent evidence review and versioned project governance.
alter table public.organizations add column verification_revision integer not null default 1;
create function app_private.organization_verification_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.name is distinct from old.name or new.registration_number is distinct from old.registration_number then new.verification_revision:=old.verification_revision+1; else new.verification_revision:=old.verification_revision; end if;
 return new;
end;$$;
create trigger organization_verification_revision before update on public.organizations for each row execute function app_private.organization_verification_revision();
revoke all on function app_private.organization_verification_revision() from public,anon,authenticated;

create table public.independent_verifications (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('organization','volunteer','beneficiary')),
 organization_id uuid references public.organizations(id),
 volunteer_id uuid references public.accounts(id),
 canonical_id uuid references public.canonical_persons(id),
 subject_snapshot jsonb not null,
 evidence_reference text not null check(length(trim(evidence_reference)) between 5 and 1000),
 request_note text not null check(length(trim(request_note)) between 5 and 1000),
 status text not null default 'pending' check(status in ('pending','verified','rejected','revoked','withdrawn')),
 requested_by uuid not null references public.accounts(id),requested_at timestamptz not null default now(),
 reviewed_by uuid references public.accounts(id),reviewed_at timestamptz,
 review_note text,method text,expires_at timestamptz,
 version integer not null default 1,
 check((kind='organization' and organization_id is not null and volunteer_id is null and canonical_id is null) or (kind='volunteer' and volunteer_id is not null and organization_id is null and canonical_id is null) or (kind='beneficiary' and canonical_id is not null and organization_id is null and volunteer_id is null))
);
create index independent_verifications_subject on public.independent_verifications(kind,organization_id,volunteer_id,canonical_id,requested_at desc);
create table public.independent_verification_events (
 id bigint generated always as identity primary key,
 verification_id uuid not null references public.independent_verifications(id),
 actor_id uuid not null references public.accounts(id),action text not null,reason text not null,
 snapshot jsonb not null,created_at timestamptz not null default now()
);

create function app_private.verification_manager(k text) returns boolean language sql stable security definer set search_path='' as $$
 select case k when 'organization' then app_private.can_manage_ngos() when 'volunteer' then app_private.can_manage_volunteers() when 'beneficiary' then app_private.can_manage_surveys() else false end;
$$;
create function app_private.verification_subject(k text,s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if k='organization' then select jsonb_build_object('id',id,'name',name,'registration_number',registration_number,'verification_revision',verification_revision) into result from public.organizations where id=s;
 elsif k='volunteer' then select jsonb_build_object('id',user_id,'details',details,'version',version) into result from public.volunteer_profiles where user_id=s;
 elsif k='beneficiary' then select jsonb_build_object('id',id,'display_name',display_name,'birth_date',birth_date,'version',version,'review_required',review_required,'identity_status',identity_status) into result from public.canonical_persons where id=s;
 end if;
 return result;
end;$$;
create function app_private.can_request_verification(k text,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and (app_private.verification_manager(k) or (k='volunteer' and s=auth.uid()) or (k='organization' and app_private.ngo_admin(s)));
$$;
create function app_private.can_read_verification(v public.independent_verifications) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.can_request_verification(v.kind,coalesce(v.organization_id,v.volunteer_id,v.canonical_id));
$$;
create function app_private.effective_verification(v public.independent_verifications) returns text language plpgsql stable security definer set search_path='' as $$
begin
 if v.status in ('rejected','revoked','withdrawn') then return v.status; end if;
 if app_private.verification_subject(v.kind,coalesce(v.organization_id,v.volunteer_id,v.canonical_id)) is distinct from v.subject_snapshot then return 'stale'; end if;
 if v.status='verified' and v.expires_at<=now() then return 'expired'; end if;
 if v.status='verified' and ((v.kind='organization' and not exists(select 1 from public.organizations where id=v.organization_id and status='active')) or (v.kind='volunteer' and not exists(select 1 from public.accounts a join public.volunteer_profiles p on p.user_id=a.id where a.id=v.volunteer_id and a.status='active' and p.status<>'suspended')) or (v.kind='beneficiary' and exists(select 1 from public.canonical_persons where id=v.canonical_id and (review_required or identity_status='merged')))) then return 'unavailable'; end if;
 return v.status;
end;$$;
create function app_private.has_independent_verification(k text,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.independent_verifications v where v.kind=k and coalesce(v.organization_id,v.volunteer_id,v.canonical_id)=s and app_private.effective_verification(v)='verified');
$$;

create function public.request_independent_verification(p_kind text,p_subject uuid,p_evidence text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare snap jsonb;v public.independent_verifications;
begin
 if not app_private.can_request_verification(p_kind,p_subject) then raise exception 'Verification request permission required'; end if;
 if p_evidence is null or length(trim(p_evidence)) not between 5 and 1000 or p_note is null or length(trim(p_note)) not between 5 and 1000 then raise exception 'Evidence reference and request note required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('verification:'||p_kind||':'||p_subject::text,0));
 snap:=app_private.verification_subject(p_kind,p_subject);
 if snap is null then raise exception 'Verification subject not found'; end if;
 if exists(select 1 from public.independent_verifications iv where iv.kind=p_kind and coalesce(iv.organization_id,iv.volunteer_id,iv.canonical_id)=p_subject and app_private.effective_verification(iv) in ('pending','verified','unavailable')) then raise exception 'A current pending or verified case already exists'; end if;
 insert into public.independent_verifications(kind,organization_id,volunteer_id,canonical_id,subject_snapshot,evidence_reference,request_note,requested_by)
 values(p_kind,case when p_kind='organization' then p_subject end,case when p_kind='volunteer' then p_subject end,case when p_kind='beneficiary' then p_subject end,snap,trim(p_evidence),trim(p_note),auth.uid()) returning * into v;
 insert into public.independent_verification_events(verification_id,actor_id,action,reason,snapshot) values(v.id,auth.uid(),'requested',trim(p_note),to_jsonb(v));
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'independent_verification_requested',jsonb_build_object('case',v.id,'kind',v.kind));
 return v.id;
end;$$;

create function public.review_independent_verification(p_id uuid,p_decision text,p_method text,p_note text,p_expires timestamptz,p_version integer) returns void language plpgsql security definer set search_path='' as $$
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
  if v.kind='volunteer' and length(trim(coalesce(v.subject_snapshot#>>'{details,full_name}','')))<2 then raise exception 'Complete volunteer identity name before independent verification'; end if;
  if p_method is null or p_method not in ('document_review','issuer_check','in_person_check') or p_expires is null or p_expires<=now() or p_expires>now()+interval '366 days' then raise exception 'Review method and expiry within one year required'; end if;
 end if;
 update public.independent_verifications set status=p_decision,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),method=case when p_decision='verified' then p_method else method end,expires_at=case when p_decision='verified' then p_expires else expires_at end,version=version+1 where id=v.id returning * into v;
 insert into public.independent_verification_events(verification_id,actor_id,action,reason,snapshot) values(v.id,auth.uid(),p_decision,trim(p_note),to_jsonb(v));
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'independent_verification_reviewed',jsonb_build_object('case',v.id,'decision',p_decision));
 insert into public.notifications(user_id,title,body) values(v.requested_by,'Verification updated','Your independent verification case was updated. Open Verification to inspect the decision.');
end;$$;

create function public.list_independent_verifications(p_kind text,p_offset integer,p_limit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 if p_kind is null or p_kind not in ('organization','volunteer','beneficiary') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid verification filter'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at desc,x.id),'[]'::jsonb) into result from (
 select v.*,app_private.effective_verification(v) effective_status from public.independent_verifications v where kind=p_kind and app_private.can_read_verification(v) order by requested_at desc,id offset p_offset limit p_limit+1) x;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality r(value,ord) where ord<=p_limit),'has_more',jsonb_array_length(result)>p_limit);
end;$$;

create function public.verification_subjects(p_kind text,p_query text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;q text:=lower(trim(coalesce(p_query,'')));
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 if p_kind is null or p_kind not in ('organization','volunteer','beneficiary') or length(q)>200 then raise exception 'Invalid subject query'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.label,x.id),'[]'::jsonb) into result from (
 select id,label from (
 select o.id,o.name label from public.organizations o where p_kind='organization'
 union all select p.user_id,coalesce(nullif(p.details->>'full_name',''),a.full_name,a.email) from public.volunteer_profiles p join public.accounts a on a.id=p.user_id where p_kind='volunteer'
 union all select c.id,c.display_name||' — POEM-BEN-'||lpad(c.beneficiary_no::text,8,'0') from public.canonical_persons c where p_kind='beneficiary' and c.identity_status<>'merged'
 ) candidates where app_private.can_request_verification(p_kind,id) and (q='' or position(q in lower(label))>0 or id::text=q) order by label,id limit 25) x;
 return result;
end;$$;

alter table public.independent_verifications enable row level security;
alter table public.independent_verification_events enable row level security;
create policy independent_case_read on public.independent_verifications for select to authenticated using(app_private.can_read_verification(independent_verifications));
create policy independent_event_read on public.independent_verification_events for select to authenticated using(exists(select 1 from public.independent_verifications v where v.id=verification_id and app_private.can_read_verification(v)));
revoke all on public.independent_verifications,public.independent_verification_events from anon,authenticated;
grant select on public.independent_verifications,public.independent_verification_events to authenticated;
grant all on public.independent_verifications,public.independent_verification_events to service_role;

create table public.project_policy_versions (
 project_id uuid not null references public.survey_projects(id),version integer not null,
 retention_days integer not null check(retention_days between 1 and 3650),
 discovery text not null check(discovery in ('none','request_required')),
 require_ngo_verification boolean not null,require_volunteer_verification boolean not null,
 collection_paused boolean not null,
 purpose text not null,consent_version text not null,consent_notice text not null,
 reason text not null check(length(trim(reason)) between 5 and 1000),
 published_by uuid not null references public.accounts(id),published_at timestamptz not null default now(),
 primary key(project_id,version)
);
alter table public.survey_projects add column governance_version integer not null default 0;
alter table public.survey_projects add column governance_notice text not null default '';
alter table public.survey_responses add column governance_version integer;
-- Null on historical responses: no policy version is invented retrospectively.
alter table public.survey_responses add foreign key(project_id,governance_version) references public.project_policy_versions(project_id,version);
alter table public.project_policy_versions enable row level security;
create policy project_policy_read on public.project_policy_versions for select to authenticated using(app_private.can_read_project(project_id));
revoke all on public.project_policy_versions from anon,authenticated;
grant select on public.project_policy_versions to authenticated;
grant all on public.project_policy_versions to service_role;

create function public.publish_project_policy(p_project uuid,p_version integer,p_retention_days integer,p_discovery text,p_require_ngo boolean,p_require_volunteer boolean,p_paused boolean,p_reason text) returns integer language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;n integer;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 select * into p from public.survey_projects where id=p_project for update;
 if p.id is null then raise exception 'Project not found'; end if;
 if p.governance_version is distinct from p_version then raise exception 'Project policy changed; reload'; end if;
 if p_retention_days is null or p_retention_days not between 1 and 3650 or p_discovery is null or p_discovery not in ('none','request_required') or p_require_ngo is null or p_require_volunteer is null or p_paused is null or p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Complete policy and publication reason required'; end if;
 n:=p.governance_version+1;
 insert into public.project_policy_versions values(p.id,n,p_retention_days,p_discovery,p_require_ngo,p_require_volunteer,p_paused,p.purpose,p.consent_version,p.consent_notice,trim(p_reason),auth.uid(),now());
 update public.survey_projects set governance_version=n,sharing_discoverable=(p_discovery='request_required'),governance_notice='Policy '||n||': retention '||p_retention_days||' days (review schedule; deletion is not automatic). Discovery: '||p_discovery||'. Independent NGO verification: '||p_require_ngo||'. Independent volunteer verification: '||p_require_volunteer||'. Collection paused: '||p_paused||'.' where id=p.id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p.organization_id,'project_policy_published',jsonb_build_object('project',p.id,'version',n,'paused',p_paused,'reason',trim(p_reason)));
 return n;
end;$$;

-- Preserve legacy project operation until governance is explicitly configured.
-- Published requirements are enforced on the server, not only in the form.
create function app_private.can_collect_before_governance(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select app_private.is_active() and exists(select 1 from public.survey_assignments a join public.survey_projects p on p.id=a.project_id join public.organizations o on o.id=p.organization_id join public.volunteer_profiles v on v.user_id=a.user_id where p.id=pid and a.user_id=auth.uid() and a.active and p.status='active' and o.status='active' and v.status<>'suspended' and (now() at time zone 'UTC')::date between p.start_date and p.end_date);$$;
create or replace function app_private.can_collect(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.can_collect_before_governance(pid) and exists(select 1 from public.survey_projects p left join public.project_policy_versions v on v.project_id=p.id and v.version=p.governance_version where p.id=pid and (p.governance_version=0 or (not v.collection_paused and (not v.require_ngo_verification or app_private.has_independent_verification('organization',p.organization_id)) and (not v.require_volunteer_verification or app_private.has_independent_verification('volunteer',auth.uid())))));
$$;
-- Rename the receipt-aware wrapper; retries of already acknowledged saves remain valid.
alter function public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer,uuid) set schema app_private;
alter function app_private.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer,uuid) rename to save_survey_response_before_governance;
create function public.save_survey_response(p_id uuid,p_project uuid,p_person uuid,p_household uuid,p_name text,p_birth date,p_household_label text,p_answers jsonb,p_consent jsonb,p_submit boolean,p_version integer,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;result uuid;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 -- The project lock serializes policy publication with first-time saves.
 select * into p from public.survey_projects where id=p_project for update;
 if not exists(select 1 from public.survey_save_receipts where actor_id=auth.uid() and request_id=p_request_id) then
  if not app_private.can_collect(p_project) then raise exception 'Collection unavailable: check assignment, project policy and independent verification'; end if;
  if p.governance_version>0 and (p_consent->>'governance_version')::integer is distinct from p.governance_version then raise exception 'Project policy changed. Reload the project and review consent before saving'; end if;
 end if;
 result:=app_private.save_survey_response_before_governance(p_id,p_project,p_person,p_household,p_name,p_birth,p_household_label,p_answers,p_consent,p_submit,p_version,p_request_id);
 -- Do not mutate an already acknowledged response during idempotent replay.
 return result;
end;$$;
-- Capture policy in the same transaction as the response/revision insertion.
create function app_private.stamp_response_governance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.answers is distinct from old.answers or new.consent is distinct from old.consent then
  select nullif(governance_version,0) into new.governance_version from public.survey_projects where id=new.project_id;
 end if;
 return new;
end;$$;
create trigger response_governance before insert or update on public.survey_responses for each row execute function app_private.stamp_response_governance();

-- Existing discovery control must publish a policy revision once governance is enabled.
create or replace function public.set_project_sharing_discovery(p_project uuid,p_enabled boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;v public.project_policy_versions;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 if p_enabled is null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Discovery choice and reason required'; end if;
 select * into p from public.survey_projects where id=p_project for update;
 if p.id is null then raise exception 'Project not found'; end if;
 if p.governance_version>0 then
  select * into v from public.project_policy_versions where project_id=p.id and version=p.governance_version;
  perform public.publish_project_policy(p.id,p.governance_version,v.retention_days,case when p_enabled then 'request_required' else 'none' end,v.require_ngo_verification,v.require_volunteer_verification,v.collection_paused,p_reason);
 else
  update public.survey_projects set sharing_discoverable=p_enabled where id=p.id;
  insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'project_sharing_discovery_changed',jsonb_build_object('project',p.id,'enabled',p_enabled,'reason',trim(p_reason)));
 end if;
end;$$;
revoke all on function app_private.verification_manager(text),app_private.verification_subject(text,uuid),app_private.can_request_verification(text,uuid),app_private.can_read_verification(public.independent_verifications),app_private.effective_verification(public.independent_verifications),app_private.has_independent_verification(text,uuid),app_private.can_collect_before_governance(uuid),app_private.stamp_response_governance(),app_private.save_survey_response_before_governance(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer,uuid) from public,anon,authenticated;
grant execute on function app_private.can_read_verification(public.independent_verifications),app_private.can_collect(uuid) to authenticated;
revoke all on function public.request_independent_verification(text,uuid,text,text),public.review_independent_verification(uuid,text,text,text,timestamptz,integer),public.list_independent_verifications(text,integer,integer),public.verification_subjects(text,text),public.publish_project_policy(uuid,integer,integer,text,boolean,boolean,boolean,text),public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer,uuid) from public,anon,authenticated;
grant execute on function public.request_independent_verification(text,uuid,text,text),public.review_independent_verification(uuid,text,text,text,timestamptz,integer),public.list_independent_verifications(text,integer,integer),public.verification_subjects(text,text),public.publish_project_policy(uuid,integer,integer,text,boolean,boolean,boolean,text),public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer,uuid) to authenticated;
