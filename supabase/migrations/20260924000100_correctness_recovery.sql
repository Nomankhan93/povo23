-- POEM 2.7.6: forward-only correctness and recovery stabilization.
-- Serialize canonical maintenance consistently before taking any source/identity locks.
alter table public.canonical_persons add column review_required boolean not null default false;
alter table public.survey_projects add column sharing_discoverable boolean not null default false;

create function app_private.canonical_maintenance_lock() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(276,1);
 return null;
end;$$;
create trigger canonical_source_lock before update on public.registry_persons
for each statement execute function app_private.canonical_maintenance_lock();

create function app_private.invalidate_canonical_access() returns trigger
language plpgsql security definer set search_path='' as $$
declare g public.data_access_grants;
begin
 if new.version=old.version then return new; end if;
 for g in select * from public.data_access_grants where canonical_person_id=new.id and status='active' for update loop
  update public.data_access_grants set status='revoked',version=version+1,revoked_by=coalesce(auth.uid(),new.created_by),revoked_at=now(),
   revoke_reason='Canonical identity changed; new authorization required' where id=g.id;
  update public.data_access_requests set status='revoked',version=version+1,updated_at=now() where id=g.request_id;
  insert into public.data_access_events(request_id,grant_id,actor_id,event_type,detail)
   values(g.request_id,g.id,coalesce(auth.uid(),new.created_by),'revoked',jsonb_build_object('reason','canonical_identity_changed','canonical_version',new.version,'system_migration',auth.uid() is null));
 end loop;
 -- Approvals cannot survive an identity change that happened during review.
 update public.data_access_requests set status='revoked',version=version+1,updated_at=now(),poem_note='Canonical identity changed; request again'
 where canonical_person_id=new.id and status in ('pending_source_approval','pending_poem_approval');
 return new;
end;$$;
create trigger canonical_access_invalidated after update on public.canonical_persons
for each row execute function app_private.invalidate_canonical_access();

create function app_private.source_identity_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if new.full_name is not distinct from old.full_name and new.birth_date is not distinct from old.birth_date then return new; end if;
 select canonical_person_id into cid from public.canonical_person_links where project_person_id=new.id;
 update public.canonical_persons set review_required=true,version=version+1,updated_at=now() where id=cid;
 perform app_private.capture_canonical_revision(cid,'Source identity corrected; canonical review required',auth.uid());
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_source_changed',
 jsonb_build_object('canonical',cid,'source_person',new.id,'source_version',new.version,'old_name',old.full_name,'old_birth',old.birth_date,'new_name',new.full_name,'new_birth',new.birth_date));
 return new;
end;$$;
create trigger canonical_source_changed after update on public.registry_persons
for each row execute function app_private.source_identity_changed();

-- A POEM reviewer selects the authoritative source explicitly; no NGO auto-overwrites master identity.
create function public.reconcile_canonical_identity(p_person uuid,p_source_version integer,p_canonical_version integer,p_reason text) returns void
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
 update public.canonical_persons set display_name=s.full_name,birth_date=s.birth_date,review_required=false,version=version+1,updated_at=now() where id=c.id;
 perform app_private.capture_canonical_revision(c.id,'Authoritative source '||s.id||': '||trim(p_reason),auth.uid());
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_identity_reconciled',jsonb_build_object('canonical',c.id,'source_person',s.id,'source_version',s.version,'reason',trim(p_reason)));
end;$$;

create function public.set_project_sharing_discovery(p_project uuid,p_enabled boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 if p_enabled is null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Discovery choice and reason required'; end if;
 update public.survey_projects set sharing_discoverable=p_enabled where id=p_project;
 if not found then raise exception 'Project not found'; end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'project_sharing_discovery_changed',jsonb_build_object('project',p_project,'enabled',p_enabled,'reason',trim(p_reason)));
end;$$;


