-- FieldLance 2.24.0 — Notifications & Communication Center
-- Extends the existing recipient-only inbox with actionable metadata, preferences,
-- role/scoped broadcasts and task escalation notifications.
-- Email/push preferences are persisted for future provider integrations; this
-- migration does not call external email, push, SMS or WhatsApp providers.

create table public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 3 and 160),
  body text not null check(length(body) between 3 and 4000),
  audience_type text not null check(audience_type in ('all_active','field_workers','organization_admins','fieldlance_staff','organization_members','project_team')),
  organization_id uuid references public.organizations(id),
  project_id uuid references public.survey_projects(id),
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  action_page text check(action_page is null or length(action_page) between 2 and 120),
  action_label text check(action_label is null or length(action_label) between 2 and 80),
  created_by uuid not null references public.accounts(id),
  recipient_count integer not null default 0 check(recipient_count>=0),
  created_at timestamptz not null default now(),
  check((audience_type='organization_members' and organization_id is not null) or audience_type<>'organization_members'),
  check((audience_type='project_team' and project_id is not null) or audience_type<>'project_team')
);
create index notification_broadcast_created on public.notification_broadcasts(created_at desc,id desc);
create index notification_broadcast_org on public.notification_broadcasts(organization_id,created_at desc) where organization_id is not null;
create index notification_broadcast_project on public.notification_broadcasts(project_id,created_at desc) where project_id is not null;

alter table public.notifications
  add column category text not null default 'system' check(category in ('system','recruitment','assignment','survey','task','organization','case','finance','security','broadcast')),
  add column priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  add column action_page text check(action_page is null or length(action_page) between 2 and 120),
  add column action_label text check(action_label is null or length(action_label) between 2 and 80),
  add column organization_id uuid references public.organizations(id),
  add column project_id uuid references public.survey_projects(id),
  add column source_kind text check(source_kind is null or length(source_kind) between 2 and 80),
  add column source_ref text check(source_ref is null or length(source_ref) between 1 and 180),
  add column broadcast_id uuid references public.notification_broadcasts(id) on delete set null,
  add column archived_at timestamptz;

create index notification_user_unread on public.notifications(user_id,created_at desc,id desc) where read_at is null and archived_at is null;
create index notification_user_category on public.notifications(user_id,category,created_at desc,id desc) where archived_at is null;
create index notification_user_archive on public.notifications(user_id,archived_at desc,id desc) where archived_at is not null;

