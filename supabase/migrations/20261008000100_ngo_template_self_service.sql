-- POEM 2.15.0 — NGO Template Self-Service & POEM Approval Workflow.
-- Extends the existing template draft/publisher primitives. Published survey templates remain immutable.

alter table public.survey_template_drafts
  add column organization_id uuid references public.organizations(id),
  add column review_status text not null default 'draft' check(review_status in ('draft','submitted','changes_requested','approved','rejected')),
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.accounts(id),
  add column review_note text not null default '' check(length(review_note)<=1000);

alter table public.survey_templates
  add column organization_id uuid references public.organizations(id),
  add column source_draft_id uuid references public.survey_template_drafts(id);

-- Normalize historical POEM draft publications into the new review/lineage fields.
update public.survey_template_drafts
set review_status='approved',reviewed_at=updated_at,reviewed_by=owner_id
where published_id is not null;
update public.survey_templates t
set source_draft_id=d.id
from public.survey_template_drafts d
where d.published_id=t.id and t.source_draft_id is null;

create unique index survey_templates_source_draft_unique
  on public.survey_templates(source_draft_id)
  where source_draft_id is not null;
create index survey_template_drafts_org_status
  on public.survey_template_drafts(organization_id,review_status,updated_at desc);
create index survey_templates_org_created
  on public.survey_templates(organization_id,created_at desc);

create table public.survey_template_review_events (
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.survey_template_drafts(id) on delete cascade,
  actor_id uuid not null references public.accounts(id),
  action text not null check(action in ('submitted','resubmitted','changes_requested','approved','rejected')),
  note text not null default '' check(length(note)<=1000),
  created_at timestamptz not null default now()
);
create index survey_template_review_events_draft_time
  on public.survey_template_review_events(draft_id,created_at,id);

alter table public.survey_template_review_events enable row level security;
revoke all on public.survey_template_review_events from anon,authenticated;
grant select on public.survey_template_review_events to authenticated;

create or replace function app_private.has_ngo_admin_membership()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active() and exists(
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id=m.organization_id
    where m.user_id=auth.uid()
      and m.role='ngo_admin'
      and m.status='active'
      and o.status='active'
  );
$$;

