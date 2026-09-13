-- POEM 2.7.0 — Volunteer Marketplace & Project Assignment Foundation
-- Additive workforce operations layered on existing opportunities/invitations/shortlists.

alter table public.work_opportunities
  add column survey_project_id uuid references public.survey_projects(id),
  add column required_volunteers integer not null default 1 check(required_volunteers between 1 and 5000),
  add column required_skill text not null default '' check(length(required_skill)<=100),
  add column required_language text not null default '' check(length(required_language)<=100);
create index work_opportunities_project on public.work_opportunities(survey_project_id,created_at desc);

create table public.work_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.work_opportunities(id),
  organization_id uuid not null references public.organizations(id),
  survey_project_id uuid not null references public.survey_projects(id),
  user_id uuid not null references public.accounts(id),
  volunteer_name text not null,
  organization_name text not null,
  project_title text not null,
  opportunity_title text not null,
  note text not null default '' check(length(note)<=2000),
  status text not null default 'pending' check(status in ('pending','shortlisted','selected','rejected','withdrawn','cancelled')),
  review_note text not null default '' check(length(review_note)<=2000),
  reviewed_by uuid references public.accounts(id),
  reviewed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id,user_id)
);
create index work_applications_org on public.work_applications(organization_id,status,created_at desc);
create index work_applications_user on public.work_applications(user_id,created_at desc);

create table public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_project_id uuid not null references public.survey_projects(id),
  opportunity_id uuid references public.work_opportunities(id),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.accounts(id),
  volunteer_name text not null,
  organization_name text not null,
  project_title text not null,
  opportunity_title text not null default '',
  source_kind text not null check(source_kind in ('application','invitation','shortlist')),
  source_application_id uuid references public.work_applications(id),
  source_invitation_id uuid references public.work_invitations(id),
  work_mode text not null check(work_mode in ('volunteer','paid')),
  compensation_type text not null check(compensation_type in ('none','per_verified_survey','daily_rate','fixed_assignment')),
  currency text not null default 'PKR' check(length(currency)=3),
  rate numeric(14,2),
  target_surveys integer not null check(target_surveys between 1 and 1000000),
  start_date date not null,
  end_date date not null,
  terms_note text not null default '' check(length(terms_note)<=3000),
  status text not null default 'offered' check(status in ('offered','active','completed','cancelled','declined')),
  version integer not null default 1,
  offered_by uuid not null references public.accounts(id),
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.accounts(id),
  completion_feedback jsonb not null default '{}'::jsonb,
  completion_note text not null default '' check(length(completion_note)<=3000),
  cancelled_at timestamptz,
  cancelled_by uuid references public.accounts(id),
  cancellation_note text not null default '' check(length(cancellation_note)<=2000),
  created_at timestamptz not null default now(),
  check(end_date>=start_date),
  check((source_kind='application' and source_application_id is not null and source_invitation_id is null)
     or (source_kind='invitation' and source_invitation_id is not null and source_application_id is null)
     or (source_kind='shortlist' and source_application_id is null and source_invitation_id is null)),
  check((work_mode='volunteer' and compensation_type='none' and rate is null)
     or (work_mode='paid' and compensation_type<>'none' and rate is not null and rate>0))
);
create index work_assignments_org on public.work_assignments(organization_id,status,created_at desc);
create index work_assignments_user on public.work_assignments(user_id,status,created_at desc);
create index work_assignments_project on public.work_assignments(survey_project_id,status);
create unique index work_assignments_current_unique on public.work_assignments(survey_project_id,user_id) where status in ('offered','active','completed');

alter table public.work_applications enable row level security;
alter table public.work_assignments enable row level security;
create policy work_application_read on public.work_applications for select to authenticated using(
  app_private.is_active() and (user_id=auth.uid() or app_private.ngo_admin(organization_id) or app_private.can_manage_surveys())
);
create policy work_assignment_read on public.work_assignments for select to authenticated using(
  app_private.is_active() and (user_id=auth.uid() or app_private.ngo_admin(organization_id) or app_private.can_manage_surveys())
);

