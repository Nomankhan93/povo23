-- FieldLance 2.41.3 — Notification Routing & Action Context
-- Adds explicit event/source/action metadata for current operational notifications.
-- Historical title-derived metadata remains a compatibility fallback only.

alter table public.notifications
  add column event_type text check(event_type is null or length(event_type) between 2 and 100);

update public.notifications
set event_type=case
  when source_kind is not null then 'legacy_'||regexp_replace(lower(source_kind),'[^a-z0-9]+','_','g')
  else 'legacy_'||regexp_replace(lower(coalesce(category,'system')),'[^a-z0-9]+','_','g')
end
where event_type is null;

create or replace function app_private.notification_default_metadata()
returns trigger language plpgsql security definer set search_path='' as $$
declare txt text:=lower(coalesce(new.title,'')||' '||coalesce(new.body,'')); recipient_role text;
begin
  select platform_role into recipient_role from public.accounts where id=new.user_id;
  if new.category='system' then
    if txt like '%withdraw%' or txt like '%payable%' or txt like '%contract amendment%' then new.category:='finance';
    elsif txt like '%assignment%' then new.category:='assignment';
    elsif txt like '%application%' or txt like '%invitation%' or txt like '%recruit%' then new.category:='recruitment';
    elsif txt like '%survey%' then new.category:='survey';
    elsif txt like '%partner ngo%' or txt like '%organization%' then new.category:='organization';
    elsif txt like '%beneficiary%' or txt like '%assistance%' or txt like '%case%' then new.category:='case';
    elsif txt like '%verification%' or txt like '%access%' or txt like '%security%' then new.category:='security';
    end if;
  end if;
  if new.priority='normal' then
    if txt like '%failed%' or txt like '%reversed%' then new.priority:='urgent';
    elsif txt like '%offer%' or txt like '%review required%' or txt like '%needs changes%' then new.priority:='high';
    end if;
  end if;
  -- Compatibility only: current 2.41.3 producers pass explicit action/source metadata.
  if new.action_page is null then
    if lower(new.title)='new volunteer application' or lower(new.title)='assignment response' then new.action_page:='Workforce marketplace';
    elsif lower(new.title) in ('application reviewed','application selected') then new.action_page:='My Applications';
    elsif lower(new.title) in ('project assignment offer','survey assignment updated') then new.action_page:='My Assigned Surveys';
    elsif txt like '%invitation%' then new.action_page:='Invitations';
    elsif txt like '%work payable%' or txt like '%contract amendment%' then new.action_page:='Workforce payables';
    elsif txt like '%withdraw%' then new.action_page:='E-Wallets & withdrawals';
    elsif txt like '%partner ngo%' then new.action_page:=case when recipient_role in ('admin','super_admin','ngo_manager') then 'NGO applications' else 'Partner NGO application' end;
    elsif txt like '%verification%' then new.action_page:='Verification';
    elsif txt like '%beneficiary%' or txt like '%assistance%' or txt like '%case%' then new.action_page:='Beneficiary cases';
    elsif txt like '%survey%' then new.action_page:='Survey projects';
    end if;
  end if;
  if new.action_page is not null and new.action_label is null then new.action_label:='Open'; end if;
  if new.event_type is null then new.event_type:='legacy_'||regexp_replace(lower(coalesce(new.category,'system')),'[^a-z0-9]+','_','g'); end if;
  return new;
end;$$;
revoke all on function app_private.notification_default_metadata() from public,anon,authenticated;


