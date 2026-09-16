-- POEM 2.12.4 — Recruitment Stabilization Revision
-- Complete logged-in opportunity/applications workflow on the existing workforce domain.
-- This migration intentionally replaces the unshipped 2.12.4 draft; apply it only to a 2.12.3 database.

-- Existing / legacy opportunities remain invitation-only and do not silently become open recruitment.
alter table public.work_opportunities
  add column visibility text not null default 'invite_only' check(visibility in ('all','area','invite_only')),
  add column publication_state text not null default 'published' check(publication_state in ('draft','published')),
  add column applications_open boolean not null default false,
  add column eligibility_note text not null default '' check(length(eligibility_note)<=1000),
  add column version integer not null default 1,
  add column published_at timestamptz;

update public.work_opportunities
set published_at=created_at
where publication_state='published' and published_at is null;

create index work_opportunities_recruitment
  on public.work_opportunities(publication_state,applications_open,status,reply_by,visibility,created_at desc);

-- Existing opportunity RLS allowed NGO admins/invitees but not POEM survey-management staff.
-- POEM project managers need the same read surface they are authorized to manage; ordinary
-- volunteers still receive open-recruitment details only through the bounded search RPC below.
drop policy opportunity_read on public.work_opportunities;
create policy opportunity_read on public.work_opportunities for select to authenticated using(
  app_private.is_active() and (
    app_private.ngo_admin(organization_id)
    or app_private.can_manage_surveys()
    or app_private.is_invited(id)
  )
);

alter table public.work_applications
  add column availability text not null default '' check(length(availability)<=1000),
  add column profile_share_consent boolean not null default false,
  add column consent_version text not null default '' check(length(consent_version)<=100),
  add column profile_snapshot jsonb not null default '{}'::jsonb,
  add column withdrawn_at timestamptz;

