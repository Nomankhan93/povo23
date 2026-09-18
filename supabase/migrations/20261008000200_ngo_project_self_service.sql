-- POEM 2.15.1 — NGO Project Self-Service & POEM Project Approval.
-- Project drafts are approval envelopes only. Operational truth remains public.survey_projects.

create table public.survey_project_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references public.accounts(id),
  title text not null default '' check(length(title)<=150),
  template_id uuid references public.survey_templates(id),
  geography_id uuid references public.geographies(id),
  target integer check(target is null or target between 1 and 1000000),
  start_date date,
  end_date date,
  purpose text not null default '' check(length(purpose)<=2000),
  consent_version text not null default '' check(length(consent_version)<=100),
  consent_notice text not null default '' check(length(consent_notice)<=5000),
  review_status text not null default 'draft' check(review_status in ('draft','submitted','changes_requested','approved','rejected')),
  version integer not null default 1,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.accounts(id),
  review_note text not null default '' check(length(review_note)<=1000),
  approved_project_id uuid unique references public.survey_projects(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_date is null or start_date is null or end_date>=start_date)
);
create index survey_project_drafts_org_status
  on public.survey_project_drafts(organization_id,review_status,updated_at desc);
create index survey_project_drafts_review_queue
  on public.survey_project_drafts(review_status,submitted_at,id)
  where review_status='submitted';

create table public.survey_project_review_events (
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.survey_project_drafts(id) on delete cascade,
  actor_id uuid not null references public.accounts(id),
  action text not null check(action in ('submitted','resubmitted','changes_requested','approved','rejected')),
  note text not null default '' check(length(note)<=1000),
  created_at timestamptz not null default now()
);
create index survey_project_review_events_draft_time
  on public.survey_project_review_events(draft_id,created_at,id);

alter table public.survey_project_drafts enable row level security;
alter table public.survey_project_review_events enable row level security;
revoke all on public.survey_project_drafts,public.survey_project_review_events from anon,authenticated;
grant select on public.survey_project_drafts,public.survey_project_review_events to authenticated;

create function app_private.can_read_project_draft(draft uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select app_private.is_active() and exists(
    select 1
    from public.survey_project_drafts d
    where d.id=draft
      and (app_private.can_manage_surveys() or app_private.ngo_admin(d.organization_id))
  );
$$;
revoke all on function app_private.can_read_project_draft(uuid) from public,anon,authenticated;
grant execute on function app_private.can_read_project_draft(uuid) to authenticated;

create policy project_draft_read on public.survey_project_drafts
for select to authenticated
using(app_private.can_manage_surveys() or app_private.ngo_admin(organization_id));

create policy project_review_event_read on public.survey_project_review_events
for select to authenticated
using(app_private.can_read_project_draft(draft_id));

-- Keep direct POEM project creation compatible, but prevent cross-NGO template misuse.
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
  if not app_private.can_manage_surveys() then raise exception 'Survey management permission required';end if;
  if not exists(select 1 from public.organizations where id=p_org and status='active')
    or not exists(
      select 1 from public.survey_templates t
      where t.id=p_template and (t.organization_id is null or t.organization_id=p_org)
    )
    or not app_private.geo_active(p_geography)
  then raise exception 'Active NGO, geography and approved template for this NGO required';end if;
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
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),p_org,'survey_project_created',jsonb_build_object('id',result));
  return result;
end;$$;

create function public.save_organization_project_draft(
  p_id uuid,p_organization uuid,p_title text,p_template uuid,p_geography uuid,p_target integer,
  p_start date,p_end date,p_purpose text,p_consent_version text,p_consent_notice text,p_version integer
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_project_drafts; v integer;
begin
  if not app_private.ngo_admin(p_organization) then raise exception 'Active NGO Admin required';end if;
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
    where t.id=p_template and (t.organization_id is null or t.organization_id=p_organization)
  ) then raise exception 'Choose a POEM template or an approved template owned by this NGO';end if;
  if p_geography is not null and not app_private.geo_active(p_geography) then raise exception 'Choose an active collection area';end if;

  perform pg_advisory_xact_lock(hashtext('project-draft:'||p_id::text));
  select * into d from public.survey_project_drafts where id=p_id for update;
  if found then
    if d.organization_id is distinct from p_organization or not app_private.ngo_admin(d.organization_id) then raise exception 'Project draft access denied';end if;
    if d.approved_project_id is not null or d.review_status not in ('draft','changes_requested') then raise exception 'Project draft is locked while under or after POEM review';end if;
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