create or replace function public.apply_work_opportunity(
  p_opportunity uuid,p_availability text,p_note text,p_profile_share_consent boolean
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  o public.work_opportunities;
  p public.volunteer_profiles;
  existing public.work_applications;
  project_existing public.work_applications;
  new_id uuid;
  snapshot jsonb;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into o from public.work_opportunities where id=p_opportunity for update;
 if not found or not app_private.work_opportunity_visible(o.id,auth.uid()) then raise exception 'Published recruitment with open applications required';end if;
 if not exists(select 1 from public.organizations where id=o.organization_id and status='active') or not exists(select 1 from public.survey_projects where id=o.survey_project_id and status='active') then raise exception 'Opportunity unavailable';end if;
 select * into p from public.volunteer_profiles where user_id=auth.uid();
 if not found or p.status<>'verified' then raise exception 'Publish an active volunteer profile before applying';end if;
 if exists(select 1 from public.work_invitations wi join public.work_opportunities invited on invited.id=wi.opportunity_id where invited.survey_project_id=o.survey_project_id and wi.user_id=auth.uid() and wi.status in ('pending','accepted')) then raise exception 'Respond to the existing project invitation instead of applying';end if;
 if o.required_skill<>'' and strpos(lower(coalesce(p.details->>'skills','')),lower(o.required_skill))=0 then raise exception 'Required skill is not listed on your profile';end if;
 if o.required_language<>'' and strpos(lower(coalesce(p.details->>'languages','')),lower(o.required_language))=0 then raise exception 'Required language is not listed on your profile';end if;
 if p_availability is null or length(trim(p_availability)) not between 3 and 1000 then raise exception 'Availability is required';end if;
 if p_note is null or length(p_note)>2000 then raise exception 'Application message is too long';end if;
 if p_profile_share_consent is distinct from true then raise exception 'Application-scoped profile snapshot consent is required';end if;

 select * into project_existing
 from public.work_applications
 where survey_project_id=o.survey_project_id
   and user_id=auth.uid()
   and status in ('pending','shortlisted','selected')
 order by updated_at desc,created_at desc
 limit 1
 for update;
 if found then raise exception 'An active application already exists for this project';end if;

 select * into existing from public.work_applications where opportunity_id=o.id and user_id=auth.uid() for update;
 snapshot:=app_private.recruitment_profile_snapshot(auth.uid());
 if snapshot is null then raise exception 'Volunteer profile unavailable';end if;
 if found then
  update public.work_applications
  set status='pending',note=trim(p_note),availability=trim(p_availability),profile_share_consent=true,
      consent_version='recruitment-profile-v1',profile_snapshot=snapshot,review_note='',reviewed_by=null,reviewed_at=null,
      withdrawn_at=null,updated_at=now(),version=version+1
  where id=existing.id returning id into new_id;
 else
  insert into public.work_applications(
    opportunity_id,organization_id,survey_project_id,user_id,volunteer_name,organization_name,
    project_title,opportunity_title,note,availability,profile_share_consent,consent_version,profile_snapshot
  ) values(
    o.id,o.organization_id,o.survey_project_id,auth.uid(),coalesce(snapshot->>'full_name',''),
    (select name from public.organizations where id=o.organization_id),
    (select title from public.survey_projects where id=o.survey_project_id),o.title,
    trim(p_note),trim(p_availability),true,'recruitment-profile-v1',snapshot
  ) returning id into new_id;
 end if;
 insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
 select m.user_id,'New Field Worker application','A Field Worker applied for a published project. Open Workforce marketplace to review it.',
   'work_application_submitted','recruitment','normal','Workforce marketplace','Open application',o.organization_id,o.survey_project_id,'work_application',new_id::text
 from public.organization_memberships m join public.accounts a on a.id=m.user_id
 where m.organization_id=o.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active' and m.user_id<>auth.uid();
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),auth.uid(),o.organization_id,'work_application_submitted',jsonb_build_object('id',new_id,'opportunity',o.id,'project',o.survey_project_id,'consent_version','recruitment-profile-v1'));
 return new_id;
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
 insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
 values(a.user_id,
   case p_status when 'shortlisted' then 'Application shortlisted' when 'selected' then 'Application selected' else 'Application decision' end,
   case p_status when 'shortlisted' then 'Your project application was shortlisted. No survey access has been granted yet.' when 'selected' then 'Your project application was selected for an assignment offer. Review the formal offer when it arrives.' else 'Your project application was not selected. Open My Applications for the review note.' end,
   'work_application_'||p_status,'recruitment',case when p_status='selected' then 'high' else 'normal' end,'My Applications','Open application',a.organization_id,a.survey_project_id,'work_application',a.id::text);
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),a.user_id,a.organization_id,'work_application_reviewed',jsonb_build_object('id',p_id,'status',p_status,'project',a.survey_project_id));
end;$$;

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
 insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
 values(p_user,'Project assignment offer','Open My Assigned Surveys to review and accept the assignment terms. Compensation terms are frozen in this offer.',
   'work_assignment_offered','assignment','high','My Assigned Surveys','Open offer',p.organization_id,p_project,'work_assignment',new_id::text);
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),p_user,p.organization_id,'work_assignment_offered',jsonb_build_object(
   'id',new_id,'project',p_project,'source',p_source_kind,'work_mode',snapshot_mode,'compensation_type',snapshot_type,
   'currency',snapshot_currency,'rate',snapshot_rate,'compensation_source',snapshot_source,'compensation_source_version',snapshot_version,
   'target',p_target_surveys,'start',p_start,'end',p_end
 ));
 return new_id;
