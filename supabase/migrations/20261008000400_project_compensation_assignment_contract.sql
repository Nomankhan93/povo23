-- POEM 2.16.1 — Project Compensation Defaults & Assignment Contract Integration
-- Structured project defaults are snapshotted into recruitment opportunities and immutable
-- work-assignment contracts. Existing payable generation remains the accounting source of truth.

alter table public.survey_projects
  add column work_mode text not null default 'volunteer' check(work_mode in ('volunteer','paid')),
  add column compensation_type text not null default 'none' check(compensation_type in ('none','per_verified_survey','daily_rate','fixed_assignment')),
  add column compensation_currency text not null default 'PKR' check(length(compensation_currency)=3 and upper(compensation_currency)=compensation_currency),
  add column compensation_rate numeric(14,2),
  add column compensation_note text not null default 'Volunteer / unpaid project' check(length(compensation_note)<=1000),
  add column compensation_version integer not null default 1,
  add constraint survey_project_compensation_terms_valid check(
    (work_mode='volunteer' and compensation_type='none' and compensation_rate is null)
    or
    (work_mode='paid' and compensation_type in ('per_verified_survey','daily_rate','fixed_assignment') and compensation_rate is not null and compensation_rate>0 and compensation_rate::text not in ('NaN','Infinity','-Infinity'))
  );

-- Opportunity compensation columns are nullable for historical paid opportunities because the
-- legacy payment_note cannot be safely parsed into a rate/basis. Every new project opportunity
-- created through the guarded RPC receives a complete structured snapshot.
alter table public.work_opportunities
  add column work_mode text check(work_mode in ('volunteer','paid')),
  add column compensation_type text check(compensation_type in ('none','per_verified_survey','daily_rate','fixed_assignment')),
  add column currency text check(currency is null or (length(currency)=3 and upper(currency)=currency)),
  add column rate numeric(14,2),
  add column compensation_note text,
  add column compensation_snapshot_version integer,
  add constraint work_opportunity_compensation_snapshot_valid check(
    compensation_snapshot_version is null
    or (
      work_mode is not null and compensation_type is not null and currency is not null and compensation_note is not null
      and (
        (work_mode='volunteer' and compensation_type='none' and rate is null)
        or
        (work_mode='paid' and compensation_type in ('per_verified_survey','daily_rate','fixed_assignment') and rate is not null and rate>0 and rate::text not in ('NaN','Infinity','-Infinity'))
      )
    )
  );

-- Historical unpaid project opportunities have unambiguous compensation semantics and can be
-- safely upgraded. Historical paid opportunities remain legacy/null and must be replaced before
-- creating a new structured assignment from them.
update public.work_opportunities
set work_mode='volunteer',
    compensation_type='none',
    currency='PKR',
    rate=null,
    compensation_note=coalesce(payment_note,''),
    compensation_snapshot_version=1
where survey_project_id is not null and payment_type='unpaid' and compensation_snapshot_version is null;

alter table public.work_assignments
  add column compensation_source text not null default 'legacy_offer' check(compensation_source in ('legacy_offer','project_default','opportunity_snapshot')),
  add column compensation_source_version integer,
  add column compensation_note_snapshot text not null default '' check(length(compensation_note_snapshot)<=1000);

create function app_private.valid_compensation_terms(p_mode text,p_type text,p_currency text,p_rate numeric)
returns boolean language sql immutable set search_path='' as $$
  select
    p_mode in ('volunteer','paid')
    and p_type in ('none','per_verified_survey','daily_rate','fixed_assignment')
    and p_currency is not null and length(p_currency)=3 and upper(p_currency)=p_currency
    and (
      (p_mode='volunteer' and p_type='none' and p_rate is null)
      or
      (p_mode='paid' and p_type in ('per_verified_survey','daily_rate','fixed_assignment')
        and p_rate is not null and p_rate>0 and p_rate::text not in ('NaN','Infinity','-Infinity') and round(p_rate,2)=p_rate)
    );
$$;

