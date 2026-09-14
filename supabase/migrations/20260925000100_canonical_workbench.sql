-- POEM 2.8: POEM-only canonical operator workbench. No NGO table grants added.
create function public.search_canonical_registry(p_query text,p_state text,p_after bigint,p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;q text:=trim(coalesce(p_query,''));
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_after is null or p_after<0 or length(q)>200 or p_state is null or p_state not in ('active','review_required','merged','all') then raise exception 'Invalid registry search parameters'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.beneficiary_no),'[]'::jsonb) into result from (
  select c.*,(select count(*) from public.canonical_person_links l where l.canonical_person_id=c.id) linked_records from public.canonical_persons c where c.beneficiary_no>p_after
  and (p_state='all' or (p_state='active' and c.identity_status<>'merged') or (p_state='review_required' and c.review_required and c.identity_status<>'merged') or (p_state='merged' and c.identity_status='merged'))
  and (q='' or position(lower(q) in lower(c.display_name))>0 or c.id::text=q or ltrim(regexp_replace(upper(q),'^POEM-BEN-',''),'0')=c.beneficiary_no::text)
  order by c.beneficiary_no limit p_limit+1
 ) x;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_registry_searched',jsonb_build_object('state',p_state,'after',p_after,'query_used',q<>''));
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality r(value,ord) where ord<=p_limit),'has_more',jsonb_array_length(result)>p_limit);
end;$$;

create function public.canonical_workbench_detail(p_canonical uuid,p_section text,p_offset integer,p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.canonical_persons;result jsonb;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 or p_section is null or p_section not in ('sources','history','merges','assistance','decisions') then raise exception 'Invalid registry detail parameters'; end if;
 select * into c from public.canonical_persons where id=p_canonical;
 if c.id is null then raise exception 'Canonical identity not found'; end if;
 if p_section='sources' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.registry_no),'[]'::jsonb) into result from (
   select p.*,l.link_reason,l.linked_at,l.linked_by,sp.title project_title,o.name organization_name
   from public.canonical_person_links l join public.registry_persons p on p.id=l.project_person_id join public.survey_projects sp on sp.id=p.project_id join public.organizations o on o.id=sp.organization_id
   where l.canonical_person_id=c.id order by p.registry_no offset p_offset limit p_limit+1) x;
 elsif p_section='history' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.version desc),'[]'::jsonb) into result from (
   select * from public.canonical_person_revisions where canonical_person_id=c.id order by version desc offset p_offset limit p_limit+1) x;
 elsif p_section='merges' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.merged_at desc,x.id),'[]'::jsonb) into result from (
   select e.*,a.version primary_version,b.version secondary_version,a.display_name primary_name,b.display_name secondary_name
   from public.canonical_merge_events e join public.canonical_persons a on a.id=e.primary_canonical_id join public.canonical_persons b on b.id=e.secondary_canonical_id
   where e.primary_canonical_id=c.id or e.secondary_canonical_id=c.id order by e.merged_at desc,e.id offset p_offset limit p_limit+1) x;
 elsif p_section='assistance' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.delivered_on desc,x.id),'[]'::jsonb) into result from (
   select a.*,sp.title project_title,o.name organization_name from public.assistance_entries a join public.canonical_person_links l on l.project_person_id=a.person_id join public.survey_projects sp on sp.id=a.project_id join public.organizations o on o.id=sp.organization_id
   where l.canonical_person_id=c.id order by a.delivered_on desc,a.id offset p_offset limit p_limit+1) x;
 else
  select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc,x.person_a,x.person_b,x.version desc),'[]'::jsonb) into result from (
   select r.* from public.canonical_match_revisions r where exists(select 1 from public.canonical_person_links l where l.canonical_person_id=c.id and l.project_person_id in (r.person_a,r.person_b))
   order by r.recorded_at desc,r.person_a,r.person_b,r.version desc offset p_offset limit p_limit+1) x;
 end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_workbench_viewed',jsonb_build_object('canonical',c.id,'section',p_section,'offset',p_offset));
 return jsonb_build_object('identity',to_jsonb(c),'rows',(select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality r(value,ord) where ord<=p_limit),'has_more',jsonb_array_length(result)>p_limit);
end;$$;

