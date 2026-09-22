-- FieldLance 2.36.1 — Partner Self-Publishing & Platform Moderation
-- Partner Organizations publish their own templates/projects without FieldLance pre-approval.
-- FieldLance survey-management staff retain post-publication moderation authority.

alter table public.survey_templates
  add column moderation_status text not null default 'allowed'
    check (moderation_status in ('allowed','blocked','removed')),
  add column moderation_reason text not null default '' check(length(moderation_reason)<=1000),
  add column moderated_by uuid references public.accounts(id),
  add column moderated_at timestamptz;

alter table public.survey_projects
  add column moderation_status text not null default 'allowed'
    check (moderation_status in ('allowed','blocked','removed')),
  add column moderation_reason text not null default '' check(length(moderation_reason)<=1000),
  add column moderated_by uuid references public.accounts(id),
  add column moderated_at timestamptz,
  add column moderation_origin text not null default 'direct'
    check (moderation_origin in ('direct','template')),
  add column moderation_template_id uuid references public.survey_templates(id);

create index survey_templates_moderation
  on public.survey_templates(moderation_status,organization_id,created_at desc);
create index survey_projects_moderation
  on public.survey_projects(moderation_status,organization_id,created_at desc);

create table public.content_moderation_events (
  id bigint generated always as identity primary key,
  entity_type text not null check(entity_type in ('project','template')),
  entity_id uuid not null,
  organization_id uuid references public.organizations(id),
  action text not null check(action in ('blocked','removed','restored')),
  reason text not null check(length(reason) between 3 and 1000),
  actor_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now()
);
create index content_moderation_events_entity
  on public.content_moderation_events(entity_type,entity_id,created_at desc,id desc);
create index content_moderation_events_org
  on public.content_moderation_events(organization_id,created_at desc,id desc);

alter table public.content_moderation_events enable row level security;
revoke all on public.content_moderation_events from anon,authenticated;
grant select on public.content_moderation_events to authenticated;
grant all on public.content_moderation_events to service_role;
grant all on sequence public.content_moderation_events_id_seq to service_role;
create policy content_moderation_event_read on public.content_moderation_events
for select to authenticated
using(
  app_private.can_manage_surveys()
  or (organization_id is not null and app_private.ngo_admin(organization_id))
);

-- Pre-approval queues are retired. Historical events remain immutable; unresolved envelopes
-- return to editable draft state so their Organization can decide whether to publish them.
update public.survey_template_drafts
set review_status='draft',updated_at=now()
where organization_id is not null and published_id is null and review_status<>'draft';

update public.survey_project_drafts
set review_status='draft',updated_at=now()
where approved_project_id is null and review_status<>'draft';