create function public.create_project_opportunity(
  p_project uuid,p_title text,p_description text,p_geography uuid,p_start date,p_end date,
  p_reply_by timestamptz,p_payment text,p_payment_note text,p_required_volunteers integer,
  p_required_skill text,p_required_language text
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;new_id uuid;
begin
 select * into p from public.survey_projects where id=p_project for update;
 if not found or not app_private.ngo_admin(p.organization_id) then raise exception 'Active NGO Admin for this project required';end if;
 if p.status<>'active' then raise exception 'Active survey project required';end if;
 if p_title is null or length(trim(p_title)) not between 3 and 150 or p_description is null or length(trim(p_description)) not between 10 and 4000 then raise exception 'Valid title and expected tasks required';end if;
 if p_start is null or p_end is null or p_start<p.start_date or p_end>p.end_date or p_end<p_start then raise exception 'Opportunity dates must stay within project dates';end if;
 if p_reply_by is null or p_reply_by<=now() or p_reply_by>((p_start+1)::timestamp at time zone 'UTC') then raise exception 'Valid reply deadline required';end if;
 if p_payment not in ('paid','unpaid') or p_payment_note is null or length(p_payment_note)>1000 then raise exception 'Valid work mode required';end if;
 if p_payment='paid' and length(trim(p_payment_note))<3 then raise exception 'Describe proposed paid terms';end if;
 if p_required_volunteers is null or p_required_volunteers not between 1 and 5000 or p_required_skill is null or length(p_required_skill)>100 or p_required_language is null or length(p_required_language)>100 then raise exception 'Valid positions and optional criteria required';end if;
 if not app_private.geo_active(p_geography) then raise exception 'Active geography required';end if;
 if not exists(with recursive areas as (select id from public.geographies where id=p.geography_id union all select g.id from public.geographies g join areas a on g.parent_id=a.id) select 1 from areas where id=p_geography) then raise exception 'Recruitment area must be within the survey project area';end if;
 insert into public.work_opportunities(organization_id,title,description,geography_id,start_date,end_date,reply_by,payment_type,payment_note,created_by,survey_project_id,required_volunteers,required_skill,required_language)
 values(p.organization_id,trim(p_title),trim(p_description),p_geography,p_start,p_end,p_reply_by,p_payment,trim(p_payment_note),auth.uid(),p_project,p_required_volunteers,trim(p_required_skill),trim(p_required_language)) returning id into new_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p.organization_id,'project_opportunity_created',jsonb_build_object('id',new_id,'project',p_project,'positions',p_required_volunteers));
 return new_id;
end;$$;