create or replace function app_private.can_read_template_draft(draft uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active() and exists(
    select 1
    from public.survey_template_drafts d
    where d.id=draft
      and (
        (d.organization_id is null and d.owner_id=auth.uid() and app_private.can_manage_surveys())
        or (d.organization_id is not null and (app_private.can_manage_surveys() or app_private.ngo_admin(d.organization_id)))
      )
  );
$$;

revoke all on function app_private.has_ngo_admin_membership(),app_private.can_read_template_draft(uuid) from public,anon,authenticated;
grant execute on function app_private.has_ngo_admin_membership(),app_private.can_read_template_draft(uuid) to authenticated;

drop policy if exists draft_read on public.survey_template_drafts;
create policy draft_read on public.survey_template_drafts
for select to authenticated
using(
  (organization_id is null and owner_id=auth.uid() and app_private.can_manage_surveys())
  or (organization_id is not null and (app_private.can_manage_surveys() or app_private.ngo_admin(organization_id)))
);

create policy template_review_event_read on public.survey_template_review_events
for select to authenticated
using(app_private.can_read_template_draft(draft_id));

drop policy if exists template_read on public.survey_templates;
create policy template_read on public.survey_templates
for select to authenticated
using(
  app_private.can_manage_surveys()
  or (organization_id is not null and app_private.ngo_admin(organization_id))
  or (organization_id is null and app_private.has_ngo_admin_membership())
  or exists(
    select 1
    from public.survey_projects p
    where p.template_id=public.survey_templates.id
      and app_private.can_read_project(p.id)
  )
);

-- Existing POEM author flow remains private/direct and cannot be used to mutate NGO-owned drafts.
create or replace function public.save_template_draft(
  p_id uuid,p_name text,p_questions jsonb,p_source jsonb,p_version integer
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_template_drafts; v integer;
begin
  if not app_private.can_manage_surveys() then raise exception 'Survey management permission required'; end if;
  if p_id is null or p_name is null or length(p_name)>150 or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_typeof(p_source) is distinct from 'object' then raise exception 'Invalid draft'; end if;
  if jsonb_array_length(p_questions)>50 or octet_length(p_questions::text)>50000 or octet_length(p_source::text)>2000 then raise exception 'Draft too large';end if;
  perform pg_advisory_xact_lock(hashtext('draft:'||p_id::text));
  select * into d from public.survey_template_drafts where id=p_id for update;
  if found then
    if d.organization_id is not null or d.owner_id<>auth.uid() then raise exception 'Draft access denied';end if;
    if d.published_id is not null then raise exception 'Already published; create a new version draft';end if;
    if d.review_status<>'draft' then raise exception 'POEM author draft is locked';end if;
    if p_version is distinct from d.version then raise exception 'Draft changed. Reopen saved draft before editing';end if;
    update public.survey_template_drafts
      set name=p_name,questions=p_questions,version=version+1,updated_at=now()
      where id=p_id returning version into v;
  else
    if p_version is distinct from 0 then raise exception 'Draft missing';end if;
    insert into public.survey_template_drafts(id,owner_id,name,questions,source,review_status)
      values(p_id,auth.uid(),p_name,p_questions,p_source,'draft') returning version into v;
  end if;
  insert into public.audit_events(actor_id,action,detail)
    values(auth.uid(),'template_draft_saved',jsonb_build_object('draft_id',p_id,'version',v,'owner','poem'));
  return v;
end $$;

create or replace function public.publish_template_draft(p_id uuid,p_version integer)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_template_drafts; result uuid;
begin
  if not app_private.can_manage_surveys() then raise exception 'Survey management permission required';end if;
  select * into d from public.survey_template_drafts where id=p_id for update;
  if not found or d.organization_id is not null or d.owner_id<>auth.uid() then raise exception 'Draft access denied';end if;
  if p_version is distinct from d.version then raise exception 'Draft changed. Reopen saved draft';end if;
  if d.published_id is not null then return d.published_id;end if;
  if d.review_status<>'draft' then raise exception 'POEM author draft is locked';end if;
  result:=public.publish_survey_template(d.name,d.questions);
  update public.survey_template_drafts
    set published_id=result,review_status='approved',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
    where id=p_id;
  update public.survey_templates
    set source_draft_id=p_id
    where id=result;
  insert into public.audit_events(actor_id,action,detail)
    values(auth.uid(),'template_draft_published',jsonb_build_object('draft_id',p_id,'template_id',result,'source',d.source));
  return result;
end $$;

create function public.save_organization_template_draft(
  p_id uuid,p_organization uuid,p_name text,p_questions jsonb,p_source jsonb,p_version integer
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_template_drafts; v integer;
begin
  if not app_private.ngo_admin(p_organization) then raise exception 'Active NGO Admin required';end if;
  if p_id is null or p_name is null or length(p_name)>150 or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_typeof(p_source) is distinct from 'object' then raise exception 'Invalid draft'; end if;
  if jsonb_array_length(p_questions)>50 or octet_length(p_questions::text)>50000 or octet_length(p_source::text)>2000 then raise exception 'Draft too large';end if;
  perform pg_advisory_xact_lock(hashtext('draft:'||p_id::text));
  select * into d from public.survey_template_drafts where id=p_id for update;
  if found then
    if d.organization_id is distinct from p_organization or not app_private.ngo_admin(d.organization_id) then raise exception 'Draft access denied';end if;
    if d.published_id is not null or d.review_status not in ('draft','changes_requested') then raise exception 'Draft is locked while under or after POEM review';end if;
    if p_version is distinct from d.version then raise exception 'Draft changed. Reopen saved draft before editing';end if;
    update public.survey_template_drafts
      set name=p_name,questions=p_questions,version=version+1,updated_at=now()
      where id=p_id returning version into v;
  else
    if p_version is distinct from 0 then raise exception 'Draft missing';end if;
    insert into public.survey_template_drafts(id,owner_id,organization_id,name,questions,source,review_status)
      values(p_id,auth.uid(),p_organization,p_name,p_questions,p_source,'draft') returning version into v;
  end if;
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),p_organization,'template_draft_saved',jsonb_build_object('draft_id',p_id,'version',v,'owner','ngo'));
  return v;
end $$;

create function public.submit_template_draft(p_id uuid,p_version integer)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_template_drafts; v integer; action_name text;
begin
  select * into d from public.survey_template_drafts where id=p_id for update;
  if not found or d.organization_id is null or not app_private.ngo_admin(d.organization_id) then raise exception 'NGO template draft access required';end if;
  if d.published_id is not null or d.review_status not in ('draft','changes_requested') then raise exception 'Draft is not editable/submittable';end if;
  if p_version is distinct from d.version then raise exception 'Draft changed. Reopen saved draft';end if;
  if length(trim(d.name)) not between 3 and 150 or jsonb_typeof(d.questions) is distinct from 'array' or jsonb_array_length(d.questions) not between 1 and 50 or octet_length(d.questions::text)>50000 then raise exception 'Template name and 1–50 questions required';end if;
  perform app_private.validate_capture_questions(d.questions);
  action_name:=case when d.review_status='changes_requested' then 'resubmitted' else 'submitted' end;
  update public.survey_template_drafts
    set review_status='submitted',submitted_at=now(),reviewed_at=null,reviewed_by=null,review_note='',version=version+1,updated_at=now()
    where id=p_id returning version into v;
  insert into public.survey_template_review_events(draft_id,actor_id,action)
    values(p_id,auth.uid(),action_name);
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),d.organization_id,'template_draft_'||action_name,jsonb_build_object('draft_id',p_id,'version',v));
  insert into public.notifications(user_id,title,body)
    select a.id,'NGO template submitted','An NGO submitted a survey template for POEM review. Open Survey templates to review it.'
    from public.accounts a
    where a.status='active' and a.platform_role in ('super_admin','admin','survey_manager') and a.id<>auth.uid();
  return v;