create function app_private.profile_in_area(p_user uuid,p_area uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_area is not null and exists(
  with recursive areas as (
    select id from public.geographies where id=p_area and active
    union all
    select g.id from public.geographies g join areas a on g.parent_id=a.id where g.active
  )
  select 1
  from public.volunteer_profiles v
  where v.user_id=p_user and v.geography_id in (select id from areas)
 );
$$;

-- Recruitment selection/activation follows the currently published project verification policy.
-- "verified" on volunteer_profiles is the legacy database value for an Active/published profile;
-- independent verification is checked separately here when project governance requires it.
create function app_private.project_recruitment_verification_ready(p_project uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from public.survey_projects p
  left join public.project_policy_versions v
    on v.project_id=p.id and v.version=p.governance_version
  where p.id=p_project
    and (
      p.governance_version=0
      or (
        v.project_id is not null
        and (not v.require_ngo_verification or app_private.has_independent_verification('organization',p.organization_id))
        and (not v.require_volunteer_verification or app_private.has_independent_verification('volunteer',p_user))
      )
    )
 );
$$;

create function app_private.work_opportunity_visible(p_opportunity uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from public.work_opportunities o
  join public.accounts a on a.id=p_user and a.status='active'
  join public.volunteer_profiles v on v.user_id=p_user and v.status='verified'
  where o.id=p_opportunity
    and o.survey_project_id is not null
    and o.publication_state='published'
    and o.applications_open
    and o.status='open'
    and o.reply_by>now()
    and (
      o.visibility='all'
      or (o.visibility='area' and app_private.profile_in_area(p_user,o.geography_id))
      or (o.visibility='invite_only' and exists(
        select 1 from public.work_invitations i
        where i.opportunity_id=o.id and i.user_id=p_user and i.status in ('pending','accepted')
      ))
    )
 );
$$;

create function app_private.recruitment_profile_snapshot(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object(
   'full_name',coalesce(a.full_name,v.details->>'full_name',''),
   'phone',v.details->>'phone',
   'area',v.details->>'area',
   'education',v.details->>'education',
   'skills',v.details->>'skills',
   'languages',v.details->>'languages',
   'experience',v.details->>'experience',
   'availability',v.details->>'availability',
   'preference',v.details->>'preference',
   'transport',v.details->>'transport',
   'smartphone',v.details->>'smartphone',
   'preferred_areas',v.details->>'preferred_areas',
   'bio',v.details->>'bio',
   'geography_id',v.geography_id,
   'profile_publication_status',case when v.status='verified' then 'active' else v.status end,
   'profile_version',v.version
 ))
 from public.volunteer_profiles v
 join public.accounts a on a.id=v.user_id
 where v.user_id=p_user;
$$;

create function public.create_recruitment_opportunity(
  p_project uuid,p_title text,p_description text,p_geography uuid,p_start date,p_end date,
  p_reply_by timestamptz,p_payment text,p_payment_note text,p_required_volunteers integer,
  p_required_skill text,p_required_language text,p_visibility text,p_eligibility_note text,p_publish boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;new_id uuid;
begin
 select * into p from public.survey_projects where id=p_project for update;
 if not found or not app_private.can_review_survey(p_project) then raise exception 'Project recruitment management permission required';end if;
 if p.status<>'active' then raise exception 'Active survey project required';end if;
 if p_title is null or length(trim(p_title)) not between 3 and 150 or p_description is null or length(trim(p_description)) not between 10 and 4000 then raise exception 'Valid title and expected tasks required';end if;
 if p_start is null or p_end is null or p_start<p.start_date or p_end>p.end_date or p_end<p_start then raise exception 'Opportunity dates must stay within project dates';end if;
 if p_reply_by is null or p_reply_by<=now() or p_reply_by>((p_start+1)::timestamp at time zone 'UTC') then raise exception 'Valid application deadline required';end if;
 if p_payment not in ('paid','unpaid') or p_payment_note is null or length(p_payment_note)>1000 then raise exception 'Valid work mode required';end if;
 if p_payment='paid' and length(trim(p_payment_note))<3 then raise exception 'Describe proposed paid terms';end if;
 if p_required_volunteers is null or p_required_volunteers not between 1 and 5000 or p_required_skill is null or length(p_required_skill)>100 or p_required_language is null or length(p_required_language)>100 then raise exception 'Valid positions and optional criteria required';end if;
 if p_visibility not in ('all','area','invite_only') then raise exception 'Valid recruitment visibility required';end if;
 if p_eligibility_note is null or length(p_eligibility_note)>1000 then raise exception 'Eligibility note is too long';end if;
 if p_publish is null then raise exception 'Publication decision required';end if;
 if not app_private.geo_active(p_geography) then raise exception 'Active geography required';end if;
 if not exists(with recursive areas as (select id from public.geographies where id=p.geography_id union all select g.id from public.geographies g join areas a on g.parent_id=a.id) select 1 from areas where id=p_geography) then raise exception 'Recruitment work area must be within the survey project area';end if;
 insert into public.work_opportunities(
   organization_id,title,description,geography_id,start_date,end_date,reply_by,payment_type,payment_note,created_by,
   survey_project_id,required_volunteers,required_skill,required_language,visibility,eligibility_note,publication_state,applications_open,published_at
 ) values(
   p.organization_id,trim(p_title),trim(p_description),p_geography,p_start,p_end,p_reply_by,p_payment,trim(p_payment_note),auth.uid(),
   p_project,p_required_volunteers,trim(p_required_skill),trim(p_required_language),p_visibility,trim(p_eligibility_note),
   case when p_publish then 'published' else 'draft' end,p_publish,case when p_publish then now() else null end
 ) returning id into new_id;
 insert into public.audit_events(actor_id,organization_id,action,detail)
 values(auth.uid(),p.organization_id,'recruitment_opportunity_created',jsonb_build_object('id',new_id,'project',p_project,'positions',p_required_volunteers,'visibility',p_visibility,'published',p_publish));
 return new_id;
end;$$;

-- Recruitment application state is separate from the legacy opportunity status used by invitations.
-- Closing applications preserves all received applications and existing invitation history.
create function public.set_work_opportunity_state(p_id uuid,p_state text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare o public.work_opportunities;
begin
 select * into o from public.work_opportunities where id=p_id for update;
 if not found or o.survey_project_id is null or not app_private.can_review_survey(o.survey_project_id) then raise exception 'Project recruitment management permission required';end if;
 if o.version is distinct from p_version then raise exception 'Opportunity changed. Reload.';end if;
 if p_state not in ('draft','published','closed') then raise exception 'Valid recruitment state required';end if;
 if p_state='published' then
  if o.status<>'open' then raise exception 'The underlying opportunity is closed';end if;
  if o.reply_by<=now() then raise exception 'Application deadline has expired';end if;
  if not exists(select 1 from public.survey_projects where id=o.survey_project_id and status='active') then raise exception 'Active survey project required';end if;
  update public.work_opportunities
  set publication_state='published',applications_open=true,published_at=coalesce(published_at,now()),version=version+1
  where id=p_id;
 elsif p_state='draft' then
  if exists(select 1 from public.work_applications where opportunity_id=p_id)
     or exists(select 1 from public.work_invitations where opportunity_id=p_id)
     or exists(select 1 from public.work_assignments where opportunity_id=p_id)
  then raise exception 'Recruitment with activity cannot return to draft; close applications instead';end if;
  update public.work_opportunities set publication_state='draft',applications_open=false,version=version+1 where id=p_id;
 else
  if not o.applications_open then return;end if;
  update public.work_opportunities set applications_open=false,version=version+1 where id=p_id;
 end if;
 insert into public.audit_events(actor_id,organization_id,action,detail)
 values(auth.uid(),o.organization_id,'recruitment_state_changed',jsonb_build_object('id',p_id,'state',p_state,'applications_open',p_state='published'));
end;$$;

-- Volunteer browsing exposes only recruitment-safe opportunity/project/organization labels through this RPC.
drop function public.available_work_opportunities(integer);
create function public.available_work_opportunities(
 p_page integer default 0,p_organization uuid default null,p_area uuid default null,p_payment text default null,
 p_skill text default '',p_work_date date default null,p_deadline date default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;details jsonb;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page';end if;
 if p_payment is not null and p_payment not in ('paid','unpaid') then raise exception 'Invalid payment filter';end if;
 if p_skill is null or length(p_skill)>100 then raise exception 'Invalid skill filter';end if;
 select v.details into details from public.volunteer_profiles v where v.user_id=auth.uid() and v.status='verified';
 if details is null then return jsonb_build_object('rows','[]'::jsonb,'total',0,'page',p_page,'page_size',50);end if;
 with matched as materialized (
  select o.id,o.organization_id,o.title,o.description,o.geography_id,o.start_date,o.end_date,o.reply_by,o.payment_type,o.payment_note,o.status,o.survey_project_id,o.required_volunteers,o.required_skill,o.required_language,o.visibility,o.publication_state,o.applications_open,o.eligibility_note,o.created_at,org.name organization_name,p.title project_title,a.status application_status,i.status invitation_status,
   (o.required_skill='' or strpos(lower(coalesce(details->>'skills','')),lower(o.required_skill))>0) skill_match,
   (o.required_language='' or strpos(lower(coalesce(details->>'languages','')),lower(o.required_language))>0) language_match
  from public.work_opportunities o
  join public.organizations org on org.id=o.organization_id and org.status='active'
  join public.survey_projects p on p.id=o.survey_project_id and p.status='active'
  left join public.work_applications a on a.opportunity_id=o.id and a.user_id=auth.uid() and a.status in ('pending','shortlisted','selected')
  left join public.work_invitations i on i.opportunity_id=o.id and i.user_id=auth.uid() and i.status in ('pending','accepted')
  where app_private.work_opportunity_visible(o.id,auth.uid())
    and (p_organization is null or o.organization_id=p_organization)
    and (p_payment is null or o.payment_type=p_payment)
    and (p_work_date is null or p_work_date between o.start_date and o.end_date)
    and (p_deadline is null or (o.reply_by at time zone 'UTC')::date<=p_deadline)
    and (trim(p_skill)='' or strpos(lower(o.required_skill),lower(trim(p_skill)))>0 or strpos(lower(o.description),lower(trim(p_skill)))>0)
    and (p_area is null or exists(with recursive areas as (select id from public.geographies where id=p_area union all select g.id from public.geographies g join areas x on g.parent_id=x.id) select 1 from areas where id=o.geography_id))
 ), enriched as (
   select m.*,
    (m.application_status is null and m.invitation_status is null and m.skill_match and m.language_match) can_apply,
    case
      when m.application_status is not null then 'Application already submitted'
      when m.invitation_status is not null then 'Respond to the existing invitation'
      when not m.skill_match then 'Required skill is not listed on your profile'
      when not m.language_match then 'Required language is not listed on your profile'
      else ''
    end eligibility_reason
   from matched m
 ), batch as (select * from enriched order by start_date,created_at,id limit 50 offset p_page*50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(b) order by start_date,created_at,id) from batch b),'[]'::jsonb),'total',(select count(*) from enriched),'page',p_page,'page_size',50) into result;
 return result;
end;$$;

-- Applications carry explicit application-scoped consent. No permanent profile_shares grant is created.
drop function public.apply_work_opportunity(uuid,text);
create function public.apply_work_opportunity(p_opportunity uuid,p_availability text,p_note text,p_profile_share_consent boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.work_opportunities;p public.volunteer_profiles;existing public.work_applications;new_id uuid;snapshot jsonb;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into o from public.work_opportunities where id=p_opportunity for update;
 if not found or not app_private.work_opportunity_visible(o.id,auth.uid()) then raise exception 'Published recruitment with open applications required';end if;
 if not exists(select 1 from public.organizations where id=o.organization_id and status='active') or not exists(select 1 from public.survey_projects where id=o.survey_project_id and status='active') then raise exception 'Opportunity unavailable';end if;
 select * into p from public.volunteer_profiles where user_id=auth.uid();
 if not found or p.status<>'verified' then raise exception 'Publish an active volunteer profile before applying';end if;
 if o.visibility='invite_only' and exists(select 1 from public.work_invitations where opportunity_id=o.id and user_id=auth.uid() and status in ('pending','accepted')) then raise exception 'Respond to the existing invitation instead of applying';end if;
 if o.required_skill<>'' and strpos(lower(coalesce(p.details->>'skills','')),lower(o.required_skill))=0 then raise exception 'Required skill is not listed on your profile';end if;
 if o.required_language<>'' and strpos(lower(coalesce(p.details->>'languages','')),lower(o.required_language))=0 then raise exception 'Required language is not listed on your profile';end if;
 if p_availability is null or length(trim(p_availability)) not between 3 and 1000 then raise exception 'Availability is required';end if;
 if p_note is null or length(p_note)>2000 then raise exception 'Application message is too long';end if;
 if p_profile_share_consent is distinct from true then raise exception 'Profile-sharing consent is required for this application';end if;
 select * into existing from public.work_applications where opportunity_id=o.id and user_id=auth.uid() for update;
 if found and existing.status not in ('withdrawn','cancelled','rejected') then raise exception 'Application already exists for this opportunity';end if;
 snapshot:=app_private.recruitment_profile_snapshot(auth.uid());
 if snapshot is null then raise exception 'Volunteer profile unavailable';end if;
 if found then
  update public.work_applications
  set status='pending',note=trim(p_note),availability=trim(p_availability),profile_share_consent=true,
      consent_version='recruitment-profile-v1',profile_snapshot=snapshot,review_note='',reviewed_by=null,reviewed_at=null,
      withdrawn_at=null,updated_at=now(),version=version+1
  where id=existing.id returning id into new_id;
 else
  insert into public.work_applications(opportunity_id,organization_id,survey_project_id,user_id,volunteer_name,organization_name,project_title,opportunity_title,note,availability,profile_share_consent,consent_version,profile_snapshot)
  values(o.id,o.organization_id,o.survey_project_id,auth.uid(),coalesce(snapshot->>'full_name',''),(select name from public.organizations where id=o.organization_id),(select title from public.survey_projects where id=o.survey_project_id),o.title,trim(p_note),trim(p_availability),true,'recruitment-profile-v1',snapshot)
  returning id into new_id;
 end if;
 insert into public.notifications(user_id,title,body)
 select m.user_id,'New volunteer application','A volunteer applied for a published project opportunity. Open Workforce marketplace to review it.'
 from public.organization_memberships m join public.accounts a on a.id=m.user_id
 where m.organization_id=o.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active' and m.user_id<>auth.uid();
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),auth.uid(),o.organization_id,'work_application_submitted',jsonb_build_object('id',new_id,'opportunity',o.id,'project',o.survey_project_id,'consent_version','recruitment-profile-v1'));
 return new_id;