create or replace function public.send_work_invitation(p_opportunity uuid,p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.work_opportunities;new_id uuid;v public.volunteer_profiles;
begin
 select * into o from public.work_opportunities where id=p_opportunity for update;
 if not found or not app_private.ngo_profile_access(o.organization_id,p_user) then raise exception 'Active NGO membership and profile grant required';end if;
 if p_user=auth.uid() then raise exception 'Cannot invite yourself';end if;
 if o.status<>'open' or o.reply_by<=now() or not app_private.geo_active(o.geography_id) then raise exception 'Opportunity closed, expired or area inactive';end if;
 if not exists(select 1 from public.volunteer_shortlists where organization_id=o.organization_id and user_id=p_user and status in ('shortlisted','considering','selected')) then raise exception 'Shortlist the volunteer first';end if;
 if o.survey_project_id is not null then
  if not exists(select 1 from public.survey_projects where id=o.survey_project_id and organization_id=o.organization_id and status='active') then raise exception 'Survey project is not active';end if;
  select * into v from public.volunteer_profiles where user_id=p_user;
  if v.status<>'verified' or v.geography_id is null then raise exception 'Verified local volunteer required';end if;
  if not exists(with recursive areas as (select id from public.geographies where id=o.geography_id union all select g.id from public.geographies g join areas x on g.parent_id=x.id) select 1 from areas where id=v.geography_id) then raise exception 'Volunteer location is outside the opportunity area';end if;
  if o.required_skill<>'' and strpos(lower(coalesce(v.details->>'skills','')),lower(o.required_skill))=0 then raise exception 'Volunteer profile does not list the required skill';end if;
  if o.required_language<>'' and strpos(lower(coalesce(v.details->>'languages','')),lower(o.required_language))=0 then raise exception 'Volunteer profile does not list the required language';end if;
 end if;
 insert into public.work_invitations(opportunity_id,organization_id,user_id,created_by,volunteer_name) values(o.id,o.organization_id,p_user,auth.uid(),(select full_name from public.accounts where id=p_user)) on conflict(opportunity_id,user_id) do nothing returning id into new_id;
 if new_id is null then raise exception 'This volunteer already has an invitation for this opportunity';end if;
 insert into public.notifications(user_id,title,body) values(p_user,'New NGO invitation','Open Invitations to review the opportunity and respond.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,o.organization_id,'invitation_sent',jsonb_build_object('id',new_id,'opportunity',o.id,'project',o.survey_project_id));return new_id;
end;$$;

create function public.available_work_opportunities(p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;subject_geo uuid;details jsonb;profile_status text;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page';end if;
 select geography_id,v.details,v.status into subject_geo,details,profile_status from public.volunteer_profiles v where v.user_id=auth.uid();
 if profile_status is distinct from 'verified' or subject_geo is null then return jsonb_build_object('rows','[]'::jsonb,'total',0,'page',p_page,'page_size',50);end if;
 with matched as materialized (
  select o.id,o.organization_id,o.title,o.description,o.geography_id,o.start_date,o.end_date,o.reply_by,o.payment_type,o.payment_note,o.status,o.survey_project_id,o.required_volunteers,o.required_skill,o.required_language,o.created_at,org.name organization_name,p.title project_title,a.status application_status,i.status invitation_status
  from public.work_opportunities o
  join public.organizations org on org.id=o.organization_id and org.status='active'
  join public.survey_projects p on p.id=o.survey_project_id and p.status='active'
  left join public.work_applications a on a.opportunity_id=o.id and a.user_id=auth.uid()
  left join public.work_invitations i on i.opportunity_id=o.id and i.user_id=auth.uid()
  where o.status='open' and o.reply_by>now()
  and exists(select 1 from public.profile_shares s where s.organization_id=o.organization_id and s.user_id=auth.uid())
  and exists(with recursive areas as (select id from public.geographies where id=o.geography_id union all select g.id from public.geographies g join areas x on g.parent_id=x.id) select 1 from areas where id=subject_geo)
  and (o.required_skill='' or strpos(lower(coalesce(details->>'skills','')),lower(o.required_skill))>0)
  and (o.required_language='' or strpos(lower(coalesce(details->>'languages','')),lower(o.required_language))>0)
 ), batch as (select * from matched order by start_date,created_at,id limit 50 offset p_page*50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(b) order by start_date,created_at,id) from batch b),'[]'::jsonb),'total',(select count(*) from matched),'page',p_page,'page_size',50) into result;
 return result;
end;$$;

