-- FieldLance 2.23.0 — Tasks, SLA & Escalation Center
-- Adds an operational task layer linked to authoritative workflows.
-- Completing a task never mutates or approves the linked source workflow.

create table public.operational_task_sla_policies (
  task_type text primary key check(length(task_type) between 3 and 80),
  label text not null check(length(label) between 3 and 120),
  default_due_hours integer not null check(default_due_hours between 1 and 2160),
  escalation_level_2_hours integer not null check(escalation_level_2_hours between 1 and 2160),
  escalation_level_3_hours integer not null check(escalation_level_3_hours between 1 and 4320),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check(escalation_level_2_hours < escalation_level_3_hours)
);

insert into public.operational_task_sla_policies(task_type,label,default_due_hours,escalation_level_2_hours,escalation_level_3_hours) values
 ('organization_application_review','Organization application review',72,24,72),
 ('field_worker_profile_review','Field Worker profile review',48,24,72),
 ('field_worker_application_review','Field Worker application review',48,24,72),
 ('assignment_offer_response','Assignment offer response',48,24,72),
 ('survey_response_review','Survey response review',24,12,48),
 ('beneficiary_case_followup','Beneficiary case follow-up',24,24,72),
 ('withdrawal_operations_review','Withdrawal operations review',24,12,48),
 ('manual','Operational task',72,24,72)
on conflict(task_type) do nothing;

create table public.operational_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null references public.operational_task_sla_policies(task_type),
  title text not null check(length(title) between 3 and 180),
  description text not null default '' check(length(description)<=4000),
  source_kind text not null default 'manual' check(length(source_kind) between 2 and 80),
  source_ref text not null check(length(source_ref) between 1 and 180),
  source_page text not null default 'Overview' check(length(source_page) between 2 and 120),
  organization_id uuid references public.organizations(id),
  project_id uuid references public.survey_projects(id),
  assigned_to uuid references public.accounts(id),
  assigned_role text,
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  status text not null default 'open' check(status in ('open','in_progress','completed','cancelled')),
  due_at timestamptz not null,
  escalation_level integer not null default 0 check(escalation_level between 0 and 3),
  created_by uuid references public.accounts(id),
  completed_by uuid references public.accounts(id),
  completed_at timestamptz,
  last_note text not null default '' check(length(last_note)<=2000),
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((status='completed' and completed_by is not null and completed_at is not null) or (status<>'completed' and completed_by is null and completed_at is null))
);

create unique index operational_tasks_active_source
  on public.operational_tasks(task_type,source_kind,source_ref)
  where status in ('open','in_progress');
create index operational_tasks_assignee_queue on public.operational_tasks(assigned_to,status,due_at,id);
create index operational_tasks_org_queue on public.operational_tasks(organization_id,status,due_at,id) where organization_id is not null;
create index operational_tasks_project_queue on public.operational_tasks(project_id,status,due_at,id) where project_id is not null;
create index operational_tasks_escalation_queue on public.operational_tasks(escalation_level,status,due_at,id);

create table public.operational_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.operational_tasks(id) on delete cascade,
  actor_id uuid references public.accounts(id),
  action text not null check(length(action) between 2 and 80),
  note text not null default '' check(length(note)<=2000),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index operational_task_events_history on public.operational_task_events(task_id,created_at desc,id desc);

