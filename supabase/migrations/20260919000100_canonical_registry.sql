-- POEM 2.4.0 — canonical beneficiary identity foundation.
-- Project-scoped registry_persons remain the operational source records. This layer links
-- those records to a POEM-wide identity without granting partner NGOs cross-project access.

create table public.canonical_persons (
 id uuid primary key default gen_random_uuid(),
 beneficiary_no bigint generated always as identity unique,
 display_name text not null check(length(trim(display_name)) between 2 and 200),
 birth_date date,
 identity_status text not null default 'provisional' check(identity_status in ('provisional','confirmed','merged')),
 merged_into uuid references public.canonical_persons(id),
 version integer not null default 1 check(version > 0),
 created_by uuid not null references public.accounts(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((identity_status='merged')=(merged_into is not null)),
 check(merged_into is null or merged_into<>id)
);

create table public.canonical_person_links (
 project_person_id uuid primary key,
 project_id uuid not null,
 canonical_person_id uuid not null references public.canonical_persons(id),
 linked_by uuid not null references public.accounts(id),
 link_reason text not null default 'registry_creation' check(length(link_reason) between 3 and 200),
 linked_at timestamptz not null default now(),
 foreign key(project_person_id,project_id) references public.registry_persons(id,project_id)
);
create index canonical_links_identity on public.canonical_person_links(canonical_person_id,project_person_id);
create index canonical_links_project on public.canonical_person_links(project_id,project_person_id);

create table public.canonical_person_revisions (
 canonical_person_id uuid not null references public.canonical_persons(id),
 version integer not null,
 snapshot jsonb not null,
 reason text not null check(length(reason) between 3 and 1000),
 actor_id uuid references public.accounts(id),
 recorded_at timestamptz not null default now(),
 primary key(canonical_person_id,version)
);

create table public.canonical_merge_events (
 id uuid primary key default gen_random_uuid(),
 primary_canonical_id uuid not null references public.canonical_persons(id),
 secondary_canonical_id uuid not null references public.canonical_persons(id),
 moved_project_person_ids jsonb not null check(jsonb_typeof(moved_project_person_ids)='array'),
 reason text not null check(length(reason) between 5 and 1000),
 merged_by uuid not null references public.accounts(id),
 merged_at timestamptz not null default now(),
 reverted boolean not null default false,
 revert_reason text,
 reverted_by uuid references public.accounts(id),
 reverted_at timestamptz,
 check(primary_canonical_id<>secondary_canonical_id),
 check((not reverted and revert_reason is null and reverted_by is null and reverted_at is null) or
       (reverted and length(trim(revert_reason))>=5 and reverted_by is not null and reverted_at is not null))
);
create index canonical_merge_primary on public.canonical_merge_events(primary_canonical_id,merged_at desc);
create index canonical_merge_secondary on public.canonical_merge_events(secondary_canonical_id,merged_at desc);

create table public.canonical_match_decisions (
 person_a uuid not null references public.registry_persons(id),
 person_b uuid not null references public.registry_persons(id),
 status text not null check(status in ('same_person','different_people','needs_review')),
 reason text not null check(length(reason) between 5 and 1000),
 person_a_version integer not null,
 person_b_version integer not null,
 merge_event_id uuid references public.canonical_merge_events(id),
 version integer not null default 1,
 reviewed_by uuid not null references public.accounts(id),
 reviewed_at timestamptz not null default now(),
 primary key(person_a,person_b),
 check(person_a<person_b)
);

create table public.canonical_match_revisions (
 person_a uuid not null,
 person_b uuid not null,
 version integer not null,
 snapshot jsonb not null,
 recorded_at timestamptz not null default now(),
 primary key(person_a,person_b,version),
 foreign key(person_a,person_b) references public.canonical_match_decisions(person_a,person_b)
);

create function app_private.capture_canonical_revision(p_id uuid,p_reason text,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.canonical_persons;
begin
 select * into c from public.canonical_persons where id=p_id;
 if c.id is null then raise exception 'Canonical person not found'; end if;
 insert into public.canonical_person_revisions(canonical_person_id,version,snapshot,reason,actor_id)
 values(c.id,c.version,to_jsonb(c),left(trim(p_reason),1000),p_actor);
end;$$;

create function app_private.ensure_canonical_person() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if exists(select 1 from public.canonical_person_links where project_person_id=new.id) then return new; end if;
 insert into public.canonical_persons(display_name,birth_date,created_by)
 values(new.full_name,new.birth_date,new.created_by) returning id into cid;
 insert into public.canonical_person_links(project_person_id,project_id,canonical_person_id,linked_by)
 values(new.id,new.project_id,cid,new.created_by);
 perform app_private.capture_canonical_revision(cid,'Canonical identity created from project registry record',new.created_by);
 return new;
end;$$;
create trigger canonical_person_created after insert on public.registry_persons
for each row execute function app_private.ensure_canonical_person();

-- Existing pilot records each start with their own canonical identity. Reviewers may later merge them.
do $$
declare p record;cid uuid;
begin
 for p in select r.* from public.registry_persons r left join public.canonical_person_links l on l.project_person_id=r.id where l.project_person_id is null order by r.created_at,r.id loop
  insert into public.canonical_persons(display_name,birth_date,created_by,created_at,updated_at)
  values(p.full_name,p.birth_date,p.created_by,p.created_at,p.created_at) returning id into cid;
  insert into public.canonical_person_links(project_person_id,project_id,canonical_person_id,linked_by,link_reason,linked_at)
  values(p.id,p.project_id,cid,p.created_by,'2.4.0 canonical registry backfill',p.created_at);
  perform app_private.capture_canonical_revision(cid,'2.4.0 canonical registry backfill',p.created_by);
 end loop;
end;$$;

create function public.canonical_person_summary(p_person uuid) returns jsonb
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
  'identity_status',c.identity_status,'version',c.version,'linked_records',links,'merged_into',c.merged_into);
end;$$;

create function public.canonical_match_candidates(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source public.registry_persons;result jsonb;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 select * into source from public.registry_persons where id=p_person;
 if source.id is null then raise exception 'Registry person not found'; end if;
 select coalesce(jsonb_agg(x order by (x->>'created_at')::timestamptz,x->>'id'),'[]'::jsonb) into result from (
  select jsonb_build_object(
   'id',p.id,'registry_no',p.registry_no,'full_name',p.full_name,'birth_date',p.birth_date,'version',p.version,
   'project_id',p.project_id,'project_title',sp.title,'organization_id',o.id,'organization_name',o.name,'created_at',p.created_at,
   'canonical_beneficiary_no',cp.beneficiary_no,
   'signals',to_jsonb(array_remove(array[
      case when app_private.normalized_person_name(p.full_name)=app_private.normalized_person_name(source.full_name) then 'Same normalized name' end,
      case when p.birth_date is not null and source.birth_date is not null and p.birth_date=source.birth_date then 'Same birth date' end,
      'Different project'
    ],null)),
   'status',d.status,'reason',d.reason,'decision_version',d.version,
   'stale',case when d.status is null then false else d.person_a_version<>(case when d.person_a=p.id then p.version else source.version end) or d.person_b_version<>(case when d.person_b=p.id then p.version else source.version end) end,
   'same_canonical',sl.canonical_person_id=pl.canonical_person_id
  ) x
  from public.registry_persons p
  join public.survey_projects sp on sp.id=p.project_id
  join public.organizations o on o.id=sp.organization_id
  join public.canonical_person_links pl on pl.project_person_id=p.id
  join public.canonical_persons cp on cp.id=pl.canonical_person_id
  join public.canonical_person_links sl on sl.project_person_id=source.id
  left join public.canonical_match_decisions d on d.person_a=least(p.id,source.id) and d.person_b=greatest(p.id,source.id)
  where p.id<>source.id and p.project_id<>source.project_id and (
    (app_private.normalized_person_name(p.full_name)=app_private.normalized_person_name(source.full_name) and p.birth_date is not distinct from source.birth_date)
    or d.person_a is not null
    or sl.canonical_person_id=pl.canonical_person_id
  )
  limit 100
 ) q;
 return result;
end;$$;

-- Field-safe preflight: no foreign project/NGO/person details are returned.
create function public.check_existing_identity(p_project uuid,p_name text,p_birth date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n integer;
begin
 if not (app_private.can_review_survey(p_project) or app_private.can_collect(p_project)) then raise exception 'Project assignment required'; end if;
 if length(trim(coalesce(p_name,'')))<2 or p_birth is null then return jsonb_build_object('possible_match',false,'candidate_count',0,'action','continue'); end if;
 select count(*)::int into n from public.registry_persons p
 where p.project_id<>p_project and p.birth_date=p_birth and app_private.normalized_person_name(p.full_name)=app_private.normalized_person_name(p_name);
 return jsonb_build_object('possible_match',n>0,'candidate_count',n,'action',case when n>0 then 'supervisor_review' else 'continue' end);
end;$$;

create function public.review_canonical_match(p_person uuid,p_other uuid,p_status text,p_reason text,p_person_version integer,p_other_version integer,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.registry_persons;b public.registry_persons;decision public.canonical_match_decisions;
 first_id uuid;second_id uuid;ca uuid;cb uuid;primary_id uuid;secondary_id uuid;event_id uuid;moved jsonb;primary_row public.canonical_persons;secondary_row public.canonical_persons;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 if p_status not in ('same_person','different_people','needs_review') then raise exception 'Valid canonical match status required'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Review reason required'; end if;
 if p_person=p_other then raise exception 'Two different registry records required'; end if;
 select * into a from public.registry_persons where id=p_person;
 select * into b from public.registry_persons where id=p_other;
 if a.id is null or b.id is null then raise exception 'Registry person not found'; end if;
 if a.project_id=b.project_id then raise exception 'Canonical review is for records from different projects'; end if;
 if a.version<>p_person_version or b.version<>p_other_version then raise exception 'Identity changed; refresh before review'; end if;
 first_id:=least(a.id,b.id);second_id:=greatest(a.id,b.id);
 select * into decision from public.canonical_match_decisions where person_a=first_id and person_b=second_id for update;
 if decision.person_a is null then
  if coalesce(p_version,0)<>0 then raise exception 'Match decision changed; refresh before review'; end if;
 else
  if decision.version<>p_version then raise exception 'Match decision changed; refresh before review'; end if;
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
  update public.canonical_persons set identity_status='confirmed',version=version+1,updated_at=now() where id=primary_id;
  update public.canonical_persons set identity_status='merged',merged_into=primary_id,version=version+1,updated_at=now() where id=secondary_id;
  perform app_private.capture_canonical_revision(primary_id,'Canonical records merged: '||trim(p_reason),auth.uid());
  perform app_private.capture_canonical_revision(secondary_id,'Merged into canonical identity '||primary_id::text||': '||trim(p_reason),auth.uid());
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

create function public.revert_canonical_merge(p_event uuid,p_reason text,p_primary_version integer,p_secondary_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare e public.canonical_merge_events;primary_row public.canonical_persons;secondary_row public.canonical_persons;pid uuid;d public.canonical_match_decisions;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Revert reason required'; end if;
 select * into e from public.canonical_merge_events where id=p_event for update;
 if e.id is null then raise exception 'Merge event not found'; end if;
 if e.reverted then raise exception 'Merge already reverted'; end if;
 select * into primary_row from public.canonical_persons where id=e.primary_canonical_id for update;
 select * into secondary_row from public.canonical_persons where id=e.secondary_canonical_id for update;
 if primary_row.version<>p_primary_version or secondary_row.version<>p_secondary_version then raise exception 'Canonical identity changed; refresh before reverting'; end if;
 if secondary_row.merged_into<>primary_row.id then raise exception 'Canonical merge state changed; refresh before reverting'; end if;
 if exists(select 1 from public.canonical_merge_events later where later.id<>e.id and not later.reverted and later.merged_at>e.merged_at and (later.primary_canonical_id in (e.primary_canonical_id,e.secondary_canonical_id) or later.secondary_canonical_id in (e.primary_canonical_id,e.secondary_canonical_id))) then
  raise exception 'A later canonical merge depends on this identity; revert later merges first';
 end if;
 for pid in select value::text::uuid from jsonb_array_elements(e.moved_project_person_ids) loop
  if exists(select 1 from public.canonical_person_links where project_person_id=pid and canonical_person_id=e.primary_canonical_id) then
   update public.canonical_person_links set canonical_person_id=e.secondary_canonical_id,linked_by=auth.uid(),link_reason='Reverted canonical merge '||e.id::text,linked_at=now() where project_person_id=pid;
  end if;
 end loop;
 update public.canonical_persons set version=version+1,updated_at=now() where id=e.primary_canonical_id;
 update public.canonical_persons set identity_status='provisional',merged_into=null,version=version+1,updated_at=now() where id=e.secondary_canonical_id;
 update public.canonical_merge_events set reverted=true,revert_reason=trim(p_reason),reverted_by=auth.uid(),reverted_at=now() where id=e.id;
 perform app_private.capture_canonical_revision(e.primary_canonical_id,'Canonical merge reverted: '||trim(p_reason),auth.uid());
 perform app_private.capture_canonical_revision(e.secondary_canonical_id,'Canonical identity restored after merge reversal: '||trim(p_reason),auth.uid());
 select * into d from public.canonical_match_decisions where merge_event_id=e.id for update;
 if d.person_a is not null then
  update public.canonical_match_decisions set status='needs_review',reason='Merge reverted: '||trim(p_reason),merge_event_id=null,version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where person_a=d.person_a and person_b=d.person_b returning * into d;
  insert into public.canonical_match_revisions(person_a,person_b,version,snapshot) values(d.person_a,d.person_b,d.version,to_jsonb(d));
 end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_merge_reverted',jsonb_build_object('event',e.id,'primary',e.primary_canonical_id,'secondary',e.secondary_canonical_id));
end;$$;

create function public.canonical_assistance_timeline(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid;result jsonb;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 select canonical_person_id into cid from public.canonical_person_links where project_person_id=p_person;
 if cid is null then raise exception 'Canonical identity unavailable'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'project_id',a.project_id,'project_title',sp.title,'organization_id',o.id,'organization_name',o.name,'kind',a.kind,'category',a.category,'program',a.program,'description',a.description,'amount_pkr',a.amount_pkr,'quantity',a.quantity,'unit',a.unit,'delivered_on',a.delivered_on,'funding_source',a.funding_source,'next_eligible_on',a.next_eligible_on,'status',a.status) order by a.delivered_on desc,a.id),'[]'::jsonb) into result
 from public.assistance_entries a join public.canonical_person_links l on l.project_person_id=a.person_id join public.survey_projects sp on sp.id=a.project_id join public.organizations o on o.id=sp.organization_id where l.canonical_person_id=cid;
 return result;
end;$$;

alter table public.canonical_persons enable row level security;
alter table public.canonical_person_links enable row level security;
alter table public.canonical_person_revisions enable row level security;
alter table public.canonical_merge_events enable row level security;
alter table public.canonical_match_decisions enable row level security;
alter table public.canonical_match_revisions enable row level security;

create policy canonical_people_read on public.canonical_persons for select to authenticated using(app_private.can_manage_surveys());
create policy canonical_links_read on public.canonical_person_links for select to authenticated using(app_private.can_manage_surveys());
create policy canonical_history_read on public.canonical_person_revisions for select to authenticated using(app_private.can_manage_surveys());
create policy canonical_merges_read on public.canonical_merge_events for select to authenticated using(app_private.can_manage_surveys());
create policy canonical_decisions_read on public.canonical_match_decisions for select to authenticated using(app_private.can_manage_surveys());
create policy canonical_decision_history_read on public.canonical_match_revisions for select to authenticated using(app_private.can_manage_surveys());

revoke all on public.canonical_persons,public.canonical_person_links,public.canonical_person_revisions,public.canonical_merge_events,public.canonical_match_decisions,public.canonical_match_revisions from anon,authenticated;
grant select on public.canonical_persons,public.canonical_person_links,public.canonical_person_revisions,public.canonical_merge_events,public.canonical_match_decisions,public.canonical_match_revisions to authenticated;
grant all on public.canonical_persons,public.canonical_person_links,public.canonical_person_revisions,public.canonical_merge_events,public.canonical_match_decisions,public.canonical_match_revisions to service_role;

revoke all on function public.canonical_person_summary(uuid),public.canonical_match_candidates(uuid),public.check_existing_identity(uuid,text,date),public.review_canonical_match(uuid,uuid,text,text,integer,integer,integer),public.revert_canonical_merge(uuid,text,integer,integer),public.canonical_assistance_timeline(uuid) from public,anon,authenticated;
grant execute on function public.canonical_person_summary(uuid),public.canonical_match_candidates(uuid),public.check_existing_identity(uuid,text,date),public.review_canonical_match(uuid,uuid,text,text,integer,integer,integer),public.revert_canonical_merge(uuid,text,integer,integer),public.canonical_assistance_timeline(uuid) to authenticated;