create function public.project_compensation_status(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.survey_projects;
begin
  if not app_private.can_manage_project(p_project) then raise exception 'Project management permission required';end if;
  select * into p from public.survey_projects where id=p_project;
  if not found then raise exception 'Survey project not found';end if;
  return jsonb_build_object(
    'project_id',p.id,
    'work_mode',p.work_mode,
    'compensation_type',p.compensation_type,
    'currency',p.compensation_currency,
    'rate',p.compensation_rate,
    'note',p.compensation_note,
    'version',p.compensation_version,
    'can_change',app_private.can_manage_project_team(p.id)
  );
end;$$;

create function public.set_project_compensation_defaults(
  p_project uuid,p_work_mode text,p_compensation_type text,p_currency text,p_rate numeric,p_note text,p_reason text,p_version integer
) returns integer language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;next_version integer;note text:=trim(coalesce(p_note,''));reason text:=trim(coalesce(p_reason,''));currency text:=upper(trim(coalesce(p_currency,'')));
begin
  if not app_private.can_manage_project_team(p_project) then raise exception 'NGO Admin or POEM survey-management permission required';end if;
  select * into p from public.survey_projects where id=p_project for update;
  if not found then raise exception 'Survey project not found';end if;
  if p.status<>'active' then raise exception 'Active project required';end if;
  if p.compensation_version is distinct from p_version then raise exception 'Compensation defaults changed. Reload';end if;
  if not app_private.valid_compensation_terms(p_work_mode,p_compensation_type,currency,p_rate) then raise exception 'Valid project compensation terms required';end if;
  if length(note) not between 3 and 1000 then raise exception 'Compensation note is required';end if;
  if length(reason) not between 3 and 1000 then raise exception 'Reason is required';end if;

  update public.survey_projects
  set work_mode=p_work_mode,
      compensation_type=p_compensation_type,
      compensation_currency=currency,
      compensation_rate=p_rate,
      compensation_note=note,
      compensation_version=compensation_version+1
  where id=p.id
  returning compensation_version into next_version;

  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),p.organization_id,'project_compensation_defaults_changed',jsonb_build_object(
    'project',p.id,
    'previous_work_mode',p.work_mode,
    'work_mode',p_work_mode,
    'previous_compensation_type',p.compensation_type,
    'compensation_type',p_compensation_type,
    'previous_currency',p.compensation_currency,
    'currency',currency,
    'previous_rate',p.compensation_rate,
    'rate',p_rate,
    'previous_note',p.compensation_note,
    'note',note,
    'reason',reason,
    'previous_version',p_version,
    'version',next_version
  ));
  return next_version;
end;$$;

