-- POEM 2.5.0 — controlled NGO data sharing and assistance coordination.
-- Partner NGOs never receive direct cross-project registry/survey access. Sharing is explicit,
-- field-scoped, time-limited and requires source NGO approval plus POEM authorization.

create table public.data_access_requests (
 id uuid primary key default gen_random_uuid(),
 canonical_person_id uuid not null references public.canonical_persons(id),
 requesting_project_person_id uuid not null references public.registry_persons(id),
 requesting_organization_id uuid not null references public.organizations(id),
 source_organization_id uuid not null references public.organizations(id),
 purpose text not null check(length(trim(purpose)) between 10 and 1000),
 requested_fields text[] not null check(cardinality(requested_fields) between 1 and 6),
 source_approved_fields text[],
 requested_expires_at timestamptz not null,
 status text not null default 'pending_source_approval' check(status in ('pending_source_approval','pending_poem_approval','source_rejected','approved','poem_rejected','revoked')),
 source_note text,
 source_reviewed_by uuid references public.accounts(id),
 source_reviewed_at timestamptz,
 poem_note text,
 poem_reviewed_by uuid references public.accounts(id),
 poem_reviewed_at timestamptz,
 version integer not null default 1 check(version>0),
 created_by uuid not null references public.accounts(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(requesting_organization_id<>source_organization_id),
 check(requested_expires_at>created_at),
 check(source_approved_fields is null or cardinality(source_approved_fields) between 1 and 6)
);
create index data_access_requests_requesting on public.data_access_requests(requesting_organization_id,status,created_at desc);
create index data_access_requests_source on public.data_access_requests(source_organization_id,status,created_at desc);
create index data_access_requests_canonical on public.data_access_requests(canonical_person_id,created_at desc);

create table public.data_access_grants (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique references public.data_access_requests(id),
 canonical_person_id uuid not null references public.canonical_persons(id),
 canonical_version integer not null check(canonical_version>0),
 grantee_organization_id uuid not null references public.organizations(id),
 source_organization_id uuid not null references public.organizations(id),
 fields text[] not null check(cardinality(fields) between 1 and 6),
 purpose text not null check(length(trim(purpose)) between 10 and 1000),
 valid_from timestamptz not null default now(),
 expires_at timestamptz not null,
 status text not null default 'active' check(status in ('active','revoked')),
 version integer not null default 1 check(version>0),
 granted_by uuid not null references public.accounts(id),
 granted_at timestamptz not null default now(),
 revoked_by uuid references public.accounts(id),
 revoked_at timestamptz,
 revoke_reason text,
 check(grantee_organization_id<>source_organization_id),
 check(expires_at>valid_from),
 check((status='active' and revoked_by is null and revoked_at is null and revoke_reason is null) or
       (status='revoked' and revoked_by is not null and revoked_at is not null and length(trim(revoke_reason))>=5))
);
create index data_access_grants_grantee on public.data_access_grants(grantee_organization_id,status,expires_at desc);
create index data_access_grants_source on public.data_access_grants(source_organization_id,status,expires_at desc);
create index data_access_grants_canonical on public.data_access_grants(canonical_person_id,expires_at desc);

create table public.data_access_events (
 id bigint generated always as identity primary key,
 request_id uuid references public.data_access_requests(id),
 grant_id uuid references public.data_access_grants(id),
 actor_id uuid not null references public.accounts(id),
 actor_organization_id uuid references public.organizations(id),
 event_type text not null check(event_type in ('requested','source_approved','source_rejected','poem_approved','poem_rejected','summary_viewed','revoked')),
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 check(request_id is not null or grant_id is not null)
);
create index data_access_events_request on public.data_access_events(request_id,created_at desc,id desc);
create index data_access_events_grant on public.data_access_events(grant_id,created_at desc,id desc);

create function app_private.valid_share_fields(p_fields text[]) returns boolean
language sql immutable set search_path='' as $$
 select p_fields is not null and cardinality(p_fields) between 1 and 6
   and not exists(select 1 from unnest(p_fields) f where f is null or f not in (
    'basic_identity_summary','assistance_categories','assistance_dates','program_names','next_eligibility_date','needs_summary'
   ))
   and cardinality(p_fields)=cardinality(array(select distinct f from unnest(p_fields) f));
$$;

create function app_private.can_read_access_request(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.can_manage_surveys() or exists(
  select 1 from public.data_access_requests r where r.id=p_id and
  (app_private.ngo_admin(r.requesting_organization_id) or app_private.ngo_admin(r.source_organization_id))
 );
$$;

create function app_private.can_read_access_grant(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.can_manage_surveys() or exists(
  select 1 from public.data_access_grants g where g.id=p_id and
  (app_private.ngo_admin(g.grantee_organization_id) or app_private.ngo_admin(g.source_organization_id))
 );
$$;

create function public.data_access_request_context(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.data_access_requests;is_requester boolean;is_source boolean;is_poem boolean;requester_record jsonb:='null'::jsonb;source_records jsonb:='[]'::jsonb;
begin
 select * into r from public.data_access_requests where id=p_request;
 if r.id is null then raise exception 'Request not found'; end if;
 is_requester:=app_private.ngo_admin(r.requesting_organization_id);
 is_source:=app_private.ngo_admin(r.source_organization_id);
 is_poem:=app_private.can_manage_surveys();
 if not (is_requester or is_source or is_poem) then raise exception 'Data access request permission required'; end if;
 if is_requester or is_poem then
  select jsonb_build_object('id',p.id,'registry_no',p.registry_no,'full_name',p.full_name,'birth_date',p.birth_date,'project_id',p.project_id,'project_title',sp.title)
  into requester_record from public.registry_persons p join public.survey_projects sp on sp.id=p.project_id where p.id=r.requesting_project_person_id;
 end if;
 if is_source or is_poem then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'registry_no',p.registry_no,'full_name',p.full_name,'birth_date',p.birth_date,'project_id',p.project_id,'project_title',sp.title) order by p.registry_no),'[]'::jsonb)
  into source_records from public.registry_persons p join public.canonical_person_links l on l.project_person_id=p.id join public.survey_projects sp on sp.id=p.project_id
  where l.canonical_person_id=r.canonical_person_id and sp.organization_id=r.source_organization_id;
 end if;
 return jsonb_build_object('request_id',r.id,'requesting_organization_id',r.requesting_organization_id,'source_organization_id',r.source_organization_id,'requesting_record',requester_record,'source_records',source_records);
end;$$;

create function public.data_sharing_sources(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
   'has_assistance',exists(
    select 1 from public.assistance_entries a
    join public.canonical_person_links al on al.project_person_id=a.person_id
    join public.survey_projects ap on ap.id=a.project_id
    where al.canonical_person_id=cid and ap.organization_id=o.id and a.status='recorded'
   ),
   'has_needs',exists(
    select 1 from public.beneficiary_needs n
    join public.canonical_person_links nl on nl.project_person_id=n.person_id
    join public.survey_projects np on np.id=n.project_id
    where nl.canonical_person_id=cid and np.organization_id=o.id
   ),
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
   where l.canonical_person_id=cid and p.organization_id=o.id
  )
 ) s;
 return result;
