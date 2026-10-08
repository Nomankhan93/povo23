-- FieldLance 2.41.15 — Project Lifecycle E2E Integrity
-- Align assignment-finalization authority with the existing project-management contract.
-- Project Managers can already review recruitment and create formal assignment offers through
-- app_private.can_manage_project()/can_review_survey(); completion/cancellation must use the same
-- server-side project authority so the Project Workspace does not expose actions that always fail.

create or replace function public.complete_work_assignment(
  p_id uuid,
  p_feedback jsonb,
  p_note text,
  p_version integer
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  w public.work_assignments;
  k text;
begin
  select * into w from public.work_assignments where id=p_id for update;
  if not found or not app_private.can_manage_project(w.survey_project_id) then
    raise exception 'Project workforce management permission required';
  end if;
  if w.version is distinct from p_version or w.status<>'active' then
    raise exception 'Active assignment changed. Reload.';
  end if;
  if p_note is null or length(trim(p_note)) not between 5 and 3000
     or p_feedback is null or jsonb_typeof(p_feedback)<>'object'
     or octet_length(p_feedback::text)>1000 then
    raise exception 'Structured feedback and completion note required';
  end if;
  foreach k in array array['professionalism','communication','field_discipline','data_quality','task_completion'] loop
    if coalesce(jsonb_typeof(p_feedback->k),'')<>'number'
       or (p_feedback->>k)::numeric not between 1 and 5 then
      raise exception 'Each feedback rating must be 1 to 5';
    end if;
  end loop;

  update public.work_assignments
  set status='completed',completed_at=now(),completed_by=auth.uid(),
      completion_feedback=p_feedback,completion_note=trim(p_note),version=version+1
  where id=p_id;

  update public.survey_assignments
  set active=false
  where project_id=w.survey_project_id and user_id=w.user_id;

  insert into public.notifications(
    user_id,title,body,event_type,category,priority,action_page,action_label,
    organization_id,project_id,source_kind,source_ref
  ) values(
    w.user_id,'Assignment completed',
    'Your project assignment was completed. It is now part of your verified FieldLance work history.',
    'work_assignment_completed','assignment','normal','My Assigned Surveys','Open assignment',
    w.organization_id,w.survey_project_id,'work_assignment',w.id::text
  );

  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),w.user_id,w.organization_id,'work_assignment_completed',
    jsonb_build_object('id',p_id,'project',w.survey_project_id,'feedback',p_feedback));
end;
$$;

create or replace function public.cancel_work_assignment(
  p_id uuid,
  p_note text,
  p_version integer
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  w public.work_assignments;
begin
  select * into w from public.work_assignments where id=p_id for update;
  if not found or not app_private.can_manage_project(w.survey_project_id) then
    raise exception 'Project workforce management permission required';
  end if;
  if w.version is distinct from p_version or w.status not in ('offered','active') then
    raise exception 'Assignment changed or already final';
  end if;
  if p_note is null or length(trim(p_note)) not between 5 and 2000 then
    raise exception 'Cancellation reason required';
  end if;

  update public.work_assignments
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancellation_note=trim(p_note),version=version+1
  where id=p_id;

  update public.survey_assignments
  set active=false
  where project_id=w.survey_project_id and user_id=w.user_id;

  insert into public.notifications(
    user_id,title,body,event_type,category,priority,action_page,action_label,
    organization_id,project_id,source_kind,source_ref
  ) values(
    w.user_id,'Assignment cancelled',
    'A project assignment was cancelled. Open My Assigned Surveys for details.',
    'work_assignment_cancelled','assignment','high','My Assigned Surveys','Open assignment',
    w.organization_id,w.survey_project_id,'work_assignment',w.id::text
  );

  insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
  values(auth.uid(),w.user_id,w.organization_id,'work_assignment_cancelled',
    jsonb_build_object('id',p_id,'project',w.survey_project_id,'reason',trim(p_note)));
end;
$$;

revoke all on function public.complete_work_assignment(uuid,jsonb,text,integer),
  public.cancel_work_assignment(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.complete_work_assignment(uuid,jsonb,text,integer),
  public.cancel_work_assignment(uuid,text,integer) to authenticated;