create or replace function public.review_canonical_match(p_person uuid,p_other uuid,p_status text,p_reason text,p_person_version integer,p_other_version integer,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.registry_persons;b public.registry_persons;decision public.canonical_match_decisions;
 first_id uuid;second_id uuid;ca uuid;cb uuid;primary_id uuid;secondary_id uuid;event_id uuid;moved jsonb;primary_row public.canonical_persons;secondary_row public.canonical_persons;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 perform pg_advisory_xact_lock(276,1);
 if p_status not in ('same_person','different_people','needs_review') then raise exception 'Valid canonical match status required'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Review reason required'; end if;
 if p_person=p_other then raise exception 'Two different registry records required'; end if;
 select * into a from public.registry_persons where id=p_person for update;
 select * into b from public.registry_persons where id=p_other for update;
 if a.id is null or b.id is null then raise exception 'Registry person not found'; end if;
 if a.project_id=b.project_id then raise exception 'Canonical review is for records from different projects'; end if;
 if a.version is distinct from p_person_version or b.version is distinct from p_other_version then raise exception 'Identity changed; refresh before review'; end if;
 first_id:=least(a.id,b.id);second_id:=greatest(a.id,b.id);
 select * into decision from public.canonical_match_decisions where person_a=first_id and person_b=second_id for update;
 if decision.person_a is null then
  if coalesce(p_version,0)<>0 then raise exception 'Match decision changed; refresh before review'; end if;
 else
  if decision.version is distinct from p_version then raise exception 'Match decision changed; refresh before review'; end if;
 end if;
 select canonical_person_id into ca from public.canonical_person_links where project_person_id=a.id for update;
 select canonical_person_id into cb from public.canonical_person_links where project_person_id=b.id for update;
 if ca is null or cb is null then raise exception 'Canonical identity unavailable'; end if;
 if p_status='same_person' and ca<>cb then
  select * into primary_row from public.canonical_persons where id=ca for update;
  select * into secondary_row from public.canonical_persons where id=cb for update;
  if primary_row.identity_status='merged' or secondary_row.identity_status='merged' then raise exception 'Refresh canonical identities before merge'; end if;
  if primary_row.beneficiary_no<=secondary_row.beneficiary_no then primary_id:=ca;secondary_id:=cb; else primary_id:=cb;secondary_id:=ca; end if;
  select coalesce(jsonb_agg(project_person_id order by project_person_id),'[]'::jsonb) into moved from public.canonical_person_links where canonical_person_id=secondary_id;
  insert into public.canonical_merge_events(primary_canonical_id,secondary_canonical_id,moved_project_person_ids,reason,merged_by)
  values(primary_id,secondary_id,moved,trim(p_reason),auth.uid()) returning id into event_id;
  update public.canonical_person_links set canonical_person_id=primary_id,linked_by=auth.uid(),link_reason='Canonical merge '||event_id::text,linked_at=now() where canonical_person_id=secondary_id;
  update public.canonical_persons set review_required=true,version=version+1,updated_at=now() where id=primary_id;
  update public.canonical_persons set identity_status='merged',merged_into=primary_id,version=version+1,updated_at=now() where id=secondary_id;
  perform app_private.capture_canonical_revision(primary_id,'Canonical records merged: '||trim(p_reason),auth.uid());
  perform app_private.capture_canonical_revision(secondary_id,'Merged into canonical identity '||primary_id::text||': '||trim(p_reason),auth.uid());
 elsif p_status='same_person' and ca=cb then
  event_id:=decision.merge_event_id;
 elsif p_status='different_people' and ca=cb then
  raise exception 'These records are already linked to the same canonical identity; revert the merge first';
 end if;
 insert into public.canonical_match_decisions(person_a,person_b,status,reason,person_a_version,person_b_version,merge_event_id,reviewed_by)
 values(first_id,second_id,p_status,trim(p_reason),case when first_id=a.id then a.version else b.version end,case when second_id=b.id then b.version else a.version end,event_id,auth.uid())
 on conflict(person_a,person_b) do update set status=excluded.status,reason=excluded.reason,person_a_version=excluded.person_a_version,person_b_version=excluded.person_b_version,merge_event_id=excluded.merge_event_id,version=public.canonical_match_decisions.version+1,reviewed_by=auth.uid(),reviewed_at=now()
 returning * into decision;
 insert into public.canonical_match_revisions(person_a,person_b,version,snapshot) values(first_id,second_id,decision.version,to_jsonb(decision));
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_match_reviewed',jsonb_build_object('person_a',first_id,'person_b',second_id,'status',p_status,'decision_version',decision.version,'merge_event',event_id));
 return event_id;
end;$$;

create or replace function public.revert_canonical_merge(p_event uuid,p_reason text,p_primary_version integer,p_secondary_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare e public.canonical_merge_events;primary_row public.canonical_persons;secondary_row public.canonical_persons;pid uuid;d public.canonical_match_decisions;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 perform pg_advisory_xact_lock(276,1);
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Revert reason required'; end if;
 select * into e from public.canonical_merge_events where id=p_event for update;
 if e.id is null then raise exception 'Merge event not found'; end if;
 if e.reverted then raise exception 'Merge already reverted'; end if;
 select * into primary_row from public.canonical_persons where id=e.primary_canonical_id for update;
 select * into secondary_row from public.canonical_persons where id=e.secondary_canonical_id for update;
 if primary_row.version is distinct from p_primary_version or secondary_row.version is distinct from p_secondary_version then raise exception 'Canonical identity changed; refresh before reverting'; end if;
 if secondary_row.merged_into<>primary_row.id then raise exception 'Canonical merge state changed; refresh before reverting'; end if;
 if exists(select 1 from public.canonical_merge_events later where later.id<>e.id and not later.reverted and later.merged_at>e.merged_at and (later.primary_canonical_id in (e.primary_canonical_id,e.secondary_canonical_id) or later.secondary_canonical_id in (e.primary_canonical_id,e.secondary_canonical_id))) then
  raise exception 'A later canonical merge depends on this identity; revert later merges first';
 end if;
 for pid in select value::uuid from jsonb_array_elements_text(e.moved_project_person_ids) as moved(value) loop
  if exists(select 1 from public.canonical_person_links where project_person_id=pid and canonical_person_id=e.primary_canonical_id) then
   update public.canonical_person_links set canonical_person_id=e.secondary_canonical_id,linked_by=auth.uid(),link_reason='Reverted canonical merge '||e.id::text,linked_at=now() where project_person_id=pid;
  end if;
 end loop;
 update public.canonical_persons set review_required=true,version=version+1,updated_at=now() where id=e.primary_canonical_id;
 update public.canonical_persons set review_required=true,identity_status='provisional',merged_into=null,version=version+1,updated_at=now() where id=e.secondary_canonical_id;
 update public.canonical_merge_events set reverted=true,revert_reason=trim(p_reason),reverted_by=auth.uid(),reverted_at=now() where id=e.id;
 perform app_private.capture_canonical_revision(e.primary_canonical_id,'Canonical merge reverted: '||trim(p_reason),auth.uid());
 perform app_private.capture_canonical_revision(e.secondary_canonical_id,'Canonical identity restored after merge reversal: '||trim(p_reason),auth.uid());
 for d in select md.* from public.canonical_match_decisions md
 join public.canonical_person_links a on a.project_person_id=md.person_a
 join public.canonical_person_links b on b.project_person_id=md.person_b
 where md.merge_event_id=e.id or (md.status='same_person' and a.canonical_person_id<>b.canonical_person_id
 and (a.canonical_person_id in (e.primary_canonical_id,e.secondary_canonical_id) or b.canonical_person_id in (e.primary_canonical_id,e.secondary_canonical_id))) for update of md loop
  update public.canonical_match_decisions set status='needs_review',reason='Merge reverted: '||trim(p_reason),merge_event_id=null,version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where person_a=d.person_a and person_b=d.person_b returning * into d;
  insert into public.canonical_match_revisions(person_a,person_b,version,snapshot) values(d.person_a,d.person_b,d.version,to_jsonb(d));
 end loop;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_merge_reverted',jsonb_build_object('event',e.id,'primary',e.primary_canonical_id,'secondary',e.secondary_canonical_id));
end;$$;


create or replace function public.canonical_person_summary(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.registry_persons;c public.canonical_persons;links integer;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 select * into r from public.registry_persons where id=p_person;
 if r.id is null then raise exception 'Registry person not found'; end if;
 select c0.* into c from public.canonical_person_links l join public.canonical_persons c0 on c0.id=l.canonical_person_id where l.project_person_id=p_person;
 if c.id is null then raise exception 'Canonical identity unavailable'; end if;
 select count(*)::int into links from public.canonical_person_links where canonical_person_id=c.id;
 return jsonb_build_object('id',c.id,'beneficiary_no',c.beneficiary_no,'display_name',c.display_name,'birth_date',c.birth_date,
  'review_required',c.review_required,'identity_status',c.identity_status,'version',c.version,'linked_records',links,'merged_into',c.merged_into);
end;$$;

create or replace function public.check_existing_identity(p_project uuid,p_name text,p_birth date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n integer;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 if length(trim(coalesce(p_name,'')))<2 or p_birth is null then return jsonb_build_object('possible_match',false,'candidate_count',0,'action','continue'); end if;
 select count(*)::int into n from public.registry_persons p
 where p.project_id<>p_project and p.birth_date=p_birth and app_private.normalized_person_name(p.full_name)=app_private.normalized_person_name(p_name);
 return jsonb_build_object('possible_match',n>0,'candidate_count',n,'action',case when n>0 then 'supervisor_review' else 'continue' end);
end;$$;

create or replace function public.data_sharing_sources(p_person uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare source public.registry_persons;cid uuid;requesting_org uuid;result jsonb;
begin
 select * into source from public.registry_persons where id=p_person;
 if source.id is null then raise exception 'Registry person not found'; end if;
 select organization_id into requesting_org from public.survey_projects where id=source.project_id;
 if not app_private.ngo_admin(requesting_org) then raise exception 'Requesting NGO admin permission required'; end if;
 select canonical_person_id into cid from public.canonical_person_links where project_person_id=p_person;
 if cid is null then raise exception 'Canonical identity unavailable'; end if;
 select coalesce(jsonb_agg(x order by x->>'organization_name'),'[]'::jsonb) into result from (
  select jsonb_build_object(
   'organization_id',o.id,
   'organization_name',o.name,
   'active_request',(
    select r.id from public.data_access_requests r
    where r.canonical_person_id=cid and r.requesting_organization_id=requesting_org and r.source_organization_id=o.id
      and ((r.status in ('pending_source_approval','pending_poem_approval') and r.requested_expires_at>now()+interval '1 hour') or (r.status='approved' and exists(select 1 from public.data_access_grants g where g.request_id=r.id and g.status='active' and g.expires_at>now())))
    order by r.created_at desc limit 1
   )
  ) x
  from public.organizations o
  where o.status='active' and o.id<>requesting_org and exists(
   select 1 from public.canonical_person_links l
   join public.survey_projects p on p.id=l.project_id
   where l.canonical_person_id=cid and p.organization_id=o.id and p.sharing_discoverable
  )
 ) s;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),requesting_org,'sharing_sources_viewed',jsonb_build_object('person',p_person));
 return result;
end;$$;

create or replace function public.create_data_access_request(p_person uuid,p_source_org uuid,p_purpose text,p_fields text[],p_expires_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare person public.registry_persons;cid uuid;requesting_org uuid;result uuid;expiry_limit timestamptz;
begin
 select * into person from public.registry_persons where id=p_person;
 if person.id is null then raise exception 'Registry person not found'; end if;
 select organization_id into requesting_org from public.survey_projects where id=person.project_id;
 if not app_private.ngo_admin(requesting_org) then raise exception 'Requesting NGO admin permission required'; end if;
 if p_source_org is null or p_source_org=requesting_org or not exists(select 1 from public.organizations where id=p_source_org and status='active') then raise exception 'Valid source NGO required'; end if;
 select canonical_person_id into cid from public.canonical_person_links where project_person_id=p_person;
 if cid is null then raise exception 'Canonical identity unavailable'; end if;
 if not exists(select 1 from public.canonical_person_links l join public.survey_projects p on p.id=l.project_id where l.canonical_person_id=cid and p.organization_id=p_source_org and p.sharing_discoverable) then raise exception 'Source NGO has no linked record for this beneficiary'; end if;
 if p_purpose is null or length(trim(p_purpose)) not between 10 and 1000 then raise exception 'Specific sharing purpose required'; end if;
 if not app_private.valid_share_fields(p_fields) then raise exception 'Invalid requested sharing fields'; end if;
 expiry_limit:=now()+interval '90 days';
 if p_expires_at is null or p_expires_at<=now()+interval '1 hour' or p_expires_at>expiry_limit then raise exception 'Requested expiry must be between one hour and 90 days'; end if;
 perform id from public.canonical_persons where id=cid for update;
 if exists(select 1 from public.canonical_persons where id=cid and (review_required or identity_status='merged')) then raise exception 'Canonical identity requires POEM review before sharing'; end if;
 if exists(select 1 from public.data_access_requests r where r.canonical_person_id=cid and r.requesting_organization_id=requesting_org and r.source_organization_id=p_source_org and ((r.status in ('pending_source_approval','pending_poem_approval') and r.requested_expires_at>now()+interval '1 hour') or (r.status='approved' and exists(select 1 from public.data_access_grants g where g.request_id=r.id and g.status='active' and g.expires_at>now())))) then raise exception 'An active or pending request already exists for this source NGO'; end if;
 insert into public.data_access_requests(canonical_person_id,requesting_project_person_id,requesting_organization_id,source_organization_id,purpose,requested_fields,requested_expires_at,created_by)
 values(cid,p_person,requesting_org,p_source_org,trim(p_purpose),p_fields,p_expires_at,auth.uid()) returning id into result;
 insert into public.data_access_events(request_id,actor_id,actor_organization_id,event_type,detail)
 values(result,auth.uid(),requesting_org,'requested',jsonb_build_object('fields',p_fields,'purpose',trim(p_purpose),'requested_expires_at',p_expires_at));
 insert into public.audit_events(actor_id,organization_id,action,detail)
 values(auth.uid(),requesting_org,'data_access_requested',jsonb_build_object('request',result,'source_organization',p_source_org,'fields',p_fields));
 insert into public.notifications(user_id,title,body)
 select m.user_id,'Beneficiary data access request','Another partner NGO requested a limited beneficiary coordination summary. Open Data sharing to review it.'
 from public.organization_memberships m join public.accounts a on a.id=m.user_id
 where m.organization_id=p_source_org and m.role='ngo_admin' and m.status='active' and a.status='active';
 return result;
end;$$;

create or replace function public.authorize_data_access_request(p_request uuid,p_decision text,p_fields text[],p_expires_at timestamptz,p_note text,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.data_access_requests;fields text[];grant_id uuid;canonical_version integer;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 perform pg_advisory_xact_lock(276,1);
 select * into r from public.data_access_requests where id=p_request for update;
 if r.id is null then raise exception 'Request not found'; end if;
 if r.status<>'pending_poem_approval' or r.version is distinct from p_version then raise exception 'Request changed. Reload before authorizing.'; end if;
 if p_decision not in ('approve','reject') or p_note is null or length(trim(p_note)) not between 5 and 1000 then raise exception 'Decision and authorization note required'; end if;
 if p_decision='approve' then
  if not exists(select 1 from public.organizations where id=r.requesting_organization_id and status='active') or not exists(select 1 from public.organizations where id=r.source_organization_id and status='active') then raise exception 'Both organizations must remain active'; end if;
  fields:=p_fields;
  if not app_private.valid_share_fields(fields) or exists(select 1 from unnest(fields) f where not (f=any(r.source_approved_fields))) then raise exception 'Authorized fields must be a non-empty subset of source-approved fields'; end if;
  if p_expires_at is null or p_expires_at<=now()+interval '1 hour' or p_expires_at>r.requested_expires_at or p_expires_at>now()+interval '90 days' then raise exception 'Grant expiry must be within the approved request window'; end if;
  if not exists(select 1 from public.canonical_person_links l where l.project_person_id=r.requesting_project_person_id and l.canonical_person_id=r.canonical_person_id) or not exists(select 1 from public.canonical_person_links l join public.survey_projects p on p.id=l.project_id where l.canonical_person_id=r.canonical_person_id and p.organization_id=r.source_organization_id) then raise exception 'Canonical identity changed; create a new sharing request'; end if;
  select version into canonical_version from public.canonical_persons where id=r.canonical_person_id and identity_status<>'merged' and not review_required for update;
  if canonical_version is null then raise exception 'Canonical identity unavailable'; end if;
  insert into public.data_access_grants(request_id,canonical_person_id,canonical_version,grantee_organization_id,source_organization_id,fields,purpose,expires_at,granted_by)
  values(r.id,r.canonical_person_id,canonical_version,r.requesting_organization_id,r.source_organization_id,fields,r.purpose,p_expires_at,auth.uid()) returning id into grant_id;
  update public.data_access_requests set status='approved',poem_note=trim(p_note),poem_reviewed_by=auth.uid(),poem_reviewed_at=now(),version=version+1,updated_at=now() where id=r.id;
  insert into public.data_access_events(request_id,grant_id,actor_id,event_type,detail) values(r.id,grant_id,auth.uid(),'poem_approved',jsonb_build_object('fields',fields,'expires_at',p_expires_at,'note',trim(p_note)));
 else
  update public.data_access_requests set status='poem_rejected',poem_note=trim(p_note),poem_reviewed_by=auth.uid(),poem_reviewed_at=now(),version=version+1,updated_at=now() where id=r.id;
  insert into public.data_access_events(request_id,actor_id,event_type,detail) values(r.id,auth.uid(),'poem_rejected',jsonb_build_object('note',trim(p_note)));
 end if;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),r.requesting_organization_id,'data_access_poem_reviewed',jsonb_build_object('request',r.id,'decision',p_decision,'source_organization',r.source_organization_id,'grant',grant_id));
 insert into public.notifications(user_id,title,body)
 select m.user_id,'Data sharing request finalized',case when p_decision='approve' then 'POEM authorized your limited beneficiary coordination summary. Open Data sharing to view it.' else 'POEM did not authorize the data sharing request.' end
 from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=r.requesting_organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
 return grant_id;
end;$$;

create or replace function public.get_shared_beneficiary_summary(p_grant uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare g public.data_access_grants;c public.canonical_persons;result jsonb;identity jsonb:='{}'::jsonb;assistance jsonb:='[]'::jsonb;needs jsonb:='[]'::jsonb;
begin
 select * into g from public.data_access_grants where id=p_grant;
 if g.id is null or not app_private.ngo_admin(g.grantee_organization_id) then raise exception 'Active grantee NGO admin permission required'; end if;
 if g.status<>'active' then raise exception 'Data access grant revoked'; end if;
 if g.expires_at<=now() then raise exception 'Data access grant expired'; end if;
 if not exists(select 1 from public.organizations where id=g.grantee_organization_id and status='active') or not exists(select 1 from public.organizations where id=g.source_organization_id and status='active') then raise exception 'Both organizations must remain active'; end if;
 if not exists(select 1 from public.data_access_requests r join public.canonical_person_links l on l.project_person_id=r.requesting_project_person_id where r.id=g.request_id and l.canonical_person_id=g.canonical_person_id) then raise exception 'Canonical identity changed; new sharing authorization required'; end if;
 if not exists(select 1 from public.canonical_person_links l join public.survey_projects p on p.id=l.project_id where l.canonical_person_id=g.canonical_person_id and p.organization_id=g.source_organization_id) then raise exception 'Source identity link changed; new sharing authorization required'; end if;
 select * into c from public.canonical_persons where id=g.canonical_person_id and identity_status<>'merged';
 if c.id is null or c.review_required or c.version<>g.canonical_version then raise exception 'Canonical identity changed; new sharing authorization required'; end if;
 if 'basic_identity_summary'=any(g.fields) then identity:=jsonb_build_object('beneficiary_no',c.beneficiary_no,'display_name',c.display_name,'birth_date',c.birth_date); end if;
 if g.fields && array['assistance_categories','assistance_dates','program_names','next_eligibility_date']::text[] then
  select coalesce(jsonb_agg(
   jsonb_strip_nulls(jsonb_build_object(
    'category',case when 'assistance_categories'=any(g.fields) then a.category end,
    'delivered_on',case when 'assistance_dates'=any(g.fields) then a.delivered_on end,
    'program',case when 'program_names'=any(g.fields) then a.program end,
    'next_eligible_on',case when 'next_eligibility_date'=any(g.fields) then a.next_eligible_on end
   )) order by a.delivered_on desc,a.id
  ),'[]'::jsonb) into assistance
  from public.assistance_entries a
  join public.canonical_person_links l on l.project_person_id=a.person_id
  join public.survey_projects p on p.id=a.project_id
  where l.canonical_person_id=g.canonical_person_id and p.organization_id=g.source_organization_id and a.status='recorded';
 end if;
 if 'needs_summary'=any(g.fields) then
  select coalesce(jsonb_agg(jsonb_build_object('category',n.category,'priority',n.priority,'status',n.status,'follow_up_on',n.follow_up_on) order by n.updated_at desc,n.id),'[]'::jsonb) into needs
  from public.beneficiary_needs n
  join public.canonical_person_links l on l.project_person_id=n.person_id
  join public.survey_projects p on p.id=n.project_id
  where l.canonical_person_id=g.canonical_person_id and p.organization_id=g.source_organization_id;
 end if;
 result:=jsonb_build_object('grant_id',g.id,'source_organization_id',g.source_organization_id,'expires_at',g.expires_at,'fields',to_jsonb(g.fields),'identity',identity,'assistance',assistance,'needs',needs);
 insert into public.data_access_events(request_id,grant_id,actor_id,actor_organization_id,event_type,detail) values(g.request_id,g.id,auth.uid(),g.grantee_organization_id,'summary_viewed',jsonb_build_object('fields',g.fields));
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),g.grantee_organization_id,'shared_beneficiary_summary_viewed',jsonb_build_object('grant',g.id,'source_organization',g.source_organization_id,'fields',g.fields));
 return result;
end;$$;

do $$
declare g public.data_access_grants;
begin
 for g in select dg.* from public.data_access_grants dg join public.canonical_persons c on c.id=dg.canonical_person_id
 where dg.status='active' and (c.version<>dg.canonical_version or c.identity_status='merged') loop
 update public.data_access_grants set status='revoked',version=version+1,revoked_by=g.granted_by,revoked_at=now(),revoke_reason='2.7.6 migration: stale canonical authorization invalidated' where id=g.id;
 update public.data_access_requests set status='revoked',version=version+1,updated_at=now() where id=g.request_id;
 insert into public.data_access_events(request_id,grant_id,actor_id,event_type,detail) values(g.request_id,g.id,g.granted_by,'revoked',jsonb_build_object('system_migration','2.7.6','reason','stale canonical version','actor_reference','original grant authorizer'));
 end loop;
end;$$;
revoke all on function app_private.canonical_maintenance_lock(),app_private.invalidate_canonical_access(),app_private.source_identity_changed() from public,anon,authenticated;
revoke all on function public.reconcile_canonical_identity(uuid,integer,integer,text),public.set_project_sharing_discovery(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.reconcile_canonical_identity(uuid,integer,integer,text),public.set_project_sharing_discovery(uuid,boolean,text) to authenticated;

-- Repair contradictory decisions left by an earlier reversal, preserving snapshots.
do $$
declare d public.canonical_match_decisions;c public.canonical_persons;
begin
 for d in select md.* from public.canonical_match_decisions md
 join public.canonical_person_links a on a.project_person_id=md.person_a
 join public.canonical_person_links b on b.project_person_id=md.person_b
 where md.status='same_person' and a.canonical_person_id<>b.canonical_person_id loop
  update public.canonical_match_decisions set status='needs_review',reason='2.7.6 migration: separated canonical links require review',merge_event_id=null,version=version+1
   where person_a=d.person_a and person_b=d.person_b returning * into d;
  insert into public.canonical_match_revisions(person_a,person_b,version,snapshot) values(d.person_a,d.person_b,d.version,to_jsonb(d));
 end loop;
 -- Conservatively flag historical source corrections, without choosing a winner.
 for c in select cp.* from public.canonical_persons cp where cp.identity_status<>'merged' and exists(
  select 1 from public.canonical_person_links l join public.registry_persons p on p.id=l.project_person_id
  where l.canonical_person_id=cp.id and p.version>1 and
  (p.full_name is distinct from cp.display_name or p.birth_date is distinct from cp.birth_date)
 ) loop
  update public.canonical_persons set review_required=true,version=version+1,updated_at=now() where id=c.id;
  perform app_private.capture_canonical_revision(c.id,'2.7.6 migration: historical source correction needs review',c.created_by);
 end loop;
end;$$;