create function public.apply_work_opportunity(p_opportunity uuid,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.work_opportunities;p public.volunteer_profiles;existing public.work_applications;new_id uuid;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into o from public.work_opportunities where id=p_opportunity for update;
 if not found or o.survey_project_id is null or o.status<>'open' or o.reply_by<=now() then raise exception 'Open project opportunity required';end if;
 if not exists(select 1 from public.organizations where id=o.organization_id and status='active') or not exists(select 1 from public.survey_projects where id=o.survey_project_id and status='active') then raise exception 'Opportunity unavailable';end if;
 select * into p from public.volunteer_profiles where user_id=auth.uid();
 if not found or p.status<>'verified' or p.geography_id is null then raise exception 'Verified volunteer profile with structured location required';end if;
 if not exists(select 1 from public.profile_shares where organization_id=o.organization_id and user_id=auth.uid()) then raise exception 'Share your profile with this NGO before applying';end if;
 if not exists(with recursive areas as (select id from public.geographies where id=o.geography_id union all select g.id from public.geographies g join areas x on g.parent_id=x.id) select 1 from areas where id=p.geography_id) then raise exception 'Opportunity is outside your registered work area';end if;
 if o.required_skill<>'' and strpos(lower(coalesce(p.details->>'skills','')),lower(o.required_skill))=0 then raise exception 'Required skill is not listed on your profile';end if;
 if o.required_language<>'' and strpos(lower(coalesce(p.details->>'languages','')),lower(o.required_language))=0 then raise exception 'Required language is not listed on your profile';end if;
 if p_note is null or length(p_note)>2000 then raise exception 'Application note is too long';end if;
 if exists(select 1 from public.work_invitations where opportunity_id=o.id and user_id=auth.uid() and status in ('pending','accepted')) then raise exception 'Respond to the existing invitation instead of applying';end if;
 select * into existing from public.work_applications where opportunity_id=o.id and user_id=auth.uid() for update;
 if found then
  if existing.status not in ('withdrawn','cancelled','rejected') then raise exception 'Application already exists';end if;
  update public.work_applications set status='pending',note=trim(p_note),review_note='',reviewed_by=null,reviewed_at=null,updated_at=now(),version=version+1 where id=existing.id returning id into new_id;
 else
  insert into public.work_applications(opportunity_id,organization_id,survey_project_id,user_id,volunteer_name,organization_name,project_title,opportunity_title,note) values(o.id,o.organization_id,o.survey_project_id,auth.uid(),(select full_name from public.accounts where id=auth.uid()),(select name from public.organizations where id=o.organization_id),(select title from public.survey_projects where id=o.survey_project_id),o.title,trim(p_note)) returning id into new_id;
 end if;
 insert into public.notifications(user_id,title,body) select m.user_id,'New volunteer application','Open Workforce marketplace to review a project application.' from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=o.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active' and m.user_id<>auth.uid();
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),auth.uid(),o.organization_id,'work_application_submitted',jsonb_build_object('id',new_id,'opportunity',o.id,'project',o.survey_project_id));
 return new_id;
end;$$;

create function public.withdraw_work_application(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.work_applications;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into a from public.work_applications where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Application not found';end if;
 if a.version is distinct from p_version or a.status not in ('pending','shortlisted','selected') then raise exception 'Application changed or cannot be withdrawn';end if;
 if exists(select 1 from public.work_assignments where source_application_id=a.id and status in ('offered','active')) then raise exception 'Respond to the assignment offer instead';end if;
 update public.work_applications set status='withdrawn',updated_at=now(),version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),auth.uid(),a.organization_id,'work_application_withdrawn',jsonb_build_object('id',p_id));
end;$$;