create function app_private.can_read_operational_task(
  p_task_type text,p_org uuid,p_project uuid,p_assigned uuid,p_created uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and (
    p_assigned=auth.uid() or p_created=auth.uid()
    or exists(select 1 from public.accounts a where a.id=auth.uid() and a.status='active' and a.platform_role in ('super_admin','admin','auditor'))
    or (p_org is not null and app_private.ngo_admin(p_org))
    or (p_project is not null and app_private.can_manage_project(p_project))
    or exists(
      select 1 from public.accounts a where a.id=auth.uid() and a.status='active' and (
        (a.platform_role='ngo_manager' and p_task_type='organization_application_review')
        or (a.platform_role='volunteer_manager' and p_task_type in ('field_worker_profile_review','field_worker_application_review','assignment_offer_response'))
        or (a.platform_role='survey_manager' and p_task_type in ('field_worker_profile_review','field_worker_application_review','survey_response_review','beneficiary_case_followup'))
      )
    )
  );
$$;

create function app_private.can_manage_operational_task(
  p_task_type text,p_org uuid,p_project uuid,p_assigned uuid,p_created uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and (
    p_assigned=auth.uid() or p_created=auth.uid()
    or exists(select 1 from public.accounts a where a.id=auth.uid() and a.status='active' and a.platform_role in ('super_admin','admin'))
    or (p_org is not null and app_private.ngo_admin(p_org))
    or (p_project is not null and app_private.can_manage_project(p_project))
    or exists(
      select 1 from public.accounts a where a.id=auth.uid() and a.status='active' and (
        (a.platform_role='ngo_manager' and p_task_type='organization_application_review')
        or (a.platform_role='volunteer_manager' and p_task_type in ('field_worker_profile_review','field_worker_application_review','assignment_offer_response'))
        or (a.platform_role='survey_manager' and p_task_type in ('field_worker_profile_review','field_worker_application_review','survey_response_review','beneficiary_case_followup'))
      )
    )
  );
$$;

revoke all on function app_private.can_read_operational_task(text,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.can_manage_operational_task(text,uuid,uuid,uuid,uuid) from public,anon,authenticated;

alter table public.operational_task_sla_policies enable row level security;
alter table public.operational_tasks enable row level security;
alter table public.operational_task_events enable row level security;

create policy operational_task_sla_read on public.operational_task_sla_policies
for select to authenticated using(app_private.is_active());
create policy operational_tasks_read on public.operational_tasks
for select to authenticated using(app_private.can_read_operational_task(task_type,organization_id,project_id,assigned_to,created_by));
create policy operational_task_events_read on public.operational_task_events
for select to authenticated using(exists(
  select 1 from public.operational_tasks t where t.id=task_id
    and app_private.can_read_operational_task(t.task_type,t.organization_id,t.project_id,t.assigned_to,t.created_by)
));

revoke insert,update,delete on public.operational_task_sla_policies from authenticated;
revoke insert,update,delete on public.operational_tasks from authenticated;
revoke insert,update,delete on public.operational_task_events from authenticated;

grant select on public.operational_task_sla_policies to authenticated;
grant select on public.operational_tasks to authenticated;
grant select on public.operational_task_events to authenticated;

create function app_private.task_due_at(p_type text,p_requested timestamptz default null)
returns timestamptz language sql stable security definer set search_path='' as $$
  select coalesce(p_requested,now()+make_interval(hours=>coalesce((select default_due_hours from public.operational_task_sla_policies where task_type=p_type and active),72)));
$$;
revoke all on function app_private.task_due_at(text,timestamptz) from public,anon,authenticated;

create function app_private.upsert_derived_operational_task(
  p_type text,p_title text,p_description text,p_source_kind text,p_source_ref text,p_source_page text,
  p_org uuid,p_project uuid,p_assigned uuid,p_assigned_role text,p_priority text,p_due timestamptz,p_open boolean,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare t public.operational_tasks;
begin
  if p_open then
    select * into t from public.operational_tasks
    where task_type=p_type and source_kind=p_source_kind and source_ref=p_source_ref and status in ('open','in_progress')
    order by created_at desc limit 1 for update;
    if found then
      update public.operational_tasks set
        title=p_title,description=coalesce(p_description,''),source_page=p_source_page,
        organization_id=p_org,project_id=p_project,assigned_to=p_assigned,assigned_role=p_assigned_role,
        priority=p_priority,due_at=app_private.task_due_at(p_type,p_due),metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now(),version=version+1
      where id=t.id returning * into t;
      insert into public.operational_task_events(task_id,actor_id,action,note,snapshot)
      values(t.id,auth.uid(),'source_refreshed','Authoritative source still requires action.',to_jsonb(t));
    else
      insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,organization_id,project_id,assigned_to,assigned_role,priority,due_at,metadata)
      values(p_type,p_title,coalesce(p_description,''),p_source_kind,p_source_ref,p_source_page,p_org,p_project,p_assigned,p_assigned_role,p_priority,app_private.task_due_at(p_type,p_due),coalesce(p_metadata,'{}'::jsonb))
      returning * into t;
      insert into public.operational_task_events(task_id,actor_id,action,note,snapshot)
      values(t.id,auth.uid(),'derived_created','Task derived from authoritative workflow state.',to_jsonb(t));
    end if;
  else
    select * into t from public.operational_tasks
    where task_type=p_type and source_kind=p_source_kind and source_ref=p_source_ref and status in ('open','in_progress')
    order by created_at desc limit 1 for update;
    if found then
      update public.operational_tasks set status='cancelled',last_note='Source workflow no longer requires action.',updated_at=now(),version=version+1
      where id=t.id returning * into t;
      insert into public.operational_task_events(task_id,actor_id,action,note,snapshot)
      values(t.id,auth.uid(),'source_resolved','Source workflow no longer requires action.',to_jsonb(t));
    end if;
  end if;
end;
$$;
revoke all on function app_private.upsert_derived_operational_task(text,text,text,text,text,text,uuid,uuid,uuid,text,text,timestamptz,boolean,jsonb) from public,anon,authenticated;

create function app_private.sync_partner_ngo_review_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.upsert_derived_operational_task('organization_application_review','Review organization application: '||new.organization_name,
    'Review submitted organization details and required evidence in the authoritative Organization application workflow.',
    'partner_ngo_application',new.id::text,'NGO applications',new.organization_id,null,null,'ngo_manager','high',
    case when new.submitted_at is not null then new.submitted_at+interval '72 hours' else null end,new.status='submitted',jsonb_build_object('application_status',new.status));
  return new;
end;$$;
create trigger operational_task_partner_ngo after insert or update of status,submitted_at on public.partner_ngo_applications for each row execute function app_private.sync_partner_ngo_review_task();

create function app_private.sync_field_worker_profile_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.upsert_derived_operational_task('field_worker_profile_review','Review Field Worker profile',
    'Review profile identity and verification evidence in the authoritative Field Worker workflow.',
    'volunteer_profile',new.user_id::text,'Volunteers',null,null,null,'volunteer_manager','high',new.updated_at+interval '48 hours',new.status='pending',jsonb_build_object('profile_status',new.status));
  return new;
end;$$;
create trigger operational_task_field_worker_profile after insert or update of status,updated_at on public.volunteer_profiles for each row execute function app_private.sync_field_worker_profile_task();

create function app_private.sync_work_application_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.upsert_derived_operational_task('field_worker_application_review','Review Field Worker application: '||new.volunteer_name,
    new.project_title||' — '||new.opportunity_title,'work_application',new.id::text,'Workforce marketplace',new.organization_id,new.survey_project_id,null,'organization_recruitment','normal',new.created_at+interval '48 hours',
    new.status in ('pending','shortlisted','selected'),jsonb_build_object('application_status',new.status,'field_worker',new.volunteer_name));
  return new;
end;$$;
create trigger operational_task_work_application after insert or update of status on public.work_applications for each row execute function app_private.sync_work_application_task();

create function app_private.sync_assignment_offer_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.upsert_derived_operational_task('assignment_offer_response','Respond to assignment offer: '||new.project_title,
    'Review the formal assignment terms and accept or decline before field access becomes active.',
    'work_assignment',new.id::text,'My Assigned Surveys',new.organization_id,new.survey_project_id,new.user_id,'field_worker','high',new.offered_at+interval '48 hours',new.status='offered',jsonb_build_object('assignment_status',new.status));
  return new;
end;$$;
create trigger operational_task_assignment_offer after insert or update of status on public.work_assignments for each row execute function app_private.sync_assignment_offer_task();

create function app_private.sync_survey_review_task() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
  select organization_id into org from public.survey_projects where id=new.project_id;
  perform app_private.upsert_derived_operational_task('survey_response_review','Review submitted survey response',
    'Review the submitted field response in Verification. Task completion does not approve or reject the response.',
    'survey_response',new.id::text,'Verification',org,new.project_id,null,'survey_manager','high',new.updated_at+interval '24 hours',
    new.status in ('submitted','correction_requested'),jsonb_build_object('response_status',new.status,'collector_id',new.collector_id));
  return new;
end;$$;
create trigger operational_task_survey_review after insert or update of status,updated_at on public.survey_responses for each row execute function app_private.sync_survey_review_task();

create function app_private.sync_case_followup_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.upsert_derived_operational_task('beneficiary_case_followup','Complete beneficiary case follow-up',
    'Complete the scheduled follow-up in the beneficiary case workflow and record the outcome there.',
    'beneficiary_case_followup',new.id::text,'Beneficiary cases',new.organization_id,new.project_id,new.created_by,'case_followup','high',(new.due_on::timestamp+interval '17 hours') at time zone 'UTC',
    new.status='scheduled',jsonb_build_object('case_id',new.case_id,'followup_type',new.followup_type));
  return new;
end;$$;
create trigger operational_task_case_followup after insert or update of status,due_on on public.beneficiary_case_followups for each row execute function app_private.sync_case_followup_task();

create function app_private.sync_withdrawal_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.upsert_derived_operational_task('withdrawal_operations_review','Review withdrawal request',
    'Review provider state, approval and reconciliation in Withdrawal operations. Do not edit wallet balances directly.',
    'e_wallet_withdrawal',new.id::text,'Withdrawal operations',null,null,null,'finance_operations',case when new.status='failed' then 'urgent' else 'high' end,
    new.requested_at+interval '24 hours',new.status in ('requested','approved','processing','failed'),jsonb_build_object('withdrawal_status',new.status,'provider',new.provider,'currency',new.currency,'amount',new.amount));
  return new;
end;$$;
create trigger operational_task_withdrawal after insert or update of status on public.e_wallet_withdrawals for each row execute function app_private.sync_withdrawal_task();

create function public.create_operational_task(
  p_title text,p_description text,p_task_type text,p_organization uuid,p_project uuid,p_priority text,p_due_at timestamptz,p_source_page text,p_assign_to_me boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid:=gen_random_uuid(); ttype text:=coalesce(nullif(p_task_type,''),'manual'); assignee uuid;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_title is null or length(trim(p_title)) not between 3 and 180 or coalesce(length(p_description),0)>4000 then raise exception 'Valid task title and description required';end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Valid task priority required';end if;
  if not exists(select 1 from public.operational_task_sla_policies where task_type=ttype and active) then raise exception 'Active task SLA policy required';end if;
  if p_project is not null and not app_private.can_manage_project(p_project) then raise exception 'Project task permission required';end if;
  if p_project is null and p_organization is not null and not (app_private.ngo_admin(p_organization) or app_private.is_admin()) then raise exception 'Organization task permission required';end if;
  if p_project is null and p_organization is null and not app_private.is_admin() then raise exception 'FieldLance task permission required';end if;
  assignee:=case when p_assign_to_me then auth.uid() else null end;
  insert into public.operational_tasks(id,task_type,title,description,source_kind,source_ref,source_page,organization_id,project_id,assigned_to,priority,due_at,created_by)
  values(id,ttype,trim(p_title),trim(coalesce(p_description,'')),'manual',id::text,coalesce(nullif(trim(p_source_page),''),'Task Center'),p_organization,p_project,assignee,p_priority,app_private.task_due_at(ttype,p_due_at),auth.uid());
  insert into public.operational_task_events(task_id,actor_id,action,note,snapshot) values(id,auth.uid(),'created','Manual operational task created',jsonb_build_object('priority',p_priority));
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_organization,'operational_task_created',jsonb_build_object('task',id,'project',p_project,'type',ttype));
  return id;
end;$$;

create function public.update_operational_task(
  p_id uuid,p_version integer,p_action text,p_priority text default null,p_due_at timestamptz default null,p_note text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare t public.operational_tasks; next_status text; next_assignee uuid; action_note text:=trim(coalesce(p_note,''));
begin
  select * into t from public.operational_tasks where id=p_id for update;
  if not found or not app_private.can_manage_operational_task(t.task_type,t.organization_id,t.project_id,t.assigned_to,t.created_by) then raise exception 'Operational task permission required';end if;
  if t.version<>p_version then raise exception 'Task changed. Reload before updating.';end if;
  if p_action not in ('start','complete','reopen','cancel','assign_to_me','update') then raise exception 'Valid task action required';end if;
  next_status:=t.status; next_assignee:=t.assigned_to;
  if p_action='start' then if t.status<>'open' then raise exception 'Open task required';end if; next_status:='in_progress'; next_assignee:=coalesce(t.assigned_to,auth.uid());
  elsif p_action='complete' then if t.status not in ('open','in_progress') then raise exception 'Active task required';end if; next_status:='completed'; next_assignee:=coalesce(t.assigned_to,auth.uid());
  elsif p_action='reopen' then if t.status not in ('completed','cancelled') then raise exception 'Completed or cancelled task required';end if; next_status:='open';
  elsif p_action='cancel' then if t.status not in ('open','in_progress') then raise exception 'Active task required';end if; next_status:='cancelled';
  elsif p_action='assign_to_me' then if t.status not in ('open','in_progress') then raise exception 'Active task required';end if; next_assignee:=auth.uid();
  end if;
  update public.operational_tasks set
    status=next_status,assigned_to=next_assignee,
    priority=coalesce(p_priority,priority),due_at=coalesce(p_due_at,due_at),last_note=action_note,
    completed_by=case when next_status='completed' then auth.uid() else null end,
    completed_at=case when next_status='completed' then now() else null end,
    updated_at=now(),version=version+1
  where id=t.id;
  insert into public.operational_task_events(task_id,actor_id,action,note,snapshot)
  select id,auth.uid(),p_action,action_note,to_jsonb(x) from public.operational_tasks x where id=t.id;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),t.organization_id,'operational_task_'||p_action,jsonb_build_object('task',t.id,'source_kind',t.source_kind,'source_ref',t.source_ref));
end;$$;

create function public.refresh_operational_task_escalations()
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  with eligible as (
    select t.id,
      case when now()>=t.due_at+make_interval(hours=>p.escalation_level_3_hours) then 3
           when now()>=t.due_at+make_interval(hours=>p.escalation_level_2_hours) then 2
           when now()>t.due_at then 1 else 0 end as target
    from public.operational_tasks t join public.operational_task_sla_policies p on p.task_type=t.task_type
    where t.status in ('open','in_progress')
      and app_private.can_read_operational_task(t.task_type,t.organization_id,t.project_id,t.assigned_to,t.created_by)
  ), updated as (
    update public.operational_tasks t set escalation_level=e.target,updated_at=case when e.target<>t.escalation_level then now() else t.updated_at end
    from eligible e where t.id=e.id and t.escalation_level<>e.target returning t.id
  ) select count(*) into changed from updated;
  return changed;
end;$$;

create function public.operational_task_queue(
  p_view text default 'all',p_organization uuid default null,p_project uuid default null,p_limit integer default 200
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_view not in ('all','mine','team','due_today','overdue','escalated','completed') or p_limit not between 1 and 500 then raise exception 'Valid task queue filters required';end if;
  select jsonb_build_object(
    'rows',coalesce(jsonb_agg(to_jsonb(q) order by q.rank asc,q.due_at asc,q.created_at desc),'[]'::jsonb),
    'count',count(*)
  ) into result
  from (
    select t.*,
      case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end as rank,
      case when t.status in ('open','in_progress') and t.due_at<now() then true else false end as overdue,
      a.full_name as assignee_name,
      o.name as organization_name,
      p.title as project_title,
      s.label as sla_label
    from public.operational_tasks t
    join public.operational_task_sla_policies s on s.task_type=t.task_type
    left join public.accounts a on a.id=t.assigned_to
    left join public.organizations o on o.id=t.organization_id
    left join public.survey_projects p on p.id=t.project_id
    where app_private.can_read_operational_task(t.task_type,t.organization_id,t.project_id,t.assigned_to,t.created_by)
      and (p_organization is null or t.organization_id=p_organization)
      and (p_project is null or t.project_id=p_project)
      and (
        p_view='all'
        or (p_view='mine' and t.assigned_to=auth.uid() and t.status in ('open','in_progress'))
        or (p_view='team' and t.status in ('open','in_progress'))
        or (p_view='due_today' and t.status in ('open','in_progress') and t.due_at>=date_trunc('day',now()) and t.due_at<date_trunc('day',now())+interval '1 day')
        or (p_view='overdue' and t.status in ('open','in_progress') and t.due_at<now())
        or (p_view='escalated' and t.status in ('open','in_progress') and t.escalation_level>0)
        or (p_view='completed' and t.status='completed')
      )
    order by rank asc,t.due_at asc,t.created_at desc
    limit p_limit
  ) q;
  return result;
end;$$;

revoke all on function public.create_operational_task(text,text,text,uuid,uuid,text,timestamptz,text,boolean) from public,anon,authenticated;
revoke all on function public.update_operational_task(uuid,integer,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.refresh_operational_task_escalations() from public,anon,authenticated;
revoke all on function public.operational_task_queue(text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.create_operational_task(text,text,text,uuid,uuid,text,timestamptz,text,boolean) to authenticated;
grant execute on function public.update_operational_task(uuid,integer,text,text,timestamptz,text) to authenticated;
grant execute on function public.refresh_operational_task_escalations() to authenticated;
grant execute on function public.operational_task_queue(text,uuid,uuid,integer) to authenticated;

-- Backfill current actionable source rows without altering their authoritative workflow state.
insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,organization_id,assigned_role,priority,due_at,metadata)
select 'organization_application_review','Review organization application: '||a.organization_name,'Review submitted organization details and required evidence in the authoritative Organization application workflow.','partner_ngo_application',a.id::text,'NGO applications',a.organization_id,'ngo_manager','high',coalesce(a.submitted_at,a.updated_at)+interval '72 hours',jsonb_build_object('application_status',a.status)
from public.partner_ngo_applications a where a.status='submitted'
on conflict do nothing;

insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,assigned_role,priority,due_at,metadata)
select 'field_worker_profile_review','Review Field Worker profile','Review profile identity and verification evidence in the authoritative Field Worker workflow.','volunteer_profile',v.user_id::text,'Volunteers','volunteer_manager','high',v.updated_at+interval '48 hours',jsonb_build_object('profile_status',v.status)
from public.volunteer_profiles v where v.status='pending'
on conflict do nothing;

insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,organization_id,project_id,assigned_role,priority,due_at,metadata)
select 'field_worker_application_review','Review Field Worker application: '||a.volunteer_name,a.project_title||' — '||a.opportunity_title,'work_application',a.id::text,'Workforce marketplace',a.organization_id,a.survey_project_id,'organization_recruitment','normal',a.created_at+interval '48 hours',jsonb_build_object('application_status',a.status,'field_worker',a.volunteer_name)
from public.work_applications a where a.status in ('pending','shortlisted','selected')
on conflict do nothing;

insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,organization_id,project_id,assigned_to,assigned_role,priority,due_at,metadata)
select 'assignment_offer_response','Respond to assignment offer: '||a.project_title,'Review the formal assignment terms and accept or decline before field access becomes active.','work_assignment',a.id::text,'My Assigned Surveys',a.organization_id,a.survey_project_id,a.user_id,'field_worker','high',a.offered_at+interval '48 hours',jsonb_build_object('assignment_status',a.status)
from public.work_assignments a where a.status='offered'
on conflict do nothing;

insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,organization_id,project_id,assigned_to,assigned_role,priority,due_at,metadata)
select 'beneficiary_case_followup','Complete beneficiary case follow-up','Complete the scheduled follow-up in the beneficiary case workflow and record the outcome there.','beneficiary_case_followup',f.id::text,'Beneficiary cases',f.organization_id,f.project_id,f.created_by,'case_followup','high',(f.due_on::timestamp+interval '17 hours') at time zone 'UTC',jsonb_build_object('case_id',f.case_id,'followup_type',f.followup_type)
from public.beneficiary_case_followups f where f.status='scheduled'
on conflict do nothing;

insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,organization_id,project_id,assigned_role,priority,due_at,metadata)
select 'survey_response_review','Review submitted survey response','Review the submitted field response in Verification. Task completion does not approve or reject the response.','survey_response',r.id::text,'Verification',p.organization_id,r.project_id,'survey_manager','high',r.updated_at+interval '24 hours',jsonb_build_object('response_status',r.status,'collector_id',r.collector_id)
from public.survey_responses r join public.survey_projects p on p.id=r.project_id where r.status in ('submitted','correction_requested')
on conflict do nothing;

insert into public.operational_tasks(task_type,title,description,source_kind,source_ref,source_page,assigned_role,priority,due_at,metadata)
select 'withdrawal_operations_review','Review withdrawal request','Review provider state, approval and reconciliation in Withdrawal operations. Do not edit wallet balances directly.','e_wallet_withdrawal',w.id::text,'Withdrawal operations','finance_operations',case when w.status='failed' then 'urgent' else 'high' end,w.requested_at+interval '24 hours',jsonb_build_object('withdrawal_status',w.status,'provider',w.provider,'currency',w.currency,'amount',w.amount)
from public.e_wallet_withdrawals w where w.status in ('requested','approved','processing','failed')
on conflict do nothing;

revoke all on function app_private.sync_partner_ngo_review_task() from public,anon,authenticated;
revoke all on function app_private.sync_field_worker_profile_task() from public,anon,authenticated;
revoke all on function app_private.sync_work_application_task() from public,anon,authenticated;
revoke all on function app_private.sync_assignment_offer_task() from public,anon,authenticated;
revoke all on function app_private.sync_survey_review_task() from public,anon,authenticated;
revoke all on function app_private.sync_case_followup_task() from public,anon,authenticated;
revoke all on function app_private.sync_withdrawal_task() from public,anon,authenticated;

insert into public.operational_task_events(task_id,actor_id,action,note,snapshot)
select t.id,null,'backfilled','Task created from actionable source state during the 2.23.0 migration.',to_jsonb(t)
from public.operational_tasks t
where not exists(select 1 from public.operational_task_events e where e.task_id=t.id);