end;$$;

create function public.create_data_access_request(p_person uuid,p_source_org uuid,p_purpose text,p_fields text[],p_expires_at timestamptz) returns uuid
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
 if not exists(select 1 from public.canonical_person_links l join public.survey_projects p on p.id=l.project_id where l.canonical_person_id=cid and p.organization_id=p_source_org) then raise exception 'Source NGO has no linked record for this beneficiary'; end if;
 if p_purpose is null or length(trim(p_purpose)) not between 10 and 1000 then raise exception 'Specific sharing purpose required'; end if;
 if not app_private.valid_share_fields(p_fields) then raise exception 'Invalid requested sharing fields'; end if;
 expiry_limit:=now()+interval '90 days';
 if p_expires_at is null or p_expires_at<=now()+interval '1 hour' or p_expires_at>expiry_limit then raise exception 'Requested expiry must be between one hour and 90 days'; end if;
 perform id from public.canonical_persons where id=cid for update;
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

create function public.review_data_access_request(p_request uuid,p_decision text,p_fields text[],p_note text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.data_access_requests;fields text[];
begin
 select * into r from public.data_access_requests where id=p_request for update;
 if r.id is null or not app_private.ngo_admin(r.source_organization_id) then raise exception 'Source NGO admin permission required'; end if;
 if r.status<>'pending_source_approval' or r.version is distinct from p_version then raise exception 'Request changed. Reload before reviewing.'; end if;
 if p_decision not in ('approve','reject') or p_note is null or length(trim(p_note)) not between 5 and 1000 then raise exception 'Decision and review note required'; end if;
 if p_decision='approve' then
  if r.requested_expires_at<=now()+interval '1 hour' then raise exception 'Requested sharing window has expired; create a new request'; end if;
  if not exists(select 1 from public.organizations where id=r.requesting_organization_id and status='active') or not exists(select 1 from public.organizations where id=r.source_organization_id and status='active') then raise exception 'Both organizations must remain active'; end if;
  fields:=p_fields;
  if not app_private.valid_share_fields(fields) or exists(select 1 from unnest(fields) f where not (f=any(r.requested_fields))) then raise exception 'Approved fields must be a non-empty subset of requested fields'; end if;
  update public.data_access_requests set status='pending_poem_approval',source_approved_fields=fields,source_note=trim(p_note),source_reviewed_by=auth.uid(),source_reviewed_at=now(),version=version+1,updated_at=now() where id=r.id;
  insert into public.data_access_events(request_id,actor_id,actor_organization_id,event_type,detail) values(r.id,auth.uid(),r.source_organization_id,'source_approved',jsonb_build_object('fields',fields,'note',trim(p_note)));
  insert into public.notifications(user_id,title,body)
  select a.id,'Data sharing approval required','A source NGO approved a beneficiary sharing request. Open Data sharing in POEM administration for final authorization.' from public.accounts a where a.status='active' and a.platform_role in ('super_admin','admin','survey_manager');
 else
  update public.data_access_requests set status='source_rejected',source_approved_fields=null,source_note=trim(p_note),source_reviewed_by=auth.uid(),source_reviewed_at=now(),version=version+1,updated_at=now() where id=r.id;
  insert into public.data_access_events(request_id,actor_id,actor_organization_id,event_type,detail) values(r.id,auth.uid(),r.source_organization_id,'source_rejected',jsonb_build_object('note',trim(p_note)));
 end if;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),r.source_organization_id,'data_access_source_reviewed',jsonb_build_object('request',r.id,'decision',p_decision,'requesting_organization',r.requesting_organization_id));
 insert into public.notifications(user_id,title,body)
 select m.user_id,'Data sharing request updated',case when p_decision='approve' then 'The source NGO approved your request. POEM final authorization is pending.' else 'The source NGO rejected your data sharing request.' end
 from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=r.requesting_organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