create function public.review_work_application(p_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.work_applications;
begin
 select * into a from public.work_applications where id=p_id for update;
 if not found or not app_private.ngo_admin(a.organization_id) then raise exception 'Relevant active NGO Admin required';end if;
 if a.version is distinct from p_version or a.status not in ('pending','shortlisted','selected') then raise exception 'Application changed. Reload.';end if;
 if exists(select 1 from public.work_assignments where source_application_id=a.id and status in ('offered','active','completed')) then raise exception 'Application is already attached to an assignment';end if;
 if p_status not in ('shortlisted','selected','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Decision and review note required';end if;
 update public.work_applications set status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),version=version+1 where id=p_id;
 insert into public.notifications(user_id,title,body) values(a.user_id,'Application reviewed','An NGO reviewed your project application. Open Workforce marketplace for the decision.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),a.user_id,a.organization_id,'work_application_reviewed',jsonb_build_object('id',p_id,'status',p_status,'project',a.survey_project_id));
end;$$;

create function public.project_workforce_candidates(p_project uuid,p_query text default '',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.survey_projects;result jsonb;
begin
 select * into p from public.survey_projects where id=p_project;
 if not found or not (app_private.ngo_admin(p.organization_id) or app_private.can_manage_surveys()) then raise exception 'Project workforce access required';end if;
 if p_query is null or length(p_query)>100 or p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid candidate search';end if;
 with recursive areas as (select id from public.geographies where id=p.geography_id union all select g.id from public.geographies g join areas a on g.parent_id=a.id),
 matched as materialized (
  select v.user_id,v.details,v.geography_id,s.status shortlist_status,
    (select count(*) from public.survey_responses r where r.collector_id=v.user_id and r.status='approved')::int approved_surveys,
    (select count(*) from public.survey_responses r where r.collector_id=v.user_id and r.status in ('approved','rejected','correction_required'))::int reviewed_surveys,
    (select count(*) from public.work_assignments w where w.user_id=v.user_id and w.status='completed')::int completed_assignments,
    (select count(*) from public.volunteer_experiences e where e.user_id=v.user_id and e.status='verified')::int verified_experiences,
    coalesce((select 'application' from public.work_applications a join public.work_opportunities o on o.id=a.opportunity_id where a.user_id=v.user_id and a.survey_project_id=p.id and a.status='selected' and o.survey_project_id=p.id order by a.updated_at desc limit 1),
             (select 'invitation' from public.work_invitations i join public.work_opportunities o on o.id=i.opportunity_id where i.user_id=v.user_id and i.status='accepted' and o.survey_project_id=p.id order by i.responded_at desc nulls last limit 1),
             case when s.status='selected' then 'shortlist' end) source_kind,
    coalesce((select a.id from public.work_applications a where a.user_id=v.user_id and a.survey_project_id=p.id and a.status='selected' order by a.updated_at desc limit 1),
             (select i.id from public.work_invitations i join public.work_opportunities o on o.id=i.opportunity_id where i.user_id=v.user_id and i.status='accepted' and o.survey_project_id=p.id order by i.responded_at desc nulls last limit 1)) source_id
  from public.volunteer_profiles v
  left join public.volunteer_shortlists s on s.organization_id=p.organization_id and s.user_id=v.user_id
  join public.accounts ac on ac.id=v.user_id and ac.status='active'
  where v.status='verified' and v.geography_id in (select id from areas)
  and (app_private.can_manage_surveys() or app_private.ngo_profile_access(p.organization_id,v.user_id))
  and coalesce(v.details->>'availability','')<>'Unavailable'
  and (p_query='' or strpos(lower(coalesce(v.details->>'full_name','')),lower(trim(p_query)))>0 or strpos(lower(coalesce(v.details->>'skills','')),lower(trim(p_query)))>0 or strpos(lower(coalesce(v.details->>'languages','')),lower(trim(p_query)))>0)
 ), scored as (
  select m.*,
    case when completed_assignments>0 or approved_surveys>=25 or verified_experiences>=2 then 'strong_match'
         when approved_surveys>0 or verified_experiences>0 then 'good_match'
         else 'local_verified' end match_label,
    case when reviewed_surveys>=5 then round((approved_surveys::numeric/nullif(reviewed_surveys,0))*100,1) else null end approval_rate
  from matched m
 ), batch as (select * from scored order by case match_label when 'strong_match' then 0 when 'good_match' then 1 else 2 end,lower(coalesce(details->>'full_name','')),user_id limit 50 offset p_page*50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(b) order by case match_label when 'strong_match' then 0 when 'good_match' then 1 else 2 end,lower(coalesce(details->>'full_name','')),user_id) from batch b),'[]'::jsonb),'total',(select count(*) from scored),'page',p_page,'page_size',50) into result;
 return result;
end;$$;