end;$$;

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
 insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
 select m.user_id,'Assignment response','A volunteer responded to a project assignment offer.',
   'work_assignment_'||p_status,'assignment','normal','Workforce marketplace','Open assignment',w.organization_id,w.survey_project_id,'work_assignment',w.id::text
 from public.organization_memberships m join public.accounts a on a.id=m.user_id
 where m.organization_id=w.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),auth.uid(),w.organization_id,'work_assignment_responded',jsonb_build_object('id',p_id,'response',p_status,'project',w.survey_project_id));
end;$$;

create or replace function public.review_attendance_session(
  p_session uuid,p_action text,p_note text,p_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.assignment_work_sessions;w public.work_assignments;note_value text:=trim(coalesce(p_note,''));unit_id uuid;event_name text;
begin
  select * into s from public.assignment_work_sessions where id=p_session for update;
  if not found or not app_private.can_manage_attendance_project(s.project_id) then raise exception 'Organization Admin or Project Manager attendance permission required';end if;
  if s.worker_id=auth.uid() then raise exception 'Independent reviewer required';end if;
  if s.version is distinct from p_version then raise exception 'Attendance changed; reload';end if;
  if s.status<>'submitted' then raise exception 'Submitted attendance required';end if;
  if p_action not in ('approve','correction_required','reject') then raise exception 'Valid attendance review action required';end if;
  if p_action<>'approve' and length(note_value) not between 5 and 2000 then raise exception 'Review reason required';end if;
  if length(note_value)>2000 then raise exception 'Review note is too long';end if;
  select * into w from public.work_assignments where id=s.assignment_id;
  update public.assignment_work_sessions
  set status=case p_action when 'approve' then 'approved' when 'correction_required' then 'correction_required' else 'rejected' end,
      reviewed_by=auth.uid(),reviewed_at=now(),review_note=note_value,updated_at=now(),version=version+1
  where id=s.id returning * into s;
  event_name:=case p_action when 'approve' then 'approved' when 'correction_required' then 'correction_requested' else 'rejected' end;
  insert into public.attendance_events(session_id,event_type,actor_id,detail) values(s.id,event_name,auth.uid(),jsonb_build_object('note',note_value));
  if p_action='approve' and w.work_mode='paid' and w.compensation_type='daily_rate' then
    unit_id:=app_private.ensure_attendance_daily_payable(s.id);
    update public.assignment_work_sessions set payable_unit_id=unit_id,updated_at=now() where id=s.id;
  end if;
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),s.worker_id,s.organization_id,'attendance_'||p_action,jsonb_build_object('session',s.id,'assignment',s.assignment_id,'work_date',s.work_date,'payable_unit',unit_id));
  insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
  values(s.worker_id,'Attendance updated',case p_action when 'approve' then 'Your submitted workday was approved.' when 'correction_required' then 'Your submitted workday needs a correction. Open My attendance for details.' else 'Your submitted workday was rejected. Open My attendance for the review reason.' end,
    'attendance_'||event_name,'assignment',case when p_action='correction_required' then 'high' else 'normal' end,'My Attendance','Open attendance',s.organization_id,s.project_id,'attendance',s.assignment_id::text);
  return jsonb_build_object('id',s.id,'status',s.status,'version',s.version,'payable_unit_id',coalesce(unit_id,s.payable_unit_id));
end;
$$;

