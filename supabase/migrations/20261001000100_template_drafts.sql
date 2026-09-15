-- Private author drafts; immutable publication uses the existing validator/publisher.
create table public.survey_template_drafts (
 id uuid primary key, owner_id uuid not null references public.accounts(id),
 name text not null default '' check(length(name)<=150), questions jsonb not null default '[]',
 source jsonb not null default '{}', version integer not null default 1,
 published_id uuid references public.survey_templates(id), updated_at timestamptz not null default now()
);
alter table public.survey_template_drafts enable row level security;
revoke all on public.survey_template_drafts from anon,authenticated;
grant select on public.survey_template_drafts to authenticated;
create policy draft_read on public.survey_template_drafts for select to authenticated using(owner_id=auth.uid() and app_private.can_manage_surveys());
create function public.save_template_draft(p_id uuid,p_name text,p_questions jsonb,p_source jsonb,p_version integer) returns integer language plpgsql security definer set search_path='' as $$
declare d public.survey_template_drafts; v integer;
begin
 if not app_private.can_manage_surveys() then raise exception 'Survey management permission required'; end if;
 if p_id is null or p_name is null or length(p_name)>150 or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_typeof(p_source) is distinct from 'object' then raise exception 'Invalid draft'; end if;
 if jsonb_array_length(p_questions)>50 or octet_length(p_questions::text)>50000 or octet_length(p_source::text)>2000 then raise exception 'Draft too large';end if;
 perform pg_advisory_xact_lock(hashtext('draft:'||p_id::text));
 select * into d from public.survey_template_drafts where id=p_id for update;
 if found then
  if d.owner_id<>auth.uid() then raise exception 'Draft access denied';end if;
  if d.published_id is not null then raise exception 'Already published; create a new version draft';end if;
  if p_version is distinct from d.version then raise exception 'Draft changed. Reopen saved draft before editing';end if;
  update public.survey_template_drafts set name=p_name,questions=p_questions,version=version+1,updated_at=now() where id=p_id returning version into v;
 else
  if p_version is distinct from 0 then raise exception 'Draft missing';end if;
  insert into public.survey_template_drafts(id,owner_id,name,questions,source) values(p_id,auth.uid(),p_name,p_questions,p_source) returning version into v;
 end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'template_draft_saved',jsonb_build_object('draft_id',p_id,'version',v));
 return v;
end $$;
create function public.publish_template_draft(p_id uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.survey_template_drafts; result uuid;
begin
 if not app_private.can_manage_surveys() then raise exception 'Survey management permission required';end if;
 select * into d from public.survey_template_drafts where id=p_id for update;
 if not found or d.owner_id<>auth.uid() then raise exception 'Draft access denied';end if;
 if p_version is distinct from d.version then raise exception 'Draft changed. Reopen saved draft';end if;
 if d.published_id is not null then return d.published_id;end if;
 result:=public.publish_survey_template(d.name,d.questions);
 update public.survey_template_drafts set published_id=result,updated_at=now() where id=p_id;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'template_draft_published',jsonb_build_object('draft_id',p_id,'template_id',result,'source',d.source));
 return result;
end $$;
revoke all on function public.save_template_draft(uuid,text,jsonb,jsonb,integer),public.publish_template_draft(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_template_draft(uuid,text,jsonb,jsonb,integer),public.publish_template_draft(uuid,integer) to authenticated;
