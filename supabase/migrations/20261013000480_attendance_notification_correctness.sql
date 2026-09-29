-- 2.41.4: exact authorized targets; no historical notification rewrite.
create function public.attendance_session_detail(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required'; end if;
  select to_jsonb(x) into result from (
    select s.id,s.assignment_id,s.project_id,s.organization_id,s.worker_id,s.work_date,s.timezone,s.location_policy_snapshot,s.max_accuracy_m_snapshot,
      s.check_in_captured_at,s.check_in_received_at,s.check_out_captured_at,s.check_out_received_at,s.effective_check_in_at,s.effective_check_out_at,
      s.status,s.worker_note,s.submitted_at,s.reviewed_by,s.reviewed_at,s.review_note,s.payable_unit_id,s.version,s.created_at,s.updated_at,
      w.volunteer_name,w.organization_name,w.project_title,w.work_mode,w.compensation_type,w.currency,w.rate,w.start_date as assignment_start_date,w.end_date as assignment_end_date,
      case when s.effective_check_out_at is null then null else greatest(0,floor(extract(epoch from (s.effective_check_out_at-s.effective_check_in_at))/60)::integer) end duration_minutes,
      ci.latitude check_in_latitude,ci.longitude check_in_longitude,ci.accuracy_m check_in_accuracy_m,ci.permission_state check_in_permission_state,ci.quality check_in_quality,ci.note check_in_location_note,
      co.latitude check_out_latitude,co.longitude check_out_longitude,co.accuracy_m check_out_accuracy_m,co.permission_state check_out_permission_state,co.quality check_out_quality,co.note check_out_location_note
    from public.assignment_work_sessions s
    join public.work_assignments w on w.id=s.assignment_id
    left join public.assignment_session_locations ci on ci.session_id=s.id and ci.event_type='check_in'
    left join public.assignment_session_locations co on co.session_id=s.id and co.event_type='check_out'
    where s.id=p_session and app_private.can_read_attendance_assignment(s.assignment_id)
  ) x;
  return result;
end;$$;

create function public.operational_task_detail(p_task uuid,p_organization uuid default null,p_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not app_private.is_active() then raise exception 'Active account required'; end if;
  select to_jsonb(x) into result from (
    select t.*,
      (t.status in ('open','in_progress') and t.due_at<now()) as overdue,
      a.full_name as assignee_name,o.name as organization_name,p.title as project_title,s.label as sla_label
    from public.operational_tasks t
    join public.operational_task_sla_policies s on s.task_type=t.task_type
    left join public.accounts a on a.id=t.assigned_to
    left join public.organizations o on o.id=t.organization_id
    left join public.survey_projects p on p.id=t.project_id
    where t.id=p_task
      and (p_organization is null or t.organization_id=p_organization)
      and (p_project is null or t.project_id=p_project)
      and app_private.can_read_operational_task(t.task_type,t.organization_id,t.project_id,t.assigned_to,t.created_by)
  ) x;
  return result;
end;$$;

revoke all on function public.attendance_session_detail(uuid),public.operational_task_detail(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.attendance_session_detail(uuid),public.operational_task_detail(uuid,uuid,uuid) to authenticated;

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
    'attendance_'||event_name,'assignment',case when p_action='correction_required' then 'high' else 'normal' end,'My Attendance','Open workday',s.organization_id,s.project_id,'attendance_session',s.id::text);
  return jsonb_build_object('id',s.id,'status',s.status,'version',s.version,'payable_unit_id',coalesce(unit_id,s.payable_unit_id));
end;
$$;