create or replace function public.review_survey_response(p_id uuid,p_status text,p_note text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.survey_responses;org uuid;
begin
  select * into r from public.survey_responses where id=p_id for update;
  if not found or not app_private.can_review_project_area(r.project_id,r.collection_geography_id) then raise exception 'Project/area review permission required';end if;
  if r.collector_id=auth.uid() then raise exception 'Cannot review your own survey';end if;
  if r.status<>'submitted' or r.version is distinct from p_version then raise exception 'Only current submitted responses can be reviewed';end if;
  if p_status is null or p_status not in ('approved','correction_required','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Review decision and note required';end if;
  update public.survey_responses set status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),version=version+1,updated_at=now() where id=p_id;
  select organization_id into org from public.survey_projects where id=r.project_id;
  insert into public.audit_events(actor_id,organization_id,action,detail)
  values(auth.uid(),org,'survey_response_reviewed',jsonb_build_object('id',p_id,'status',p_status,'previous_version',p_version,'collection_geography',r.collection_geography_id));
  insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
  values(r.collector_id,'Survey review','A response was reviewed. Open its survey project for feedback.',
    'survey_response_'||p_status,'survey',case when p_status='correction_required' then 'high' else 'normal' end,'Survey projects','Open response',org,r.project_id,'survey_response',r.id::text);
end;$$;

create or replace function app_private.end_case_owner(p_case uuid,p_reason text,p_event_type text,p_actor uuid default auth.uid())
returns void language plpgsql security definer set search_path='' as $$
declare current_owner public.beneficiary_case_assignments;
begin
  select * into current_owner
  from public.beneficiary_case_assignments
  where case_id=p_case and status='active'
  order by assigned_at desc,id desc limit 1 for update;
  if not found then return;end if;

  update public.beneficiary_case_assignments
  set status='ended',ended_by=p_actor,ended_at=now(),end_reason=trim(p_reason),version=version+1
  where id=current_owner.id;

  insert into public.beneficiary_case_assignment_events(
    case_id,assignment_id,event_type,from_user_id,from_role,reason,actor_id
  ) values(
    p_case,current_owner.id,p_event_type,current_owner.user_id,current_owner.owner_role,trim(p_reason),p_actor
  );

  insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
  select current_owner.user_id,'Case responsibility ended','A beneficiary case is no longer assigned to you. Open My Cases for your current responsibilities.',
    'beneficiary_case_owner_'||p_event_type,'case','normal','My Cases','Open case',c.organization_id,c.project_id,'beneficiary_case',p_case::text
  from public.beneficiary_cases c where c.id=p_case;

  perform app_private.refresh_case_followup_tasks(p_case);
end;$$;

create or replace function public.set_beneficiary_case_owner(
  p_case uuid,p_user uuid,p_owner_role text,p_reason text,p_expected_assignment uuid,p_expected_version integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases; current_owner public.beneficiary_case_assignments; new_id uuid:=gen_random_uuid(); event_name text;
begin
  select * into c from public.beneficiary_cases where id=p_case for update;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  if c.status='closed' then raise exception 'Reopen the beneficiary case before assigning an owner';end if;
  if p_owner_role not in ('field_worker','area_focal_person') then raise exception 'Valid case owner role required';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Case assignment reason required';end if;
  if not app_private.case_owner_eligible(p_case,p_user,p_owner_role) then raise exception 'Case owner must have current project and geography authority';end if;

  select * into current_owner from public.beneficiary_case_assignments
  where case_id=p_case and status='active' order by assigned_at desc,id desc limit 1 for update;

  if found then
    if current_owner.user_id=p_user and current_owner.owner_role=p_owner_role then return current_owner.id;end if;
    if p_expected_assignment is distinct from current_owner.id or p_expected_version is distinct from current_owner.version then raise exception 'Case ownership changed. Reload before reassigning.';end if;
    update public.beneficiary_case_assignments
    set status='ended',ended_by=auth.uid(),ended_at=now(),end_reason=trim(p_reason),version=version+1
    where id=current_owner.id;
    event_name:='reassigned';
  else
    if p_expected_assignment is not null or p_expected_version is not null then raise exception 'Case ownership changed. Reload before assigning.';end if;
    event_name:='assigned';
  end if;

  insert into public.beneficiary_case_assignments(
    id,case_id,organization_id,project_id,geography_id,user_id,owner_role,assigned_by
  ) values(new_id,c.id,c.organization_id,c.project_id,c.geography_id,p_user,p_owner_role,auth.uid());

  insert into public.beneficiary_case_assignment_events(
    case_id,assignment_id,event_type,from_user_id,from_role,to_user_id,to_role,reason,actor_id
  ) values(
    c.id,new_id,event_name,
    case when event_name='reassigned' then current_owner.user_id else null end,
    case when event_name='reassigned' then current_owner.owner_role else null end,
    p_user,p_owner_role,trim(p_reason),auth.uid()
  );

  if event_name='reassigned' then
    insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
    values(current_owner.user_id,'Case reassigned','A beneficiary case was reassigned. Open My Cases for your current responsibilities.',
      'beneficiary_case_reassigned','case','normal','My Cases','Open case',c.organization_id,c.project_id,'beneficiary_case',c.id::text);
  end if;
  insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
  values(p_user,'Case assigned','A beneficiary case has been assigned to you. Open My Cases to review the responsibility and follow-ups.',
    'beneficiary_case_assigned','case','high','My Cases','Open case',c.organization_id,c.project_id,'beneficiary_case',c.id::text);
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),p_user,c.organization_id,'beneficiary_case_owner_'||event_name,jsonb_build_object('case',c.id,'assignment',new_id,'project',c.project_id,'owner_role',p_owner_role,'reason',trim(p_reason)));

  perform app_private.refresh_case_followup_tasks(c.id);
  return new_id;