create table public.notification_preferences (
  user_id uuid primary key references public.accounts(id) on delete cascade,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  broadcasts_enabled boolean not null default true,
  recruitment_enabled boolean not null default true,
  assignments_enabled boolean not null default true,
  tasks_enabled boolean not null default true,
  surveys_enabled boolean not null default true,
  finance_enabled boolean not null default true,
  organization_enabled boolean not null default true,
  cases_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_broadcasts enable row level security;
alter table public.notification_preferences enable row level security;

create policy notification_preferences_read on public.notification_preferences
for select to authenticated using(user_id=auth.uid() and app_private.is_active());
create policy notification_broadcasts_read on public.notification_broadcasts
for select to authenticated using(
  created_by=auth.uid()
  or app_private.is_admin()
  or (organization_id is not null and app_private.ngo_admin(organization_id))
  or (project_id is not null and app_private.can_manage_project(project_id))
);

revoke all on public.notification_broadcasts,public.notification_preferences from anon,authenticated;
grant select on public.notification_broadcasts,public.notification_preferences to authenticated;
grant all on public.notification_broadcasts,public.notification_preferences to service_role;

create function app_private.notification_default_metadata()
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
  return new;
end;$$;

revoke all on function app_private.notification_default_metadata() from public,anon,authenticated;
create trigger notification_default_metadata before insert on public.notifications
for each row execute function app_private.notification_default_metadata();

-- Apply the same categorization to historical inbox rows without changing their read state.
update public.notifications set
  category=case
    when lower(title||' '||body) like '%withdraw%' or lower(title||' '||body) like '%payable%' or lower(title||' '||body) like '%contract amendment%' then 'finance'
    when lower(title||' '||body) like '%assignment%' then 'assignment'
    when lower(title||' '||body) like '%application%' or lower(title||' '||body) like '%invitation%' or lower(title||' '||body) like '%recruit%' then 'recruitment'
    when lower(title||' '||body) like '%survey%' then 'survey'
    when lower(title||' '||body) like '%partner ngo%' or lower(title||' '||body) like '%organization%' then 'organization'
    when lower(title||' '||body) like '%beneficiary%' or lower(title||' '||body) like '%assistance%' or lower(title||' '||body) like '%case%' then 'case'
    when lower(title||' '||body) like '%verification%' or lower(title||' '||body) like '%access%' then 'security'
    else category end;

create function public.notification_center(
  p_filter text default 'all',p_offset integer default 0,p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; total_count integer; unread_count integer;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_filter not in ('all','unread','task','recruitment','finance','broadcast','archived') then raise exception 'Valid notification filter required';end if;
  if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Valid paging required';end if;
  select count(*),count(*) filter(where read_at is null and archived_at is null) into total_count,unread_count
  from public.notifications where user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into items
  from (
    select * from public.notifications n
    where n.user_id=auth.uid()
      and case p_filter
        when 'archived' then n.archived_at is not null
        when 'unread' then n.archived_at is null and n.read_at is null
        when 'task' then n.archived_at is null and n.category='task'
        when 'recruitment' then n.archived_at is null and n.category in ('recruitment','assignment')
        when 'finance' then n.archived_at is null and n.category='finance'
        when 'broadcast' then n.archived_at is null and n.category='broadcast'
        else n.archived_at is null end
    order by n.created_at desc,n.id desc offset p_offset limit p_limit
  ) q;
  return jsonb_build_object('items',items,'total',total_count,'unread',unread_count,'offset',p_offset,'limit',p_limit);
end;$$;

create function public.mark_all_notifications_read() returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null and archived_at is null;
  get diagnostics changed=row_count; return changed;
end;$$;

create function public.archive_notification(p_id bigint,p_archived boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  update public.notifications set archived_at=case when p_archived then coalesce(archived_at,now()) else null end,
    read_at=case when p_archived then coalesce(read_at,now()) else read_at end
  where id=p_id and user_id=auth.uid();
  if not found then raise exception 'Notification not found';end if;
end;$$;

create function public.save_notification_preferences(
  p_email boolean,p_push boolean,p_broadcasts boolean,p_recruitment boolean,p_assignments boolean,p_tasks boolean,p_surveys boolean,p_finance boolean,p_organization boolean,p_cases boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  insert into public.notification_preferences(user_id,email_enabled,push_enabled,broadcasts_enabled,recruitment_enabled,assignments_enabled,tasks_enabled,surveys_enabled,finance_enabled,organization_enabled,cases_enabled,updated_at)
  values(auth.uid(),p_email,p_push,p_broadcasts,p_recruitment,p_assignments,p_tasks,p_surveys,p_finance,p_organization,p_cases,now())
  on conflict(user_id) do update set email_enabled=excluded.email_enabled,push_enabled=excluded.push_enabled,broadcasts_enabled=excluded.broadcasts_enabled,recruitment_enabled=excluded.recruitment_enabled,assignments_enabled=excluded.assignments_enabled,tasks_enabled=excluded.tasks_enabled,surveys_enabled=excluded.surveys_enabled,finance_enabled=excluded.finance_enabled,organization_enabled=excluded.organization_enabled,cases_enabled=excluded.cases_enabled,updated_at=now();
end;$$;

create function public.publish_notification_broadcast(
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
    insert into public.notifications(user_id,title,body,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref,broadcast_id)
    select id,trim(p_title),trim(p_body),'broadcast',p_priority,nullif(trim(coalesce(p_action_page,'')),''),nullif(trim(coalesce(p_action_label,'')),''),p_organization,p_project,'broadcast',bid::text,bid from target
    returning 1
  ) select count(*) into recipients from ins;
  update public.notification_broadcasts set recipient_count=recipients where id=bid;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_organization,'notification_broadcast_published',jsonb_build_object('broadcast',bid,'audience',p_audience,'project',p_project,'recipients',recipients));
  return bid;
end;$$;

create function app_private.notify_task_event() returns trigger language plpgsql security definer set search_path='' as $$
declare heading text; body_text text; target record;
begin
  if tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to then
    heading:='Task assigned'; body_text:=new.title;
  elsif new.escalation_level>old.escalation_level then
    heading:='Task escalated'; body_text:=new.title||' · escalation level '||new.escalation_level::text;
  else return new; end if;

  if new.assigned_to is not null then
    insert into public.notifications(user_id,title,body,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
    values(new.assigned_to,heading,body_text,'task',case when new.escalation_level>=2 then 'urgent' when new.priority in ('high','urgent') then new.priority else 'high' end,'Task Center','Open task',new.organization_id,new.project_id,'operational_task',new.id::text);
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
      insert into public.notifications(user_id,title,body,category,priority,action_page,action_label,organization_id,project_id,source_kind,source_ref)
      values(target.id,heading,body_text,'task',case when new.escalation_level>=2 then 'urgent' when new.priority in ('high','urgent') then new.priority else 'high' end,'Task Center','Open task',new.organization_id,new.project_id,'operational_task',new.id::text);
    end loop;
  end if;
  return new;
end;$$;
revoke all on function app_private.notify_task_event() from public,anon,authenticated;
create trigger operational_task_notification after insert or update of assigned_to,escalation_level on public.operational_tasks
for each row execute function app_private.notify_task_event();

revoke all on function public.notification_center(text,integer,integer),public.mark_all_notifications_read(),public.archive_notification(bigint,boolean),public.save_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean),public.publish_notification_broadcast(text,text,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.notification_center(text,integer,integer),public.mark_all_notifications_read(),public.archive_notification(bigint,boolean),public.save_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean),public.publish_notification_broadcast(text,text,text,uuid,uuid,text,text,text) to authenticated;