end;$$;

create or replace function public.withdraw_work_application(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.work_applications;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into a from public.work_applications where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Application not found';end if;
 if a.version is distinct from p_version or a.status not in ('pending','shortlisted') then raise exception 'Application changed or can no longer be withdrawn';end if;
 if exists(select 1 from public.work_assignments where source_application_id=a.id and status in ('offered','active')) then raise exception 'Respond to the assignment offer instead';end if;
 update public.work_applications set status='withdrawn',withdrawn_at=now(),updated_at=now(),version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),auth.uid(),a.organization_id,'work_application_withdrawn',jsonb_build_object('id',p_id));
end;$$;

create or replace function public.review_work_application(p_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.work_applications;o public.work_opportunities;p public.volunteer_profiles;
begin
 select * into a from public.work_applications where id=p_id for update;
 if not found or not app_private.can_review_survey(a.survey_project_id) then raise exception 'Project recruitment management permission required';end if;
 if a.version is distinct from p_version or a.status not in ('pending','shortlisted','selected') then raise exception 'Application changed. Reload.';end if;
 if exists(select 1 from public.work_assignments where source_application_id=a.id and status in ('offered','active','completed')) then raise exception 'Application is already attached to an assignment';end if;
 if p_status not in ('shortlisted','selected','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Decision and review note required';end if;
 if p_status='selected' then
  select * into o from public.work_opportunities where id=a.opportunity_id;
  select * into p from public.volunteer_profiles where user_id=a.user_id;
  if p.status is distinct from 'verified' then raise exception 'Published active volunteer profile required before selection';end if;
  if not exists(select 1 from public.accounts where id=a.user_id and status='active') then raise exception 'Active volunteer account required before selection';end if;
  if o.required_skill<>'' and strpos(lower(coalesce(p.details->>'skills','')),lower(o.required_skill))=0 then raise exception 'Volunteer no longer meets the required skill';end if;
  if o.required_language<>'' and strpos(lower(coalesce(p.details->>'languages','')),lower(o.required_language))=0 then raise exception 'Volunteer no longer meets the required language';end if;
  if o.visibility='area' and not app_private.profile_in_area(a.user_id,o.geography_id) then raise exception 'Volunteer location is outside the recruitment area';end if;
  if not app_private.project_recruitment_verification_ready(a.survey_project_id,a.user_id) then raise exception 'Current project independent verification requirements are not satisfied';end if;
 end if;
 update public.work_applications set status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),version=version+1 where id=p_id;
 insert into public.notifications(user_id,title,body)
 values(a.user_id,
   case p_status when 'shortlisted' then 'Application shortlisted' when 'selected' then 'Application selected' else 'Application decision' end,
   case p_status when 'shortlisted' then 'Your project application was shortlisted. No survey access has been granted yet.' when 'selected' then 'Your project application was selected for an assignment offer. Review the formal offer when it arrives.' else 'Your project application was not selected. Open My Applications for the review note.' end);
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),a.user_id,a.organization_id,'work_application_reviewed',jsonb_build_object('id',p_id,'status',p_status,'project',a.survey_project_id));
end;$$;