end;$$;

create or replace function public.clear_beneficiary_case_owner(
  p_case uuid,p_reason text,p_expected_assignment uuid,p_expected_version integer
) returns void language plpgsql security definer set search_path='' as $$
declare c public.beneficiary_cases; current_owner public.beneficiary_case_assignments;
begin
  select * into c from public.beneficiary_cases where id=p_case for update;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Case unassignment reason required';end if;
  select * into current_owner from public.beneficiary_case_assignments where case_id=p_case and status='active' order by assigned_at desc,id desc limit 1 for update;
  if not found then raise exception 'Beneficiary case has no active owner';end if;
  if p_expected_assignment is distinct from current_owner.id or p_expected_version is distinct from current_owner.version then raise exception 'Case ownership changed. Reload before unassigning.';end if;

  update public.beneficiary_case_assignments
  set status='ended',ended_by=auth.uid(),ended_at=now(),end_reason=trim(p_reason),version=version+1
  where id=current_owner.id;
  insert into public.beneficiary_case_assignment_events(case_id,assignment_id,event_type,from_user_id,from_role,reason,actor_id)
  values(c.id,current_owner.id,'unassigned',current_owner.user_id,current_owner.owner_role,trim(p_reason),auth.uid());
  insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
  values(current_owner.user_id,'Case responsibility ended','A beneficiary case was unassigned from you. Open My Cases for your current responsibilities.',
    'beneficiary_case_unassigned','case','normal','My Cases','Open case',c.organization_id,c.project_id,'beneficiary_case',c.id::text);
  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),current_owner.user_id,c.organization_id,'beneficiary_case_owner_unassigned',jsonb_build_object('case',c.id,'assignment',current_owner.id,'project',c.project_id,'reason',trim(p_reason)));
  perform app_private.refresh_case_followup_tasks(c.id);
end;$$;

create or replace function app_private.notify_task_event() returns trigger language plpgsql security definer set search_path='' as $$
declare heading text; body_text text; target record;
begin
  if tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to then
    heading:='Task assigned'; body_text:=new.title;
  elsif new.escalation_level>old.escalation_level then
    heading:='Task escalated'; body_text:=new.title||' · escalation level '||new.escalation_level::text;
  else return new; end if;

  if new.assigned_to is not null then
    insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
    values(new.assigned_to,heading,body_text,'operational_task_'||case when heading='Task assigned' then 'assigned' else 'escalated' end,'task',case when new.escalation_level>=2 then 'urgent' when new.priority in ('high','urgent') then new.priority else 'high' end,'Task Center','Open task',new.organization_id,new.project_id,'operational_task',new.id::text);
  else
    for target in
      select distinct a.id from public.accounts a
      where a.status='active' and (
        (new.assigned_role='ngo_manager' and a.platform_role in ('ngo_manager','admin','super_admin'))
        or (new.assigned_role='volunteer_manager' and a.platform_role in ('volunteer_manager','admin','super_admin'))
        or (new.assigned_role='survey_manager' and a.platform_role in ('survey_manager','admin','super_admin'))
        or (new.assigned_role='finance_operations' and a.platform_role in ('admin','super_admin'))
        or (new.assigned_role='organization_recruitment' and new.organization_id is not null and exists(select 1 from public.organization_memberships m where m.user_id=a.id and m.organization_id=new.organization_id and m.role='ngo_admin' and m.status='active'))
      )
    loop
      insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
      values(target.id,heading,body_text,'operational_task_'||case when heading='Task assigned' then 'assigned' else 'escalated' end,'task',case when new.escalation_level>=2 then 'urgent' when new.priority in ('high','urgent') then new.priority else 'high' end,'Task Center','Open task',new.organization_id,new.project_id,'operational_task',new.id::text);
    end loop;
  end if;
  return new;