create function public.create_work_assignment(
 p_project uuid,p_user uuid,p_source_kind text,p_source_id uuid,p_work_mode text,p_compensation_type text,
 p_currency text,p_rate numeric,p_target_surveys integer,p_start date,p_end date,p_terms_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;new_id uuid;opportunity uuid;app public.work_applications;inv public.work_invitations;
begin
 select * into p from public.survey_projects where id=p_project for update;
 if not found or not app_private.ngo_admin(p.organization_id) then raise exception 'Active NGO Admin for this project required';end if;
 if p.status<>'active' then raise exception 'Active project required';end if;
 if not exists(select 1 from public.accounts where id=p_user and status='active') or not exists(select 1 from public.volunteer_profiles where user_id=p_user and status='verified') then raise exception 'Verified active volunteer required';end if;
 if not exists(with recursive areas as (select id from public.geographies where id=p.geography_id union all select g.id from public.geographies g join areas a on g.parent_id=a.id) select 1 from public.volunteer_profiles v where v.user_id=p_user and v.geography_id in (select id from areas)) then raise exception 'Volunteer location is outside the survey project area';end if;
 if p_source_kind='application' then
  select * into app from public.work_applications where id=p_source_id and user_id=p_user and survey_project_id=p_project and organization_id=p.organization_id and status='selected';
  if not found then raise exception 'Selected application source required';end if; opportunity:=app.opportunity_id;
 elsif p_source_kind='invitation' then
  select i.* into inv from public.work_invitations i join public.work_opportunities o on o.id=i.opportunity_id where i.id=p_source_id and i.user_id=p_user and i.organization_id=p.organization_id and i.status='accepted' and o.survey_project_id=p_project;
  if not found then raise exception 'Accepted invitation source required';end if; opportunity:=inv.opportunity_id;
 elsif p_source_kind='shortlist' then
  if p_source_id is not null or not exists(select 1 from public.volunteer_shortlists where organization_id=p.organization_id and user_id=p_user and status='selected') or not app_private.ngo_profile_access(p.organization_id,p_user) then raise exception 'Selected shared shortlist source required';end if;
 else raise exception 'Valid workforce source required';end if;
 if p_work_mode not in ('volunteer','paid') or p_compensation_type not in ('none','per_verified_survey','daily_rate','fixed_assignment') then raise exception 'Valid work and compensation type required';end if;
 if (p_work_mode='volunteer' and (p_compensation_type<>'none' or p_rate is not null)) or (p_work_mode='paid' and (p_compensation_type='none' or p_rate is null or p_rate<=0)) then raise exception 'Compensation terms do not match work mode';end if;
 if p_currency is null or length(trim(p_currency))<>3 or upper(trim(p_currency))<>trim(p_currency) then raise exception 'Three-letter uppercase currency required';end if;
 if p_target_surveys is null or p_target_surveys not between 1 and 1000000 or p_start is null or p_end is null or p_start<p.start_date or p_end>p.end_date or p_end<p_start then raise exception 'Target and assignment dates must fit the project';end if;
 if p_terms_note is null or length(trim(p_terms_note)) not between 5 and 3000 then raise exception 'Assignment terms note required';end if;
 insert into public.work_assignments(survey_project_id,opportunity_id,organization_id,user_id,volunteer_name,organization_name,project_title,opportunity_title,source_kind,source_application_id,source_invitation_id,work_mode,compensation_type,currency,rate,target_surveys,start_date,end_date,terms_note,offered_by)
 values(p_project,opportunity,p.organization_id,p_user,(select full_name from public.accounts where id=p_user),(select name from public.organizations where id=p.organization_id),p.title,coalesce((select title from public.work_opportunities where id=opportunity),''),p_source_kind,case when p_source_kind='application' then p_source_id end,case when p_source_kind='invitation' then p_source_id end,p_work_mode,p_compensation_type,upper(trim(p_currency)),p_rate,p_target_surveys,p_start,p_end,trim(p_terms_note),auth.uid()) returning id into new_id;
 insert into public.notifications(user_id,title,body) values(p_user,'Project assignment offer','Open Workforce marketplace to review and accept the assignment terms.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,p.organization_id,'work_assignment_offered',jsonb_build_object('id',new_id,'project',p_project,'source',p_source_kind,'work_mode',p_work_mode,'compensation_type',p_compensation_type,'rate',p_rate,'target',p_target_surveys,'start',p_start,'end',p_end));
 return new_id;
end;$$;

create function public.respond_work_assignment(p_id uuid,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare w public.work_assignments;p public.survey_projects;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into w from public.work_assignments where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Assignment offer not found';end if;
 if w.version is distinct from p_version or w.status<>'offered' then raise exception 'Assignment changed. Reload.';end if;
 if p_status not in ('accepted','declined') then raise exception 'Accept or decline required';end if;
 select * into p from public.survey_projects where id=w.survey_project_id;
 if p_status='accepted' then
  if p.status<>'active' or not exists(select 1 from public.organizations where id=w.organization_id and status='active') or w.end_date<(now() at time zone 'UTC')::date then raise exception 'Assignment is no longer available';end if;
  update public.work_assignments set status='active',responded_at=now(),version=version+1 where id=p_id;
  insert into public.survey_assignments(project_id,user_id,active) values(w.survey_project_id,w.user_id,true) on conflict(project_id,user_id) do update set active=true;
 else
  update public.work_assignments set status='declined',responded_at=now(),version=version+1 where id=p_id;
 end if;
 insert into public.notifications(user_id,title,body) select m.user_id,'Assignment response','A volunteer responded to a project assignment offer.' from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=w.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),auth.uid(),w.organization_id,'work_assignment_responded',jsonb_build_object('id',p_id,'response',p_status,'project',w.survey_project_id));
end;$$;

create function public.complete_work_assignment(p_id uuid,p_feedback jsonb,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare w public.work_assignments;k text;
begin
 select * into w from public.work_assignments where id=p_id for update;
 if not found or not app_private.ngo_admin(w.organization_id) then raise exception 'Relevant active NGO Admin required';end if;
 if w.version is distinct from p_version or w.status<>'active' then raise exception 'Active assignment changed. Reload.';end if;
 if p_note is null or length(trim(p_note)) not between 5 and 3000 or p_feedback is null or jsonb_typeof(p_feedback)<>'object' or octet_length(p_feedback::text)>1000 then raise exception 'Structured feedback and completion note required';end if;
 foreach k in array array['professionalism','communication','field_discipline','data_quality','task_completion'] loop
  if coalesce(jsonb_typeof(p_feedback->k),'')<>'number' or (p_feedback->>k)::numeric not between 1 and 5 then raise exception 'Each feedback rating must be 1 to 5';end if;
 end loop;
 update public.work_assignments set status='completed',completed_at=now(),completed_by=auth.uid(),completion_feedback=p_feedback,completion_note=trim(p_note),version=version+1 where id=p_id;
 update public.survey_assignments set active=false where project_id=w.survey_project_id and user_id=w.user_id;
 insert into public.notifications(user_id,title,body) values(w.user_id,'Assignment completed','Your NGO marked a project assignment complete. It is now part of your verified POEM work history.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),w.user_id,w.organization_id,'work_assignment_completed',jsonb_build_object('id',p_id,'project',w.survey_project_id,'feedback',p_feedback));
end;$$;

create function public.cancel_work_assignment(p_id uuid,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare w public.work_assignments;
begin
 select * into w from public.work_assignments where id=p_id for update;
 if not found or not (app_private.ngo_admin(w.organization_id) or app_private.can_manage_surveys()) then raise exception 'Assignment management permission required';end if;
 if w.version is distinct from p_version or w.status not in ('offered','active') then raise exception 'Assignment changed or already final';end if;
 if p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Cancellation reason required';end if;
 update public.work_assignments set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_note=trim(p_note),version=version+1 where id=p_id;
 update public.survey_assignments set active=false where project_id=w.survey_project_id and user_id=w.user_id;
 insert into public.notifications(user_id,title,body) values(w.user_id,'Assignment cancelled','A project assignment was cancelled. Open Workforce marketplace for details.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),w.user_id,w.organization_id,'work_assignment_cancelled',jsonb_build_object('id',p_id,'project',w.survey_project_id,'reason',p_note));
end;$$;

-- A workforce assignment narrows collection dates. Legacy direct survey assignments continue to work.
create or replace function app_private.can_collect(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and exists(
  select 1 from public.survey_assignments a
  join public.survey_projects p on p.id=a.project_id
  join public.organizations o on o.id=p.organization_id
  join public.volunteer_profiles v on v.user_id=a.user_id
  where p.id=pid and a.user_id=auth.uid() and a.active and p.status='active' and o.status='active' and v.status<>'suspended'
  and (now() at time zone 'UTC')::date between p.start_date and p.end_date
  and (
   not exists(select 1 from public.work_assignments w where w.survey_project_id=pid and w.user_id=auth.uid())
   or exists(select 1 from public.work_assignments w where w.survey_project_id=pid and w.user_id=auth.uid() and w.status='active' and (now() at time zone 'UTC')::date between w.start_date and w.end_date)
  )
 );
$$;

-- Closing recruitment cancels only unresolved recruiting records; accepted/selected history remains.
create or replace function public.close_opportunity(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.work_opportunities;
begin
 select * into o from public.work_opportunities where id=p_id for update;
 if not found or not app_private.ngo_admin(o.organization_id) then raise exception 'Active NGO Admin required';end if;
 if o.status='closed' then return;end if;
 update public.work_opportunities set status='closed' where id=p_id;
 insert into public.notifications(user_id,title,body) select user_id,'Opportunity closed','A pending invitation was cancelled because the NGO closed recruitment.' from public.work_invitations where opportunity_id=p_id and status='pending';
 update public.work_invitations set status='cancelled',version=version+1,responded_at=now() where opportunity_id=p_id and status='pending';
 insert into public.notifications(user_id,title,body) select user_id,'Opportunity closed','Your pending project application was closed by the NGO.' from public.work_applications where opportunity_id=p_id and status in ('pending','shortlisted');
 update public.work_applications set status='cancelled',version=version+1,updated_at=now() where opportunity_id=p_id and status in ('pending','shortlisted');
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),o.organization_id,'opportunity_closed',jsonb_build_object('id',p_id));
end;$$;

create function app_private.close_project_workforce() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status<>new.status and new.status='closed' then
  insert into public.notifications(user_id,title,body) select user_id,'Survey project closed','A pending workforce invitation was cancelled because the survey project closed.' from public.work_invitations where opportunity_id in (select id from public.work_opportunities where survey_project_id=new.id) and status='pending';
  insert into public.notifications(user_id,title,body) select user_id,'Survey project closed','Your pending workforce application was closed with the survey project.' from public.work_applications where survey_project_id=new.id and status in ('pending','shortlisted');
  insert into public.notifications(user_id,title,body) select user_id,'Survey assignment closed','Your offered/active field assignment was cancelled because the survey project closed.' from public.work_assignments where survey_project_id=new.id and status in ('offered','active');
  update public.work_opportunities set status='closed' where survey_project_id=new.id and status='open';
  update public.work_invitations set status='cancelled',version=version+1,responded_at=now() where opportunity_id in (select id from public.work_opportunities where survey_project_id=new.id) and status='pending';
  update public.work_applications set status='cancelled',version=version+1,updated_at=now() where survey_project_id=new.id and status in ('pending','shortlisted');
  update public.work_assignments set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_note='Survey project closed',version=version+1 where survey_project_id=new.id and status in ('offered','active');
  update public.survey_assignments set active=false where project_id=new.id;
 end if;
 return new;
end;$$;
create trigger close_project_workforce after update of status on public.survey_projects for each row execute function app_private.close_project_workforce();

revoke all on public.work_applications,public.work_assignments from anon,authenticated;
grant select on public.work_applications,public.work_assignments to authenticated;
grant all on public.work_applications,public.work_assignments to service_role;

revoke all on function public.create_project_opportunity(uuid,text,text,uuid,date,date,timestamptz,text,text,integer,text,text),public.available_work_opportunities(integer),public.apply_work_opportunity(uuid,text),public.withdraw_work_application(uuid,integer),public.review_work_application(uuid,text,text,integer),public.project_workforce_candidates(uuid,text,integer),public.create_work_assignment(uuid,uuid,text,uuid,text,text,text,numeric,integer,date,date,text),public.respond_work_assignment(uuid,text,integer),public.complete_work_assignment(uuid,jsonb,text,integer),public.cancel_work_assignment(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.create_project_opportunity(uuid,text,text,uuid,date,date,timestamptz,text,text,integer,text,text),public.available_work_opportunities(integer),public.apply_work_opportunity(uuid,text),public.withdraw_work_application(uuid,integer),public.review_work_application(uuid,text,text,integer),public.project_workforce_candidates(uuid,text,integer),public.create_work_assignment(uuid,uuid,text,uuid,text,text,text,numeric,integer,date,date,text),public.respond_work_assignment(uuid,text,integer),public.complete_work_assignment(uuid,jsonb,text,integer),public.cancel_work_assignment(uuid,text,integer) to authenticated;
revoke all on function app_private.close_project_workforce() from public,anon,authenticated;