-- Formal assignment offers are managed by the NGO or POEM survey-management staff.
-- All-volunteer recruitment may legitimately select a volunteer from outside their home area;
-- selected-area recruitment and direct shortlist assignment retain area enforcement.
create or replace function public.create_work_assignment(
 p_project uuid,p_user uuid,p_source_kind text,p_source_id uuid,p_work_mode text,p_compensation_type text,
 p_currency text,p_rate numeric,p_target_surveys integer,p_start date,p_end date,p_terms_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;new_id uuid;opportunity uuid;app public.work_applications;inv public.work_invitations;o public.work_opportunities;existing_assignment public.work_assignments;
begin
 select * into p from public.survey_projects where id=p_project for update;
 if not found or not app_private.can_review_survey(p_project) then raise exception 'Project workforce management permission required';end if;
 if p.status<>'active' then raise exception 'Active project required';end if;
 if not exists(select 1 from public.accounts where id=p_user and status='active')
    or not exists(select 1 from public.volunteer_profiles where user_id=p_user and status='verified')
 then raise exception 'Published active volunteer profile required';end if;
 if not app_private.project_recruitment_verification_ready(p_project,p_user) then raise exception 'Current project independent verification requirements are not satisfied';end if;

 if p_source_kind='application' then
  select * into app from public.work_applications where id=p_source_id and user_id=p_user and survey_project_id=p_project and organization_id=p.organization_id and status='selected';
  if not found then raise exception 'Selected application source required';end if;
  opportunity:=app.opportunity_id;
  select * into o from public.work_opportunities where id=opportunity;
  if o.visibility='area' and not app_private.profile_in_area(p_user,o.geography_id) then raise exception 'Volunteer location is outside the recruitment area';end if;
 elsif p_source_kind='invitation' then
  select i.* into inv from public.work_invitations i join public.work_opportunities x on x.id=i.opportunity_id where i.id=p_source_id and i.user_id=p_user and i.organization_id=p.organization_id and i.status='accepted' and x.survey_project_id=p_project;
  if not found then raise exception 'Accepted invitation source required';end if;
  opportunity:=inv.opportunity_id;
  select * into o from public.work_opportunities where id=opportunity;
  if o.visibility='area' and not app_private.profile_in_area(p_user,o.geography_id) then raise exception 'Volunteer location is outside the recruitment area';end if;
 elsif p_source_kind='shortlist' then
  if p_source_id is not null
     or not exists(select 1 from public.volunteer_shortlists where organization_id=p.organization_id and user_id=p_user and status='selected')
     or not app_private.ngo_profile_access(p.organization_id,p_user)
  then raise exception 'Selected shared shortlist source required';end if;
  if not app_private.profile_in_area(p_user,p.geography_id) then raise exception 'Volunteer location is outside the survey project area';end if;
 else raise exception 'Valid workforce source required';end if;

 if p_work_mode not in ('volunteer','paid') or p_compensation_type not in ('none','per_verified_survey','daily_rate','fixed_assignment') then raise exception 'Valid work and compensation type required';end if;
 if (p_work_mode='volunteer' and (p_compensation_type<>'none' or p_rate is not null)) or (p_work_mode='paid' and (p_compensation_type='none' or p_rate is null or p_rate<=0)) then raise exception 'Compensation terms do not match work mode';end if;
 if p_currency is null or length(trim(p_currency))<>3 or upper(trim(p_currency))<>trim(p_currency) then raise exception 'Three-letter uppercase currency required';end if;
 if p_target_surveys is null or p_target_surveys not between 1 and 1000000 or p_start is null or p_end is null or p_start<p.start_date or p_end>p.end_date or p_end<p_start then raise exception 'Target and assignment dates must fit the project';end if;
 if p_terms_note is null or length(trim(p_terms_note)) not between 5 and 3000 then raise exception 'Assignment terms note required';end if;

 select * into existing_assignment
 from public.work_assignments
 where survey_project_id=p_project and user_id=p_user and status in ('offered','active','completed')
 order by created_at desc limit 1 for update;
 if found then
  if existing_assignment.source_kind=p_source_kind
     and existing_assignment.source_application_id is not distinct from (case when p_source_kind='application' then p_source_id end)
     and existing_assignment.source_invitation_id is not distinct from (case when p_source_kind='invitation' then p_source_id end)
     and existing_assignment.work_mode=p_work_mode
     and existing_assignment.compensation_type=p_compensation_type
     and existing_assignment.currency=upper(trim(p_currency))
     and existing_assignment.rate is not distinct from p_rate
     and existing_assignment.target_surveys=p_target_surveys
     and existing_assignment.start_date=p_start and existing_assignment.end_date=p_end
     and existing_assignment.terms_note=trim(p_terms_note)
  then return existing_assignment.id;end if;
  raise exception 'A current assignment already exists for this project and volunteer';
 end if;

 insert into public.work_assignments(survey_project_id,opportunity_id,organization_id,user_id,volunteer_name,organization_name,project_title,opportunity_title,source_kind,source_application_id,source_invitation_id,work_mode,compensation_type,currency,rate,target_surveys,start_date,end_date,terms_note,offered_by)
 values(p_project,opportunity,p.organization_id,p_user,(select full_name from public.accounts where id=p_user),(select name from public.organizations where id=p.organization_id),p.title,coalesce((select title from public.work_opportunities where id=opportunity),''),p_source_kind,case when p_source_kind='application' then p_source_id end,case when p_source_kind='invitation' then p_source_id end,p_work_mode,p_compensation_type,upper(trim(p_currency)),p_rate,p_target_surveys,p_start,p_end,trim(p_terms_note),auth.uid())
 returning id into new_id;
 insert into public.notifications(user_id,title,body) values(p_user,'Project assignment offer','Open My Assigned Surveys to review and accept the assignment terms.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),p_user,p.organization_id,'work_assignment_offered',jsonb_build_object('id',new_id,'project',p_project,'source',p_source_kind,'work_mode',p_work_mode,'compensation_type',p_compensation_type,'rate',p_rate,'target',p_target_surveys,'start',p_start,'end',p_end));
 return new_id;
end;$$;

-- Acceptance is retry-safe and rechecks profile, geography (where applicable) and current governance.
create or replace function public.respond_work_assignment(p_id uuid,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare w public.work_assignments;p public.survey_projects;o public.work_opportunities;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into w from public.work_assignments where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Assignment offer not found';end if;
 if p_status not in ('accepted','declined') then raise exception 'Accept or decline required';end if;
 if (p_status='accepted' and w.status='active') or (p_status='declined' and w.status='declined') then return;end if;
 if w.version is distinct from p_version or w.status<>'offered' then raise exception 'Assignment changed. Reload.';end if;
 select * into p from public.survey_projects where id=w.survey_project_id;
 if p_status='accepted' then
  if p.status<>'active' or not exists(select 1 from public.organizations where id=w.organization_id and status='active') or w.end_date<(now() at time zone 'UTC')::date then raise exception 'Assignment is no longer available';end if;
  if not exists(select 1 from public.volunteer_profiles where user_id=w.user_id and status='verified') then raise exception 'Published active volunteer profile required before survey access activation';end if;
  if not app_private.project_recruitment_verification_ready(w.survey_project_id,w.user_id) then raise exception 'Current project independent verification requirements are not satisfied';end if;
  if w.source_kind='shortlist' and not app_private.profile_in_area(w.user_id,p.geography_id) then raise exception 'Volunteer location is outside the survey project area';end if;
  if w.opportunity_id is not null then
   select * into o from public.work_opportunities where id=w.opportunity_id;
   if o.visibility='area' and not app_private.profile_in_area(w.user_id,o.geography_id) then raise exception 'Volunteer location is outside the recruitment area';end if;
  end if;
  update public.work_assignments set status='active',responded_at=now(),version=version+1 where id=p_id;
  insert into public.survey_assignments(project_id,user_id,active) values(w.survey_project_id,w.user_id,true)
  on conflict(project_id,user_id) do update set active=true;
 else
  update public.work_assignments set status='declined',responded_at=now(),version=version+1 where id=p_id;
 end if;
 insert into public.notifications(user_id,title,body)
 select m.user_id,'Assignment response','A volunteer responded to a project assignment offer.'
 from public.organization_memberships m join public.accounts a on a.id=m.user_id
 where m.organization_id=w.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),auth.uid(),w.organization_id,'work_assignment_responded',jsonb_build_object('id',p_id,'response',p_status,'project',w.survey_project_id));
end;$$;

-- Existing direct survey assignment remains available, but current independent verification policy
-- is now enforced before activation. Full-profile sharing remains required for this direct path.
create or replace function public.set_survey_assignment(p_project uuid,p_user uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;
begin
 if not app_private.can_review_survey(p_project) then raise exception 'Project management permission required';end if;
 select * into p from public.survey_projects where id=p_project for update;
 if not found or p_active is null then raise exception 'Project and assignment decision required';end if;
 if p_active and p.status<>'active' then raise exception 'Active project required for assignment';end if;
 if p_active and not exists(
   select 1 from public.accounts a
   join public.volunteer_profiles v on v.user_id=a.id
   where a.id=p_user and a.status='active' and v.status='verified'
     and exists(select 1 from public.profile_shares s where s.user_id=a.id and s.organization_id=p.organization_id)
 ) then raise exception 'Assign a published active volunteer sharing with the project NGO';end if;
 if p_active and not app_private.project_recruitment_verification_ready(p_project,p_user) then raise exception 'Current project independent verification requirements are not satisfied';end if;
 insert into public.survey_assignments(project_id,user_id,active) values(p_project,p_user,p_active)
 on conflict(project_id,user_id) do update set active=excluded.active;
 insert into public.notifications(user_id,title,body) values(p_user,'Survey assignment updated','Open My Assigned Surveys to see your assigned field work.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),p_user,p.organization_id,'survey_assignment_changed',jsonb_build_object('project',p_project,'active',p_active));
end;$$;

revoke all on function app_private.profile_in_area(uuid,uuid),app_private.project_recruitment_verification_ready(uuid,uuid),app_private.work_opportunity_visible(uuid,uuid),app_private.recruitment_profile_snapshot(uuid) from public,anon,authenticated;

revoke all on function public.create_recruitment_opportunity(uuid,text,text,uuid,date,date,timestamptz,text,text,integer,text,text,text,text,boolean),public.set_work_opportunity_state(uuid,text,integer),public.available_work_opportunities(integer,uuid,uuid,text,text,date,date),public.apply_work_opportunity(uuid,text,text,boolean),public.withdraw_work_application(uuid,integer),public.review_work_application(uuid,text,text,integer),public.create_work_assignment(uuid,uuid,text,uuid,text,text,text,numeric,integer,date,date,text),public.respond_work_assignment(uuid,text,integer),public.set_survey_assignment(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_recruitment_opportunity(uuid,text,text,uuid,date,date,timestamptz,text,text,integer,text,text,text,text,boolean),public.set_work_opportunity_state(uuid,text,integer),public.available_work_opportunities(integer,uuid,uuid,text,text,date,date),public.apply_work_opportunity(uuid,text,text,boolean),public.withdraw_work_application(uuid,integer),public.review_work_application(uuid,text,text,integer),public.create_work_assignment(uuid,uuid,text,uuid,text,text,text,numeric,integer,date,date,text),public.respond_work_assignment(uuid,text,integer),public.set_survey_assignment(uuid,uuid,boolean) to authenticated;