end;$$;


create or replace function public.publish_notification_broadcast(
  p_title text,p_body text,p_audience text,p_organization uuid default null,p_project uuid default null,p_priority text default 'normal',p_action_page text default null,p_action_label text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid:=gen_random_uuid(); recipients integer:=0; is_platform_admin boolean;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 160 or length(trim(coalesce(p_body,''))) not between 3 and 4000 then raise exception 'Valid broadcast title and body required';end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Valid broadcast priority required';end if;
  if p_audience not in ('all_active','field_workers','organization_admins','fieldlance_staff','organization_members','project_team') then raise exception 'Valid broadcast audience required';end if;
  select exists(select 1 from public.accounts where id=auth.uid() and status='active' and platform_role in ('admin','super_admin')) into is_platform_admin;
  if p_audience in ('all_active','field_workers','organization_admins','fieldlance_staff') and not is_platform_admin then raise exception 'FieldLance admin broadcast access required';end if;
  if p_audience='organization_members' and (p_organization is null or not (app_private.ngo_admin(p_organization) or is_platform_admin)) then raise exception 'Organization broadcast access required';end if;
  if p_audience='project_team' and (p_project is null or not app_private.can_manage_project(p_project)) then raise exception 'Project broadcast access required';end if;

  insert into public.notification_broadcasts(id,title,body,audience_type,organization_id,project_id,priority,action_page,action_label,created_by)
  values(bid,trim(p_title),trim(p_body),p_audience,p_organization,p_project,p_priority,nullif(trim(coalesce(p_action_page,'')),''),nullif(trim(coalesce(p_action_label,'')),''),auth.uid());

  with target as (
    select distinct a.id
    from public.accounts a
    where a.status='active' and a.id<>auth.uid() and (
      (p_audience='all_active')
      or (p_audience='field_workers' and a.platform_role='volunteer')
      or (p_audience='fieldlance_staff' and a.platform_role<>'volunteer')
      or (p_audience='organization_admins' and exists(select 1 from public.organization_memberships m where m.user_id=a.id and m.role='ngo_admin' and m.status='active'))
      or (p_audience='organization_members' and exists(select 1 from public.organization_memberships m where m.user_id=a.id and m.organization_id=p_organization and m.status='active'))
      or (p_audience='project_team' and exists(select 1 from public.project_staff_assignments s where s.user_id=a.id and s.project_id=p_project and s.status='active' and s.starts_at<=current_date and (s.ends_at is null or s.ends_at>=current_date)))
    ) and coalesce((select broadcasts_enabled from public.notification_preferences pref where pref.user_id=a.id),true)
  ), ins as (
    insert into public.notifications(user_id,title,body,event_type,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref,broadcast_id)
    select id,trim(p_title),trim(p_body),'broadcast_published','broadcast',p_priority,nullif(trim(coalesce(p_action_page,'')),''),nullif(trim(coalesce(p_action_label,'')),''),p_organization,p_project,'broadcast',bid::text,bid from target
    returning 1
  ) select count(*) into recipients from ins;
  update public.notification_broadcasts set recipient_count=recipients where id=bid;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_organization,'notification_broadcast_published',jsonb_build_object('broadcast',bid,'audience',p_audience,'project',p_project,'recipients',recipients));
  return bid;
end;$$;

-- Existing rows with explicit source metadata keep working; legacy rows continue through action_page.
-- No notification grants are broadened by this migration.