create function public.submit_project_draft(p_id uuid,p_version integer)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_project_drafts; v integer; action_name text;
begin
  select * into d from public.survey_project_drafts where id=p_id for update;
  if not found or not app_private.ngo_admin(d.organization_id) then raise exception 'NGO project draft access required';end if;
  if d.approved_project_id is not null or d.review_status not in ('draft','changes_requested') then raise exception 'Project draft is not editable/submittable';end if;
  if p_version is distinct from d.version then raise exception 'Project draft changed. Reopen it';end if;
  if length(trim(d.title)) not between 3 and 150
    or d.template_id is null
    or d.geography_id is null
    or d.target is null or d.target not between 1 and 1000000
    or d.start_date is null or d.end_date is null or d.end_date<d.start_date
    or length(trim(d.purpose)) not between 10 and 2000
    or length(trim(d.consent_version)) not between 1 and 100
    or length(trim(d.consent_notice)) not between 20 and 5000
  then raise exception 'Complete project title, template, area, dates, target, purpose and consent before submission';end if;
  if not exists(select 1 from public.organizations where id=d.organization_id and status='active')
    or not app_private.geo_active(d.geography_id)
    or not exists(
      select 1 from public.survey_templates t
      where t.id=d.template_id and (t.organization_id is null or t.organization_id=d.organization_id)
    )
  then raise exception 'Active NGO, collection area and approved template for this NGO are required';end if;

  action_name:=case when d.review_status='changes_requested' then 'resubmitted' else 'submitted' end;
  update public.survey_project_drafts
    set review_status='submitted',submitted_at=now(),reviewed_at=null,reviewed_by=null,review_note='',
        version=version+1,updated_at=now()
    where id=p_id returning version into v;
  insert into public.survey_project_review_events(draft_id,actor_id,action)
    values(p_id,auth.uid(),action_name);
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),d.organization_id,'survey_project_draft_'||action_name,jsonb_build_object('draft_id',p_id,'version',v));
  insert into public.notifications(user_id,title,body)
    select a.id,'NGO project submitted','An NGO submitted a survey project for POEM review. Open Survey projects to review it.'
    from public.accounts a
    where a.status='active' and a.platform_role in ('super_admin','admin','survey_manager') and a.id<>auth.uid();
  return v;
end $$;

create function public.review_project_draft(
  p_id uuid,p_decision text,p_note text,p_version integer
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare d public.survey_project_drafts; result uuid; note text:=trim(coalesce(p_note,''));
begin
  if not app_private.can_manage_surveys() then raise exception 'POEM survey management permission required';end if;
  if p_decision not in ('changes_requested','rejected','approved') then raise exception 'Invalid project review decision';end if;
  if length(note)>1000 or (p_decision in ('changes_requested','rejected') and length(note)<3) then raise exception 'Review note required for changes or rejection';end if;
  select * into d from public.survey_project_drafts where id=p_id for update;
  if not found then raise exception 'Submitted NGO project draft required';end if;
  if d.review_status='approved' and d.approved_project_id is not null and p_decision='approved' then return d.approved_project_id;end if;
  if d.review_status<>'submitted' then raise exception 'Project draft is not awaiting POEM review';end if;
  if p_version is distinct from d.version then raise exception 'Project draft changed. Reload review';end if;

  if p_decision='approved' then
    -- Recheck mutable external eligibility at the decision boundary.
    if not exists(select 1 from public.organizations where id=d.organization_id and status='active')
      or d.geography_id is null or not app_private.geo_active(d.geography_id)
      or d.template_id is null
      or not exists(
        select 1 from public.survey_templates t
        where t.id=d.template_id and (t.organization_id is null or t.organization_id=d.organization_id)
      )
    then raise exception 'NGO, collection area or approved template is no longer available';end if;

    result:=public.create_survey_project(
      d.organization_id,d.title,d.template_id,d.geography_id,d.target,
      d.start_date,d.end_date,d.purpose,d.consent_version,d.consent_notice
    );
    update public.survey_project_drafts
      set review_status='approved',approved_project_id=result,reviewed_at=now(),reviewed_by=auth.uid(),
          review_note=note,version=version+1,updated_at=now()
      where id=p_id;
  else
    update public.survey_project_drafts
      set review_status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),review_note=note,
          version=version+1,updated_at=now()
      where id=p_id;
  end if;

  insert into public.survey_project_review_events(draft_id,actor_id,action,note)
    values(p_id,auth.uid(),p_decision,note);
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),d.organization_id,'survey_project_draft_'||p_decision,
      jsonb_build_object('draft_id',p_id,'project_id',result,'note',note));
  insert into public.notifications(user_id,title,body)
    select m.user_id,
      case p_decision when 'approved' then 'Project approved' when 'rejected' then 'Project rejected' else 'Project changes requested' end,
      case p_decision when 'approved' then 'POEM approved your NGO project. The operational project is now active.' when 'rejected' then 'POEM rejected an NGO project draft. Open Survey projects to review the decision.' else 'POEM requested changes to an NGO project draft. Open Survey projects, edit the draft and resubmit.' end
    from public.organization_memberships m
    join public.accounts a on a.id=m.user_id
    where m.organization_id=d.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
  return result;
end $$;

revoke all on function public.save_organization_project_draft(uuid,uuid,text,uuid,uuid,integer,date,date,text,text,text,integer),
  public.submit_project_draft(uuid,integer),public.review_project_draft(uuid,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.save_organization_project_draft(uuid,uuid,text,uuid,uuid,integer,date,date,text,text,text,integer),
  public.submit_project_draft(uuid,integer),public.review_project_draft(uuid,text,text,integer)
  to authenticated;