create function public.preview_canonical_review(p_person uuid,p_other uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.registry_persons;b public.registry_persons;ca public.canonical_persons;cb public.canonical_persons;d public.canonical_match_decisions;secondary_id uuid;source_a jsonb;source_b jsonb;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 select * into a from public.registry_persons where id=p_person;
 select * into b from public.registry_persons where id=p_other;
 if a.id is null or b.id is null then raise exception 'Source record not found'; end if;
 if a.id=b.id or a.project_id=b.project_id then raise exception 'Choose source records from different projects'; end if;
 select cp.* into ca from public.canonical_persons cp join public.canonical_person_links l on l.canonical_person_id=cp.id where l.project_person_id=a.id;
 select cp.* into cb from public.canonical_persons cp join public.canonical_person_links l on l.canonical_person_id=cp.id where l.project_person_id=b.id;
 if ca.id is null or cb.id is null then raise exception 'Canonical identity unavailable'; end if;
 select * into d from public.canonical_match_decisions where person_a=least(a.id,b.id) and person_b=greatest(a.id,b.id);
 select to_jsonb(a)||jsonb_build_object('project_title',s.title,'organization_name',o.name) into source_a from public.survey_projects s join public.organizations o on o.id=s.organization_id where s.id=a.project_id;
 select to_jsonb(b)||jsonb_build_object('project_title',s.title,'organization_name',o.name) into source_b from public.survey_projects s join public.organizations o on o.id=s.organization_id where s.id=b.project_id;
 secondary_id:=case when ca.beneficiary_no<cb.beneficiary_no then cb.id else ca.id end;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_review_previewed',jsonb_build_object('person',a.id,'other',b.id));
 return jsonb_build_object('source_a',source_a,'source_b',source_b,'canonical_a',to_jsonb(ca),'canonical_b',to_jsonb(cb),'decision',case when d.person_a is null then null else to_jsonb(d) end,
 'moved_records',case when ca.id=cb.id then 0 else (select count(*) from public.canonical_person_links where canonical_person_id=secondary_id) end,
 'active_grants',case when ca.id=cb.id then 0 else (select count(*) from public.data_access_grants where canonical_person_id in (ca.id,cb.id) and status='active' and expires_at>now()) end,
 'pending_requests',case when ca.id=cb.id then 0 else (select count(*) from public.data_access_requests where canonical_person_id in (ca.id,cb.id) and status in ('pending_source_approval','pending_poem_approval')) end);
end;$$;

-- Preview tokens are concurrency guards, not authority. Current links and versions
-- are checked again under the same advisory lock used by canonical maintenance.
create function public.apply_canonical_review(p_preview jsonb,p_status text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.registry_persons;b public.registry_persons;ca public.canonical_persons;cb public.canonical_persons;
begin
 if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required'; end if;
 perform pg_advisory_xact_lock(276,1);
 select * into a from public.registry_persons where id=(p_preview#>>'{source_a,id}')::uuid for update;
 select * into b from public.registry_persons where id=(p_preview#>>'{source_b,id}')::uuid for update;
 select cp.* into ca from public.canonical_persons cp join public.canonical_person_links l on l.canonical_person_id=cp.id where l.project_person_id=a.id for update of cp;
 select cp.* into cb from public.canonical_persons cp join public.canonical_person_links l on l.canonical_person_id=cp.id where l.project_person_id=b.id for update of cp;
 if a.id is null or b.id is null or ca.id is null or cb.id is null
 or a.version is distinct from (p_preview#>>'{source_a,version}')::integer or b.version is distinct from (p_preview#>>'{source_b,version}')::integer
 or ca.id is distinct from (p_preview#>>'{canonical_a,id}')::uuid or cb.id is distinct from (p_preview#>>'{canonical_b,id}')::uuid
 or ca.version is distinct from (p_preview#>>'{canonical_a,version}')::integer or cb.version is distinct from (p_preview#>>'{canonical_b,version}')::integer then raise exception 'Review preview is stale; reload and compare the source records again'; end if;
 return public.review_canonical_match(a.id,b.id,p_status,p_reason,a.version,b.version,coalesce((p_preview#>>'{decision,version}')::integer,0));
end;$$;
revoke all on function public.search_canonical_registry(text,text,bigint,integer),public.canonical_workbench_detail(uuid,text,integer,integer),public.preview_canonical_review(uuid,uuid),public.apply_canonical_review(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.search_canonical_registry(text,text,bigint,integer),public.canonical_workbench_detail(uuid,text,integer,integer),public.preview_canonical_review(uuid,uuid),public.apply_canonical_review(jsonb,text,text) to authenticated;