-- Keep the older NGO project-opportunity RPC safe as well. It is retained for compatibility,
-- but its legacy payment arguments can no longer bypass the project compensation defaults.
create or replace function public.create_project_opportunity(
  p_project uuid,p_title text,p_description text,p_geography uuid,p_start date,p_end date,
  p_reply_by timestamptz,p_payment text,p_payment_note text,p_required_volunteers integer,
  p_required_skill text,p_required_language text
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;new_id uuid;legacy_payment text;display_note text;
begin
 select * into p from public.survey_projects where id=p_project for update;
 if not found or not app_private.ngo_admin(p.organization_id) then raise exception 'Active NGO Admin for this project required';end if;
 if p.status<>'active' then raise exception 'Active survey project required';end if;
 if not app_private.valid_compensation_terms(p.work_mode,p.compensation_type,p.compensation_currency,p.compensation_rate) then raise exception 'Configure valid project compensation defaults before recruiting';end if;
 if p_title is null or length(trim(p_title)) not between 3 and 150 or p_description is null or length(trim(p_description)) not between 10 and 4000 then raise exception 'Valid title and expected tasks required';end if;
 if p_start is null or p_end is null or p_start<p.start_date or p_end>p.end_date or p_end<p_start then raise exception 'Opportunity dates must stay within project dates';end if;
 if p_reply_by is null or p_reply_by<=now() or p_reply_by>((p_start+1)::timestamp at time zone 'UTC') then raise exception 'Valid reply deadline required';end if;
 if p_required_volunteers is null or p_required_volunteers not between 1 and 5000 or p_required_skill is null or length(p_required_skill)>100 or p_required_language is null or length(p_required_language)>100 then raise exception 'Valid positions and optional criteria required';end if;
 if not app_private.geo_active(p_geography) then raise exception 'Active geography required';end if;
 if not exists(with recursive areas as (select id from public.geographies where id=p.geography_id union all select g.id from public.geographies g join areas a on g.parent_id=a.id) select 1 from areas where id=p_geography) then raise exception 'Recruitment area must be within the survey project area';end if;
 legacy_payment:=case when p.work_mode='paid' then 'paid' else 'unpaid' end;
 display_note:=case when p.work_mode='paid' then p.compensation_currency||' '||p.compensation_rate::text||' · '||replace(p.compensation_type,'_',' ')||' — '||p.compensation_note else p.compensation_note end;
 insert into public.work_opportunities(
   organization_id,title,description,geography_id,start_date,end_date,reply_by,payment_type,payment_note,created_by,
   survey_project_id,required_volunteers,required_skill,required_language,
   work_mode,compensation_type,currency,rate,compensation_note,compensation_snapshot_version
 ) values(
   p.organization_id,trim(p_title),trim(p_description),p_geography,p_start,p_end,p_reply_by,legacy_payment,display_note,auth.uid(),
   p_project,p_required_volunteers,trim(p_required_skill),trim(p_required_language),
   p.work_mode,p.compensation_type,p.compensation_currency,p.compensation_rate,p.compensation_note,p.compensation_version
 ) returning id into new_id;
 insert into public.audit_events(actor_id,organization_id,action,detail)
 values(auth.uid(),p.organization_id,'project_opportunity_created',jsonb_build_object('id',new_id,'project',p_project,'positions',p_required_volunteers,'compensation_snapshot_version',p.compensation_version));
 return new_id;
end;$$;

-- Existing RPC signature is retained for old clients, but project compensation values are now
-- authoritative. p_payment/p_payment_note remain compatibility inputs and cannot override them.
create or replace function public.create_recruitment_opportunity(
  p_project uuid,p_title text,p_description text,p_geography uuid,p_start date,p_end date,
  p_reply_by timestamptz,p_payment text,p_payment_note text,p_required_volunteers integer,
  p_required_skill text,p_required_language text,p_visibility text,p_eligibility_note text,p_publish boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;new_id uuid;legacy_payment text;display_note text;
begin
 select * into p from public.survey_projects where id=p_project for update;
 if not found or not app_private.can_review_survey(p_project) then raise exception 'Project recruitment management permission required';end if;
 if p.status<>'active' then raise exception 'Active survey project required';end if;
 if not app_private.valid_compensation_terms(p.work_mode,p.compensation_type,p.compensation_currency,p.compensation_rate) then raise exception 'Configure valid project compensation defaults before recruiting';end if;
 if p_title is null or length(trim(p_title)) not between 3 and 150 or p_description is null or length(trim(p_description)) not between 10 and 4000 then raise exception 'Valid title and expected tasks required';end if;
 if p_start is null or p_end is null or p_start<p.start_date or p_end>p.end_date or p_end<p_start then raise exception 'Opportunity dates must stay within project dates';end if;
 if p_reply_by is null or p_reply_by<=now() or p_reply_by>((p_start+1)::timestamp at time zone 'UTC') then raise exception 'Valid application deadline required';end if;
 if p_required_volunteers is null or p_required_volunteers not between 1 and 5000 or p_required_skill is null or length(p_required_skill)>100 or p_required_language is null or length(p_required_language)>100 then raise exception 'Valid positions and optional criteria required';end if;
 if p_visibility not in ('all','area','invite_only') then raise exception 'Valid recruitment visibility required';end if;
 if p_eligibility_note is null or length(p_eligibility_note)>1000 then raise exception 'Eligibility note is too long';end if;
 if p_publish is null then raise exception 'Publication decision required';end if;
 if not app_private.geo_active(p_geography) then raise exception 'Active geography required';end if;
 if not exists(with recursive areas as (select id from public.geographies where id=p.geography_id union all select g.id from public.geographies g join areas a on g.parent_id=a.id) select 1 from areas where id=p_geography) then raise exception 'Recruitment work area must be within the survey project area';end if;

 legacy_payment:=case when p.work_mode='paid' then 'paid' else 'unpaid' end;
 display_note:=case when p.work_mode='paid'
   then p.compensation_currency||' '||p.compensation_rate::text||' · '||replace(p.compensation_type,'_',' ')||' — '||p.compensation_note
   else p.compensation_note
 end;

 insert into public.work_opportunities(
   organization_id,title,description,geography_id,start_date,end_date,reply_by,payment_type,payment_note,created_by,
   survey_project_id,required_volunteers,required_skill,required_language,visibility,eligibility_note,publication_state,applications_open,published_at,
   work_mode,compensation_type,currency,rate,compensation_note,compensation_snapshot_version
 ) values(
   p.organization_id,trim(p_title),trim(p_description),p_geography,p_start,p_end,p_reply_by,legacy_payment,display_note,auth.uid(),
   p_project,p_required_volunteers,trim(p_required_skill),trim(p_required_language),p_visibility,trim(p_eligibility_note),
   case when p_publish then 'published' else 'draft' end,p_publish,case when p_publish then now() else null end,
   p.work_mode,p.compensation_type,p.compensation_currency,p.compensation_rate,p.compensation_note,p.compensation_version
 ) returning id into new_id;
 insert into public.audit_events(actor_id,organization_id,action,detail)
 values(auth.uid(),p.organization_id,'recruitment_opportunity_created',jsonb_build_object(
   'id',new_id,'project',p_project,'positions',p_required_volunteers,'visibility',p_visibility,'published',p_publish,
   'work_mode',p.work_mode,'compensation_type',p.compensation_type,'currency',p.compensation_currency,'rate',p.compensation_rate,
   'compensation_snapshot_version',p.compensation_version
 ));
 return new_id;
end;$$;

-- Volunteer discovery now exposes the structured opportunity compensation snapshot. The legacy
-- paid/unpaid filter remains compatible through payment_type.
create or replace function public.available_work_opportunities(
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
  select o.id,o.organization_id,o.title,o.description,o.geography_id,o.start_date,o.end_date,o.reply_by,o.payment_type,o.payment_note,o.status,o.survey_project_id,o.required_volunteers,o.required_skill,o.required_language,o.visibility,o.publication_state,o.applications_open,o.eligibility_note,o.created_at,
   o.work_mode,o.compensation_type,o.currency,o.rate,o.compensation_note,o.compensation_snapshot_version,
   org.name organization_name,p.title project_title,a.status application_status,i.status invitation_status,
   (o.required_skill='' or strpos(lower(coalesce(details->>'skills','')),lower(o.required_skill))>0) skill_match,
   (o.required_language='' or strpos(lower(coalesce(details->>'languages','')),lower(o.required_language))>0) language_match,
   app_private.profile_in_area(auth.uid(),o.geography_id) area_match
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

-- Formal offer terms are no longer caller-selected. An application/invitation inherits the
-- immutable opportunity snapshot; a direct selected-shortlist offer inherits the project's current
-- defaults. The assignment row itself remains immutable under protect_work_terms().
create or replace function public.create_work_assignment(
 p_project uuid,p_user uuid,p_source_kind text,p_source_id uuid,p_work_mode text,p_compensation_type text,
 p_currency text,p_rate numeric,p_target_surveys integer,p_start date,p_end date,p_terms_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 p public.survey_projects;new_id uuid;opportunity uuid;app public.work_applications;inv public.work_invitations;o public.work_opportunities;existing_assignment public.work_assignments;
 snapshot_mode text;snapshot_type text;snapshot_currency text;snapshot_rate numeric;snapshot_note text;snapshot_version integer;snapshot_source text;
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

 if opportunity is not null then
  if o.compensation_snapshot_version is null then
    if o.payment_type='paid' then raise exception 'Legacy paid opportunity requires replacement under structured compensation terms';end if;
    snapshot_mode:='volunteer';snapshot_type:='none';snapshot_currency:='PKR';snapshot_rate:=null;snapshot_note:=coalesce(o.payment_note,'Volunteer / unpaid');snapshot_version:=1;
  else
    snapshot_mode:=o.work_mode;snapshot_type:=o.compensation_type;snapshot_currency:=o.currency;snapshot_rate:=o.rate;snapshot_note:=o.compensation_note;snapshot_version:=o.compensation_snapshot_version;
  end if;
  snapshot_source:='opportunity_snapshot';
 else
  snapshot_mode:=p.work_mode;snapshot_type:=p.compensation_type;snapshot_currency:=p.compensation_currency;snapshot_rate:=p.compensation_rate;snapshot_note:=p.compensation_note;snapshot_version:=p.compensation_version;snapshot_source:='project_default';
 end if;

 if not app_private.valid_compensation_terms(snapshot_mode,snapshot_type,snapshot_currency,snapshot_rate) then raise exception 'Valid structured compensation snapshot required';end if;
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
     and existing_assignment.work_mode=snapshot_mode
     and existing_assignment.compensation_type=snapshot_type
     and existing_assignment.currency=snapshot_currency
     and existing_assignment.rate is not distinct from snapshot_rate
     and existing_assignment.compensation_source=snapshot_source
     and existing_assignment.compensation_source_version is not distinct from snapshot_version
     and existing_assignment.compensation_note_snapshot=coalesce(snapshot_note,'')
     and existing_assignment.target_surveys=p_target_surveys
     and existing_assignment.start_date=p_start and existing_assignment.end_date=p_end
     and existing_assignment.terms_note=trim(p_terms_note)
  then return existing_assignment.id;end if;
  raise exception 'A current assignment already exists for this project and volunteer';
 end if;

 insert into public.work_assignments(
   survey_project_id,opportunity_id,organization_id,user_id,volunteer_name,organization_name,project_title,opportunity_title,
   source_kind,source_application_id,source_invitation_id,work_mode,compensation_type,currency,rate,target_surveys,start_date,end_date,terms_note,offered_by,
   compensation_source,compensation_source_version,compensation_note_snapshot
 ) values(
   p_project,opportunity,p.organization_id,p_user,(select full_name from public.accounts where id=p_user),(select name from public.organizations where id=p.organization_id),p.title,coalesce((select title from public.work_opportunities where id=opportunity),''),
   p_source_kind,case when p_source_kind='application' then p_source_id end,case when p_source_kind='invitation' then p_source_id end,
   snapshot_mode,snapshot_type,snapshot_currency,snapshot_rate,p_target_surveys,p_start,p_end,trim(p_terms_note),auth.uid(),
   snapshot_source,snapshot_version,coalesce(snapshot_note,'')
 ) returning id into new_id;
 insert into public.notifications(user_id,title,body) values(p_user,'Project assignment offer','Open My Assigned Surveys to review and accept the assignment terms. Compensation terms are frozen in this offer.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),p_user,p.organization_id,'work_assignment_offered',jsonb_build_object(
   'id',new_id,'project',p_project,'source',p_source_kind,'work_mode',snapshot_mode,'compensation_type',snapshot_type,
   'currency',snapshot_currency,'rate',snapshot_rate,'compensation_source',snapshot_source,'compensation_source_version',snapshot_version,
   'target',p_target_surveys,'start',p_start,'end',p_end
 ));
 return new_id;
end;$$;

-- Payable snapshots now carry the provenance of the immutable compensation contract while the
-- existing response-id uniqueness and payable trigger continue to guarantee at-most-once units.
create or replace function app_private.payable_snapshot(w public.work_assignments)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object(
   'assignment_id',w.id,'organization_id',w.organization_id,'user_id',w.user_id,'project_id',w.survey_project_id,
   'rate',w.rate,'currency',w.currency,'compensation_type',w.compensation_type,'work_mode',w.work_mode,
   'compensation_source',w.compensation_source,'compensation_source_version',w.compensation_source_version,
   'compensation_note_snapshot',w.compensation_note_snapshot,
   'start_date',w.start_date,'end_date',w.end_date,'terms_note',w.terms_note,'accepted_at',w.responded_at
 );
$$;

revoke all on function app_private.valid_compensation_terms(text,text,text,numeric) from public,anon,authenticated;
revoke all on function public.project_compensation_status(uuid),public.set_project_compensation_defaults(uuid,text,text,text,numeric,text,text,integer) from public,anon,authenticated;
grant execute on function public.project_compensation_status(uuid),public.set_project_compensation_defaults(uuid,text,text,text,numeric,text,text,integer) to authenticated;