-- Organization drafts are no longer a FieldLance review surface. Staff moderation begins only
-- after publication. Historical review events remain readable to the owning Organization.
create or replace function app_private.can_read_template_draft(draft uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active() and exists(
    select 1 from public.survey_template_drafts d
    where d.id=draft and (
      (d.organization_id is null and d.owner_id=auth.uid() and app_private.can_manage_surveys())
      or (d.organization_id is not null and app_private.ngo_admin(d.organization_id))
    )
  );
$$;

create or replace function app_private.can_read_project_draft(draft uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active() and exists(
    select 1 from public.survey_project_drafts d
    where d.id=draft and app_private.ngo_admin(d.organization_id)
  );
$$;

drop policy if exists draft_read on public.survey_template_drafts;
create policy draft_read on public.survey_template_drafts
for select to authenticated
using(app_private.can_read_template_draft(id));

drop policy if exists project_draft_read on public.survey_project_drafts;
create policy project_draft_read on public.survey_project_drafts
for select to authenticated
using(app_private.can_read_project_draft(id));

-- Published templates remain visible to their owner and to FieldLance staff even when moderated.
-- Other Organizations see only allowed FieldLance library versions, while project readers retain
-- historical access to the exact template already attached to an authorized project.
drop policy if exists template_read on public.survey_templates;
create policy template_read on public.survey_templates
for select to authenticated
using(
  app_private.can_manage_surveys()
  or (organization_id is not null and app_private.ngo_admin(organization_id))
  or (organization_id is null and moderation_status='allowed' and app_private.has_ngo_admin_membership())
  or exists(
    select 1 from public.survey_projects p
    where p.template_id=public.survey_templates.id and app_private.can_read_project(p.id)
  )
);

create or replace function app_private.project_effectively_allowed(pid uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.survey_projects p
    join public.survey_templates t on t.id=p.template_id
    where p.id=pid
      and p.moderation_status='allowed'
      and t.moderation_status='allowed'
  );
$$;

-- Operational removal terminates forward-looking recruitment/assignment state but preserves
-- historical surveys, cases, assistance, payables and audit. A temporary block relies on the
-- effective moderation gates and therefore can resume existing commitments after restore.
create or replace function app_private.terminate_project_operations(pid uuid,reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.survey_projects
  set recruitment_status='closed',recruitment_version=recruitment_version+1
  where id=pid and recruitment_status<>'closed';

  update public.survey_assignments set active=false
  where project_id=pid and active;

  update public.work_invitations i
  set status='cancelled',version=version+1,responded_at=now()
  where i.status='pending' and exists(
    select 1 from public.work_opportunities o
    where o.id=i.opportunity_id and o.survey_project_id=pid
  );

  update public.work_applications a
  set status='cancelled',version=version+1,updated_at=now()
  where a.survey_project_id=pid and a.status in ('pending','shortlisted');

  update public.work_assignments
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancellation_note=left('FieldLance moderation: '||coalesce(reason,'Operations suspended'),2000),
      version=version+1
  where survey_project_id=pid and status in ('offered','active');

  update public.work_opportunities
  set status='closed',applications_open=false,version=version+1
  where survey_project_id=pid and (status<>'closed' or applications_open);
end;
$$;

-- Collection and recruitment helpers now enforce moderation in addition to all existing rules.
create or replace function app_private.can_collect_before_governance(pid uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active()
    and app_private.project_effectively_allowed(pid)
    and exists(
      select 1
      from public.survey_assignments a
      join public.survey_projects p on p.id=a.project_id
      join public.organizations o on o.id=p.organization_id
      join public.volunteer_profiles v on v.user_id=a.user_id
      where p.id=pid
        and a.user_id=auth.uid()
        and a.active
        and p.status='active'
        and o.status='active'
        and v.status<>'suspended'
        and (now() at time zone 'UTC')::date between p.start_date and p.end_date
        and (
          not exists(select 1 from public.work_assignments w where w.survey_project_id=pid and w.user_id=auth.uid())
          or exists(
            select 1 from public.work_assignments w
            where w.survey_project_id=pid and w.user_id=auth.uid() and w.status='active'
              and (now() at time zone 'UTC')::date between w.start_date and w.end_date
          )
        )
    );
$$;

create or replace function app_private.project_recruitment_effective_open(pid uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.project_effectively_allowed(pid) and exists(
    select 1
    from public.survey_projects p
    where p.id=pid
      and p.status='active'
      and p.recruitment_status='open'
      and app_private.project_approved_count(p.id)<p.target
      and (
        p.required_volunteers is null
        or app_private.project_committed_volunteer_count(p.id)<p.required_volunteers
      )
  );
$$;

-- Table-level guards ensure no alternative RPC can accidentally reactivate moderated work.
create or replace function app_private.guard_moderated_survey_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.active and not app_private.project_effectively_allowed(new.project_id) then
    raise exception 'Project is blocked by FieldLance moderation';
  end if;
  return new;
end;
$$;
create trigger guard_moderated_survey_assignment
before insert or update of active on public.survey_assignments
for each row execute function app_private.guard_moderated_survey_assignment();

create or replace function app_private.guard_moderated_project_recruitment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.recruitment_status='open'
     and (new.moderation_status<>'allowed' or not exists(
       select 1 from public.survey_templates t where t.id=new.template_id and t.moderation_status='allowed'
     ))
  then raise exception 'Project recruitment cannot open while FieldLance moderation is active';end if;
  return new;
end;
$$;
create trigger guard_moderated_project_recruitment
before insert or update of recruitment_status,template_id on public.survey_projects
for each row execute function app_private.guard_moderated_project_recruitment();

create or replace function app_private.guard_moderated_work_opportunity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.survey_project_id is not null
     and (new.status='open' or new.applications_open)
     and not app_private.project_effectively_allowed(new.survey_project_id)
  then raise exception 'Project is blocked by FieldLance moderation';end if;
  return new;
end;
$$;
create trigger guard_moderated_work_opportunity
before insert or update of status,applications_open,survey_project_id on public.work_opportunities
for each row execute function app_private.guard_moderated_work_opportunity();

create or replace function app_private.guard_moderated_work_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status in ('offered','active')
     and not app_private.project_effectively_allowed(new.survey_project_id)
  then raise exception 'Project is blocked by FieldLance moderation';end if;
  return new;
end;
$$;
create trigger guard_moderated_work_assignment
before insert or update of status,survey_project_id on public.work_assignments
for each row execute function app_private.guard_moderated_work_assignment();

create or replace function app_private.guard_moderated_response_collection()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if not app_private.project_effectively_allowed(new.project_id) then
      raise exception 'Project is blocked by FieldLance moderation';
    end if;
  elsif not app_private.project_effectively_allowed(new.project_id) and (
    new.answers is distinct from old.answers
    or new.consent is distinct from old.consent
    or (old.status is distinct from 'submitted' and new.status='submitted')
  ) then
    raise exception 'Project is blocked by FieldLance moderation';
  end if;
  return new;
end;
$$;
create trigger guard_moderated_response_collection
before insert or update on public.survey_responses
for each row execute function app_private.guard_moderated_response_collection();

-- Draft editing language and validation now reflect self-publication rather than a review queue.
create or replace function public.save_organization_template_draft(
  p_id uuid,p_organization uuid,p_name text,p_questions jsonb,p_source jsonb,p_version integer
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_template_drafts; v integer;
begin
  if not app_private.ngo_admin(p_organization) then raise exception 'Active Organization Admin required';end if;
  if p_id is null or p_name is null or length(p_name)>150 or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_typeof(p_source) is distinct from 'object' then raise exception 'Invalid draft'; end if;
  if jsonb_array_length(p_questions)>50 or octet_length(p_questions::text)>50000 or octet_length(p_source::text)>2000 then raise exception 'Draft too large';end if;
  perform pg_advisory_xact_lock(hashtext('draft:'||p_id::text));
  select * into d from public.survey_template_drafts where id=p_id for update;
  if found then
    if d.organization_id is distinct from p_organization or not app_private.ngo_admin(d.organization_id) then raise exception 'Draft access denied';end if;
    if d.published_id is not null or d.review_status not in ('draft','changes_requested') then raise exception 'Draft is locked after publication';end if;
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
    values(auth.uid(),p_organization,'template_draft_saved',jsonb_build_object('draft_id',p_id,'version',v,'owner','organization'));
  return v;
end $$;

create or replace function public.save_organization_project_draft(
  p_id uuid,p_organization uuid,p_title text,p_template uuid,p_geography uuid,p_target integer,
  p_start date,p_end date,p_purpose text,p_consent_version text,p_consent_notice text,p_version integer
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_project_drafts; v integer;
begin
  if not app_private.ngo_admin(p_organization) then raise exception 'Active Organization Admin required';end if;
  if p_id is null then raise exception 'Project draft ID required';end if;
  if p_title is null or length(p_title)>150
    or p_purpose is null or length(p_purpose)>2000
    or p_consent_version is null or length(p_consent_version)>100
    or p_consent_notice is null or length(p_consent_notice)>5000
    or (p_target is not null and p_target not between 1 and 1000000)
    or (p_start is not null and p_end is not null and p_end<p_start)
  then raise exception 'Invalid project draft';end if;
  if p_template is not null and not exists(
    select 1 from public.survey_templates t
    where t.id=p_template and t.moderation_status='allowed'
      and (t.organization_id is null or t.organization_id=p_organization)
  ) then raise exception 'Choose an allowed FieldLance template or an allowed published template owned by this Organization';end if;
  if p_geography is not null and not app_private.geo_active(p_geography) then raise exception 'Choose an active collection area';end if;

  perform pg_advisory_xact_lock(hashtext('project-draft:'||p_id::text));
  select * into d from public.survey_project_drafts where id=p_id for update;
  if found then
    if d.organization_id is distinct from p_organization or not app_private.ngo_admin(d.organization_id) then raise exception 'Project draft access denied';end if;
    if d.approved_project_id is not null or d.review_status not in ('draft','changes_requested') then raise exception 'Project draft is locked after publication';end if;
    if p_version is distinct from d.version then raise exception 'Project draft changed. Reopen it before editing';end if;
    update public.survey_project_drafts
      set title=trim(p_title),template_id=p_template,geography_id=p_geography,target=p_target,
          start_date=p_start,end_date=p_end,purpose=trim(p_purpose),consent_version=trim(p_consent_version),
          consent_notice=trim(p_consent_notice),version=version+1,updated_at=now()
      where id=p_id returning version into v;
  else
    if p_version is distinct from 0 then raise exception 'Project draft missing';end if;
    insert into public.survey_project_drafts(
      id,organization_id,created_by,title,template_id,geography_id,target,start_date,end_date,
      purpose,consent_version,consent_notice
    ) values(
      p_id,p_organization,auth.uid(),trim(p_title),p_template,p_geography,p_target,p_start,p_end,
      trim(p_purpose),trim(p_consent_version),trim(p_consent_notice)
    ) returning version into v;
  end if;
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),p_organization,'survey_project_draft_saved',jsonb_build_object('draft_id',p_id,'version',v));
  return v;
end $$;

-- Project materialization remains a single existing survey_projects model. The helper has no
-- client execute grant: FieldLance direct creation and Organization draft publication are the two callers.
create function app_private.materialize_survey_project(
  p_org uuid,p_title text,p_template uuid,p_geography uuid,p_target integer,
  p_start date,p_end date,p_purpose text,p_consent_version text,p_consent_notice text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare result uuid;
begin
  if not exists(select 1 from public.organizations where id=p_org and status='active')
    or not exists(
      select 1 from public.survey_templates t
      where t.id=p_template
        and t.moderation_status='allowed'
        and (t.organization_id is null or t.organization_id=p_org)
    )
    or not app_private.geo_active(p_geography)
  then raise exception 'Active Organization, geography and allowed published template for this Organization required';end if;
  if p_title is null or length(trim(p_title)) not between 3 and 150
    or p_target is null or p_target not between 1 and 1000000
    or p_start is null or p_end is null or p_end<p_start
    or p_purpose is null or length(trim(p_purpose)) not between 10 and 2000
    or p_consent_version is null or length(trim(p_consent_version)) not between 1 and 100
    or p_consent_notice is null or length(trim(p_consent_notice)) not between 20 and 5000
  then raise exception 'Valid project dates, target, purpose and consent wording required';end if;
  insert into public.survey_projects(
    organization_id,title,template_id,geography_id,target,start_date,end_date,purpose,
    consent_version,consent_notice,created_by
  ) values(
    p_org,trim(p_title),p_template,p_geography,p_target,p_start,p_end,trim(p_purpose),
    trim(p_consent_version),trim(p_consent_notice),auth.uid()
  ) returning id into result;
  return result;
end;$$;

-- FieldLance keeps its existing direct-create capability; Partner Organizations publish through
-- their own draft RPC so project provenance and idempotent materialization remain explicit.
create or replace function public.create_survey_project(
  p_org uuid,p_title text,p_template uuid,p_geography uuid,p_target integer,
  p_start date,p_end date,p_purpose text,p_consent_version text,p_consent_notice text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare result uuid;
begin
  if not app_private.can_manage_surveys() then raise exception 'FieldLance survey management permission required';end if;
  result:=app_private.materialize_survey_project(
    p_org,p_title,p_template,p_geography,p_target,p_start,p_end,p_purpose,p_consent_version,p_consent_notice
  );
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),p_org,'survey_project_created',jsonb_build_object('id',result,'creator','fieldlance'));
  return result;
end;$$;

create function public.publish_organization_template_draft(p_id uuid,p_version integer)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_template_drafts; result uuid; ver integer;
begin
  select * into d from public.survey_template_drafts where id=p_id for update;
  if not found or d.organization_id is null or not app_private.ngo_admin(d.organization_id) then
    raise exception 'Organization template draft access required';
  end if;
  if p_version is distinct from d.version then raise exception 'Draft changed. Reopen saved draft';end if;
  if d.published_id is not null then return d.published_id;end if;
  if d.review_status not in ('draft','changes_requested','submitted','rejected') then raise exception 'Draft is not publishable';end if;
  if length(trim(d.name)) not between 3 and 150
     or jsonb_typeof(d.questions) is distinct from 'array'
     or jsonb_array_length(d.questions) not between 1 and 50
     or octet_length(d.questions::text)>50000
  then raise exception 'Template name and 1–50 questions required';end if;
  perform app_private.validate_capture_questions(d.questions);
  perform pg_advisory_xact_lock(hashtext('template:'||lower(trim(d.name))));
  select coalesce(max(t.version),0)+1 into ver from public.survey_templates t where t.name=trim(d.name);
  insert into public.survey_templates(name,version,questions,created_by,organization_id,source_draft_id)
    values(trim(d.name),ver,d.questions,auth.uid(),d.organization_id,d.id)
    returning id into result;
  update public.survey_template_drafts
    set published_id=result,review_status='approved',version=version+1,updated_at=now()
    where id=d.id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),d.organization_id,'organization_template_published',jsonb_build_object('draft_id',d.id,'template_id',result,'version',ver));
  return result;
end;$$;

create function public.publish_organization_project_draft(p_id uuid,p_version integer)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_project_drafts; result uuid;
begin
  select * into d from public.survey_project_drafts where id=p_id for update;
  if not found or not app_private.ngo_admin(d.organization_id) then raise exception 'Organization project draft access required';end if;
  if p_version is distinct from d.version then raise exception 'Project draft changed. Reopen it';end if;
  if d.approved_project_id is not null then return d.approved_project_id;end if;
  if d.review_status not in ('draft','changes_requested','submitted','rejected') then raise exception 'Project draft is not publishable';end if;
  if length(trim(d.title)) not between 3 and 150
    or d.template_id is null
    or d.geography_id is null
    or d.target is null or d.target not between 1 and 1000000
    or d.start_date is null or d.end_date is null or d.end_date<d.start_date
    or length(trim(d.purpose)) not between 10 and 2000
    or length(trim(d.consent_version)) not between 1 and 100
    or length(trim(d.consent_notice)) not between 20 and 5000
  then raise exception 'Complete project title, template, area, dates, target, purpose and consent before publication';end if;
  result:=app_private.materialize_survey_project(
    d.organization_id,d.title,d.template_id,d.geography_id,d.target,
    d.start_date,d.end_date,d.purpose,d.consent_version,d.consent_notice
  );
  update public.survey_project_drafts
    set review_status='approved',approved_project_id=result,version=version+1,updated_at=now()
    where id=d.id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),d.organization_id,'organization_project_published',jsonb_build_object('draft_id',d.id,'project_id',result));
  return result;
end;$$;

-- Legacy "submit" RPCs now self-publish instead of creating a FieldLance approval queue.
create or replace function public.submit_template_draft(p_id uuid,p_version integer)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare ignored uuid; v integer;
begin
  ignored:=public.publish_organization_template_draft(p_id,p_version);
  select version into v from public.survey_template_drafts where id=p_id;
  return v;
end;$$;

create or replace function public.submit_project_draft(p_id uuid,p_version integer)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare ignored uuid; v integer;
begin
  ignored:=public.publish_organization_project_draft(p_id,p_version);
  select version into v from public.survey_project_drafts where id=p_id;
  return v;
end;$$;

-- Pre-publication review RPCs are kept only as explicit compatibility failures so old clients do
-- not silently recreate the retired approval workflow.
create or replace function public.review_template_draft(p_id uuid,p_decision text,p_note text,p_version integer)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Template pre-approval is retired; Organizations publish directly and FieldLance moderates published content';
end;$$;

create or replace function public.review_project_draft(p_id uuid,p_decision text,p_note text,p_version integer)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Project pre-approval is retired; Organizations publish directly and FieldLance moderates published content';
end;$$;

create function public.moderate_survey_project(p_id uuid,p_action text,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare p public.survey_projects; next_status text; reason text:=trim(coalesce(p_reason,''));
begin
  if not app_private.can_manage_surveys() then raise exception 'FieldLance survey management permission required';end if;
  if p_action not in ('block','remove','restore') then raise exception 'Moderation action must be block, remove or restore';end if;
  if length(reason) not between 3 and 1000 then raise exception 'Moderation reason must be 3–1000 characters';end if;
  select * into p from public.survey_projects where id=p_id for update;
  if not found then raise exception 'Project not found';end if;
  next_status:=case p_action when 'block' then 'blocked' when 'remove' then 'removed' else 'allowed' end;
  if next_status='allowed' and not exists(
    select 1 from public.survey_templates t where t.id=p.template_id and t.moderation_status='allowed'
  ) then raise exception 'Restore the project template before restoring this project';end if;
  update public.survey_projects
  set moderation_status=next_status,
      moderation_reason=case when next_status='allowed' then '' else reason end,
      moderated_by=auth.uid(),moderated_at=now(),moderation_origin='direct',moderation_template_id=null
  where id=p.id;
  if next_status='removed' then perform app_private.terminate_project_operations(p.id,reason);end if;
  insert into public.content_moderation_events(entity_type,entity_id,organization_id,action,reason,actor_id)
    values('project',p.id,p.organization_id,case when p_action='restore' then 'restored' when p_action='remove' then 'removed' else 'blocked' end,reason,auth.uid());
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),p.organization_id,'survey_project_moderation_'||p_action,jsonb_build_object('project_id',p.id,'reason',reason));
  insert into public.notifications(user_id,title,body)
    select m.user_id,
      case p_action when 'restore' then 'Project restored by FieldLance' when 'remove' then 'Project removed by FieldLance' else 'Project blocked by FieldLance' end,
      case
        when p_action='restore' and p.moderation_status='removed' then 'FieldLance restored a removed project. Recruitment and cancelled assignments are not recreated automatically. Reason: '||reason
        when p_action='restore' then 'FieldLance lifted the temporary project block. Existing commitments may resume subject to current project rules. Reason: '||reason
        when p_action='remove' then 'FieldLance removed this project from operation and ended forward recruitment/assignment activity. Reason: '||reason
        else 'FieldLance temporarily blocked this project. Existing commitments are paused while the block is active. Reason: '||reason
      end
    from public.organization_memberships m join public.accounts a on a.id=m.user_id
    where m.organization_id=p.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