end;$$;

create function public.authorize_data_access_request(p_request uuid,p_decision text,p_fields text[],p_expires_at timestamptz,p_note text,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.data_access_requests;fields text[];grant_id uuid;canonical_version integer;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
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
  select version into canonical_version from public.canonical_persons where id=r.canonical_person_id and identity_status<>'merged';
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

create function public.get_shared_beneficiary_summary(p_grant uuid) returns jsonb
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
 if c.id is null or c.version<>g.canonical_version then raise exception 'Canonical identity changed; new sharing authorization required'; end if;
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

create function public.revoke_data_access_grant(p_grant uuid,p_reason text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare g public.data_access_grants;
begin
 select * into g from public.data_access_grants where id=p_grant for update;
 if g.id is null or not (app_private.can_manage_surveys() or app_private.ngo_admin(g.source_organization_id)) then raise exception 'Grant revocation permission required'; end if;
 if g.status<>'active' or g.version is distinct from p_version then raise exception 'Grant changed or already revoked. Reload.'; end if;
 if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Revocation reason required'; end if;
 update public.data_access_grants set status='revoked',version=version+1,revoked_by=auth.uid(),revoked_at=now(),revoke_reason=trim(p_reason) where id=g.id;
 update public.data_access_requests set status='revoked',version=version+1,updated_at=now() where id=g.request_id and status='approved';
 insert into public.data_access_events(request_id,grant_id,actor_id,actor_organization_id,event_type,detail)
 values(g.request_id,g.id,auth.uid(),case when app_private.ngo_admin(g.source_organization_id) then g.source_organization_id else null end,'revoked',jsonb_build_object('reason',trim(p_reason)));
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),g.source_organization_id,'data_access_revoked',jsonb_build_object('grant',g.id,'request',g.request_id,'grantee_organization',g.grantee_organization_id));
 insert into public.notifications(user_id,title,body)
 select m.user_id,'Data sharing access revoked','A beneficiary coordination grant was revoked. Shared summary access has ended.' from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=g.grantee_organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
end;$$;

alter table public.data_access_requests enable row level security;
alter table public.data_access_grants enable row level security;
alter table public.data_access_events enable row level security;

create policy data_access_requests_read on public.data_access_requests for select to authenticated using(app_private.can_manage_surveys() or app_private.ngo_admin(requesting_organization_id) or app_private.ngo_admin(source_organization_id));
create policy data_access_grants_read on public.data_access_grants for select to authenticated using(app_private.can_manage_surveys() or app_private.ngo_admin(grantee_organization_id) or app_private.ngo_admin(source_organization_id));
create policy data_access_events_read on public.data_access_events for select to authenticated using(
 app_private.can_manage_surveys() or
 (request_id is not null and app_private.can_read_access_request(request_id)) or
 (grant_id is not null and app_private.can_read_access_grant(grant_id))
);

revoke all on public.data_access_requests,public.data_access_grants,public.data_access_events from anon,authenticated;
grant select on public.data_access_requests,public.data_access_grants,public.data_access_events to authenticated;
grant all on public.data_access_requests,public.data_access_grants,public.data_access_events to service_role;

revoke all on function app_private.valid_share_fields(text[]),app_private.can_read_access_request(uuid),app_private.can_read_access_grant(uuid) from public,anon,authenticated;
grant execute on function app_private.can_read_access_request(uuid),app_private.can_read_access_grant(uuid) to authenticated;

revoke all on function public.data_access_request_context(uuid),public.data_sharing_sources(uuid),public.create_data_access_request(uuid,uuid,text,text[],timestamptz),public.review_data_access_request(uuid,text,text[],text,integer),public.authorize_data_access_request(uuid,text,text[],timestamptz,text,integer),public.get_shared_beneficiary_summary(uuid),public.revoke_data_access_grant(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.data_access_request_context(uuid),public.data_sharing_sources(uuid),public.create_data_access_request(uuid,uuid,text,text[],timestamptz),public.review_data_access_request(uuid,text,text[],text,integer),public.authorize_data_access_request(uuid,text,text[],timestamptz,text,integer),public.get_shared_beneficiary_summary(uuid),public.revoke_data_access_grant(uuid,text,integer) to authenticated;
