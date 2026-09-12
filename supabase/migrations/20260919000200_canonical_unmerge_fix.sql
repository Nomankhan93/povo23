-- POEM 2.4.1 — canonical merge reversal UUID decoding fix.
-- 2.4.0 stores moved project-person UUIDs as a JSON array of scalar strings.
-- jsonb_array_elements(... )::text preserves the JSON quotes, so casting that
-- representation directly to uuid fails. Read scalar text values instead.

create or replace function public.revert_canonical_merge(p_event uuid,p_reason text,p_primary_version integer,p_secondary_version integer) returns void
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
 for pid in select value::uuid from jsonb_array_elements_text(e.moved_project_person_ids) as moved(value) loop
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

revoke all on function public.revert_canonical_merge(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.revert_canonical_merge(uuid,text,integer,integer) to authenticated;