end;$$;

create function public.moderate_survey_template(p_id uuid,p_action text,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare t public.survey_templates; next_status text; reason text:=trim(coalesce(p_reason,'')); r record;
begin
  if not app_private.can_manage_surveys() then raise exception 'FieldLance survey management permission required';end if;
  if p_action not in ('block','remove','restore') then raise exception 'Moderation action must be block, remove or restore';end if;
  if length(reason) not between 3 and 1000 then raise exception 'Moderation reason must be 3–1000 characters';end if;
  select * into t from public.survey_templates where id=p_id for update;
  if not found then raise exception 'Template not found';end if;
  next_status:=case p_action when 'block' then 'blocked' when 'remove' then 'removed' else 'allowed' end;
  update public.survey_templates
  set moderation_status=next_status,
      moderation_reason=case when next_status='allowed' then '' else reason end,
      moderated_by=auth.uid(),moderated_at=now()
  where id=t.id;

  if next_status<>'allowed' then
    for r in select p.id from public.survey_projects p where p.template_id=t.id loop
      update public.survey_projects
      set moderation_status=next_status,
          moderation_reason='Template restricted by FieldLance: '||reason,
          moderated_by=auth.uid(),moderated_at=now(),moderation_origin='template',moderation_template_id=t.id
      where id=r.id and (
        moderation_status='allowed'
        or (moderation_origin='template' and moderation_template_id=t.id)
      );
      if next_status='removed' then
        perform app_private.terminate_project_operations(r.id,'Template removed: '||reason);
      end if;
    end loop;
  else
    update public.survey_projects
    set moderation_status='allowed',moderation_reason='',moderated_by=auth.uid(),moderated_at=now(),
        moderation_origin='direct',moderation_template_id=null
    where moderation_origin='template' and moderation_template_id=t.id;
  end if;

  insert into public.content_moderation_events(entity_type,entity_id,organization_id,action,reason,actor_id)
    values('template',t.id,t.organization_id,case when p_action='restore' then 'restored' when p_action='remove' then 'removed' else 'blocked' end,reason,auth.uid());
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),t.organization_id,'survey_template_moderation_'||p_action,jsonb_build_object('template_id',t.id,'reason',reason));
  if t.organization_id is not null then
    insert into public.notifications(user_id,title,body)
      select m.user_id,
        case p_action when 'restore' then 'Template restored by FieldLance' when 'remove' then 'Template removed by FieldLance' else 'Template blocked by FieldLance' end,
        case
          when p_action='restore' and t.moderation_status='removed' then 'FieldLance restored a removed survey template. Dependent recruitment and cancelled assignments are not recreated automatically. Reason: '||reason
          when p_action='restore' then 'FieldLance lifted the temporary template block. Existing dependent commitments may resume subject to project rules. Reason: '||reason
          when p_action='remove' then 'FieldLance removed this survey template from operation and ended forward activity on dependent projects. Reason: '||reason
          else 'FieldLance temporarily blocked this survey template and paused dependent project operations. Reason: '||reason
        end
      from public.organization_memberships m join public.accounts a on a.id=m.user_id
      where m.organization_id=t.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
  end if;
end;$$;

revoke all on function app_private.project_effectively_allowed(uuid),app_private.terminate_project_operations(uuid,text),
  app_private.materialize_survey_project(uuid,text,uuid,uuid,integer,date,date,text,text,text),
  app_private.guard_moderated_survey_assignment(),app_private.guard_moderated_project_recruitment(),
  app_private.guard_moderated_work_opportunity(),app_private.guard_moderated_work_assignment(),
  app_private.guard_moderated_response_collection()
  from public,anon,authenticated;

revoke all on function public.publish_organization_template_draft(uuid,integer),
  public.publish_organization_project_draft(uuid,integer),public.moderate_survey_project(uuid,text,text),
  public.moderate_survey_template(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_organization_template_draft(uuid,integer),
  public.publish_organization_project_draft(uuid,integer),public.moderate_survey_project(uuid,text,text),
  public.moderate_survey_template(uuid,text,text)
  to authenticated;