end $$;

create function public.review_template_draft(
  p_id uuid,p_decision text,p_note text,p_version integer
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_template_drafts; result uuid; note text:=trim(coalesce(p_note,''));
begin
  if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required';end if;
  if p_decision not in ('changes_requested','rejected','approved') then raise exception 'Invalid template review decision';end if;
  if length(note)>1000 or (p_decision in ('changes_requested','rejected') and length(note)<3) then raise exception 'Review note required for changes or rejection';end if;
  select * into d from public.survey_template_drafts where id=p_id for update;
  if not found or d.organization_id is null then raise exception 'Submitted NGO template draft required';end if;
  if d.review_status='approved' and d.published_id is not null and p_decision='approved' then return d.published_id;end if;
  if d.review_status<>'submitted' then raise exception 'Template draft is not awaiting POEM review';end if;
  if p_version is distinct from d.version then raise exception 'Draft changed. Reload review';end if;

  if p_decision='approved' then
    result:=public.publish_survey_template(d.name,d.questions);
    update public.survey_templates
      set organization_id=d.organization_id,source_draft_id=d.id
      where id=result;
    update public.survey_template_drafts
      set review_status='approved',published_id=result,reviewed_at=now(),reviewed_by=auth.uid(),review_note=note,version=version+1,updated_at=now()
      where id=p_id;
  else
    update public.survey_template_drafts
      set review_status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),review_note=note,version=version+1,updated_at=now()
      where id=p_id;
  end if;

  insert into public.survey_template_review_events(draft_id,actor_id,action,note)
    values(p_id,auth.uid(),p_decision,note);
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),d.organization_id,'template_draft_'||p_decision,jsonb_build_object('draft_id',p_id,'template_id',result,'note',note));
  insert into public.notifications(user_id,title,body)
    select m.user_id,
      case p_decision when 'approved' then 'Template approved' when 'rejected' then 'Template rejected' else 'Template changes requested' end,
      case p_decision when 'approved' then 'POEM approved your NGO survey template. The published version is now immutable.' when 'rejected' then 'POEM rejected an NGO survey template. Open My templates to review the decision.' else 'POEM requested changes to an NGO survey template. Open My templates, edit the draft and resubmit.' end
    from public.organization_memberships m
    join public.accounts a on a.id=m.user_id
    where m.organization_id=d.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
  return result;
end $$;

revoke all on function public.save_organization_template_draft(uuid,uuid,text,jsonb,jsonb,integer),public.submit_template_draft(uuid,integer),public.review_template_draft(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_organization_template_draft(uuid,uuid,text,jsonb,jsonb,integer),public.submit_template_draft(uuid,integer),public.review_template_draft(uuid,text,text,integer) to authenticated;
