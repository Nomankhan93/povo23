create function app_private.analytics_finance_rows()
returns table(id uuid,kind text,organization_id uuid,project_id uuid,geography_id uuid,label text,state text,created_at timestamptz,subject_id uuid,due_on date,amount numeric,currency text)
language sql stable security definer set search_path='' as $$
select a.id,'payables'::text,p.organization_id,p.id,p.geography_id,'Payable unit'::text,case when a.eligible then 'eligible' else 'ineligible' end,a.created_at,null::uuid,null::date,null::numeric,null::text from public.work_payable_units a join public.work_assignments w on w.id=a.assignment_id join public.survey_projects p on p.id=w.survey_project_id where app_private.can_manage_project_funding(p.id)
 union all
select a.id,'finance'::text,p.organization_id,p.id,p.geography_id,'Payable journal event'::text,a.kind,a.created_at,null::uuid,null::date,a.amount,u.currency from public.work_payable_events a join public.work_payable_units u on u.id=a.unit_id join public.work_assignments w on w.id=a.assignment_id join public.survey_projects p on p.id=w.survey_project_id where app_private.can_manage_project_funding(p.id);
$$;
revoke all on function app_private.analytics_finance_rows() from public,anon;
grant execute on function app_private.analytics_finance_rows() to authenticated;

-- FieldLance 2.31.0: exact operational reporting over caller-visible rows.
-- No materialized balances, beneficiary identities, answers, or private files are exported.
create function app_private.analytics_rows(p_org uuid,p_project uuid,p_geo uuid,p_from date,p_to date)
returns table(id uuid,kind text,organization_id uuid,project_id uuid,geography_id uuid,label text,state text,created_at timestamptz,subject_id uuid,due_on date,amount numeric,currency text)
language sql stable security invoker set search_path='' as $$
 select r.* from (
select p.id,'projects'::text as kind,p.organization_id,p.id as project_id,p.geography_id,p.title as label,p.status as state,p.created_at,null::uuid as subject_id,null::date as due_on,null::numeric as amount,null::text as currency from public.survey_projects p where app_private.can_read_project(p.id)
 union all
select r.id,'responses'::text,p.organization_id,p.id,r.collection_geography_id,'Survey response'::text,r.status,r.created_at,null::uuid,null::date,null::numeric,null::text from public.survey_responses r join public.survey_projects p on p.id=r.project_id where app_private.can_review_project_area(p.id,r.collection_geography_id)
 union all
select a.id,'applications'::text,p.organization_id,p.id,p.geography_id,a.volunteer_name,a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.work_applications a join public.survey_projects p on p.id=a.survey_project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'assignments'::text,p.organization_id,p.id,p.geography_id,a.volunteer_name,a.status,a.created_at,a.user_id,null::date,null::numeric,null::text from public.work_assignments a join public.survey_projects p on p.id=a.survey_project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'opportunities'::text,p.organization_id,p.id,p.geography_id,a.title,case when a.publication_state='published' and a.status='open' and a.applications_open then 'open' else 'not_open' end,a.created_at,null::uuid,null::date,null::numeric,null::text from public.work_opportunities a join public.survey_projects p on p.id=a.survey_project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'cases'::text,p.organization_id,p.id,a.geography_id,'Case '||a.case_no,a.status,a.created_at,null::uuid,a.follow_up_on,null::numeric,null::text from public.beneficiary_cases a join public.survey_projects p on p.id=a.project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'assistance'::text,p.organization_id,p.id,p.geography_id,a.category||' assistance',a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.assistance_entries a join public.survey_projects p on p.id=a.project_id where app_private.can_manage_project(p.id)
 union all
select * from app_private.analytics_finance_rows()
 union all
select a.id,'organizations'::text,a.id,null::uuid,null::uuid,a.name,a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.organizations a where true
 union all
select a.id,'organization_applications'::text,null::uuid,null::uuid,null::uuid,'Organization application'::text,a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.partner_ngo_applications a where true
 union all
select a.user_id,'profiles'::text,null::uuid,null::uuid,null::uuid,'Field Worker profile'::text,a.status,a.updated_at,null::uuid,null::date,null::numeric,null::text from public.volunteer_profiles a where true
 ) r where (p_org is null or r.organization_id=p_org)
 and (p_project is null or r.project_id=p_project)
 and (p_geo is null or app_private.geo_contains(p_geo,r.geography_id))
 and (p_from is null or r.created_at >= (p_from::timestamp at time zone 'UTC'))
 and (p_to is null or r.created_at < ((p_to+1)::timestamp at time zone 'UTC'));
$$;
revoke all on function app_private.analytics_rows(uuid,uuid,uuid,date,date) from public,anon;
grant execute on function app_private.analytics_rows(uuid,uuid,uuid,date,date) to authenticated;

create function app_private.record_analytics_export(p_filters jsonb,p_count integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_active() or p_count not between 0 and 5000 then raise exception 'Invalid export audit';end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'analytics_export_requested',jsonb_build_object('filters',p_filters,'rows',p_count));
end;$$;
revoke all on function app_private.record_analytics_export(jsonb,integer) from public,anon;
grant execute on function app_private.record_analytics_export(jsonb,integer) to authenticated;

create function app_private.analytics_withdrawal_attention()
returns bigint language sql stable security definer set search_path='' as $$
 select case when app_private.can_manage_finance() then (select count(*) from public.e_wallet_withdrawals where status in ('requested','approved','processing','failed')) else null end;
$$;
revoke all on function app_private.analytics_withdrawal_attention() from public,anon;
grant execute on function app_private.analytics_withdrawal_attention() to authenticated;

create function public.operational_report(
 p_org uuid default null,p_project uuid default null,p_geo uuid default null,
 p_from date default null,p_to date default null,p_kind text default null,
 p_status text default null,p_offset integer default 0,p_export boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare role_name text;allowed text[]:=array[]::text[];data jsonb;export_count integer;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select platform_role into role_name from public.accounts where id=auth.uid();
 if p_project is not null then
   if not (app_private.can_manage_project(p_project) or app_private.project_staff_active(p_project,null)) then raise exception 'Project reporting permission required';end if;
   if p_org is not null and not exists(select 1 from public.survey_projects where id=p_project and organization_id=p_org) then raise exception 'Project and organization do not match';end if;
   allowed:=array['projects','responses'];
   if app_private.can_manage_project(p_project) then allowed:=allowed||array['applications','assignments','opportunities','cases','assistance'];end if;
   if exists(select 1 from public.survey_projects p where p.id=p_project and (app_private.is_admin() or app_private.ngo_admin(p.organization_id))) then allowed:=allowed||array['payables','finance'];end if;
 elsif p_org is not null then
   if not (app_private.ngo_admin(p_org) or app_private.can_manage_surveys()) then raise exception 'Organization reporting permission required';end if;
   allowed:=array['organizations','projects','responses','applications','assignments','opportunities','cases','assistance'];
   if app_private.ngo_admin(p_org) or app_private.is_admin() then allowed:=allowed||array['payables','finance'];end if;
 else
   if role_name not in ('super_admin','admin','survey_manager','ngo_manager','volunteer_manager','auditor') then raise exception 'Staff reporting permission required';end if;
   allowed:=array['organizations','projects'];
   if app_private.can_manage_surveys() then allowed:=allowed||array['responses','applications','assignments','opportunities','cases','assistance'];end if;
   if role_name in ('super_admin','admin','ngo_manager') then allowed:=allowed||array['organization_applications'];end if;
   if role_name in ('super_admin','admin','volunteer_manager') then allowed:=allowed||array['profiles'];end if;
   if app_private.is_admin() then allowed:=allowed||array['payables','finance'];end if;
 end if;
 if p_kind is not null and not p_kind=any(allowed) then raise exception 'Report permission required';end if;
 if p_export and p_kind is null then raise exception 'Choose a report to export';end if;
 if p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'Invalid page offset';end if;
 if (p_from is not null and (not isfinite(p_from) or p_from<'1900-01-01' or p_from>'2200-01-01')) or
    (p_to is not null and (not isfinite(p_to) or p_to<'1900-01-01' or p_to>'2200-01-01')) or
    (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid date range';end if;
 if p_geo is not null and not exists(select 1 from public.geographies where id=p_geo) then raise exception 'Unknown geography';end if;
 with all_rows as materialized (
   select * from app_private.analytics_rows(p_org,p_project,p_geo,p_from,p_to) where kind=any(allowed)
 ), groups as (
   select kind,state,count(*) n from all_rows group by kind,state
 ), selected as materialized (
   select * from all_rows where kind=p_kind and (p_status is null or state=p_status or
     (p_status='__active' and kind='cases' and state not in ('closed','cancelled')) or
     (p_status='__progress' and kind='applications' and state in ('pending','shortlisted','selected')) or
     (p_status='__review' and kind='responses' and state in ('submitted','correction_required')) or
     (p_status='__due' and kind='cases' and state not in ('closed','cancelled') and due_on<=(now() at time zone 'UTC')::date))
 ), page as (
   select * from selected order by created_at desc,id desc limit (case when p_export then 5001 else 50 end) offset (case when p_export then 0 else p_offset end)
 ), monthly as (
   select to_char(created_at at time zone 'UTC','YYYY-MM') as month,state,count(*) n from selected group by 1,2
 ), money as (
   select currency,state,sum(amount)::text amount from selected where kind='finance' group by currency,state
 )
 select jsonb_build_object(
   'allowed_kinds',to_jsonb(allowed),'as_of',now(),'timezone','UTC',
   'counts',coalesce((select jsonb_object_agg(kind||'.'||state,n) from groups),'{}'::jsonb),
   'totals',coalesce((select jsonb_object_agg(kind,n) from (select kind,count(*) n from all_rows group by kind) x),'{}'::jsonb),
   'active_workers',(select count(distinct subject_id) from all_rows where kind='assignments' and state='active'),
   'due_cases',(select count(*) from all_rows where kind='cases' and state not in ('closed','cancelled') and due_on<=(now() at time zone 'UTC')::date),
   'withdrawal_attention',case when p_org is null and p_project is null then app_private.analytics_withdrawal_attention() else null end,
   'total',(select count(*) from selected),'offset',case when p_export then 0 else p_offset end,
   'rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'project_id',r.project_id,'project_name',p.title,'organization_name',o.name,'geography_name',g.name,'label',r.label,'status',r.state,'created_at',r.created_at,'due_on',r.due_on,'amount',r.amount::text,'currency',r.currency) order by r.created_at desc,r.id desc) from page r left join public.survey_projects p on p.id=r.project_id left join public.organizations o on o.id=r.organization_id left join public.geographies g on g.id=r.geography_id),'[]'::jsonb),
   'trend',coalesce((select jsonb_agg(to_jsonb(t) order by month,state) from monthly t),'[]'::jsonb),
   'money',coalesce((select jsonb_agg(to_jsonb(t) order by currency,state) from money t),'[]'::jsonb)
 ) into data;
 if p_export then
   export_count:=(data->>'total')::integer;
   if export_count>5000 then raise exception 'Export exceeds 5000 rows; narrow the filters';end if;
   perform app_private.record_analytics_export(jsonb_build_object('organization',p_org,'project',p_project,'geography',p_geo,'from',p_from,'to',p_to,'kind',p_kind,'status',p_status),export_count);
 end if;
 return data;
end;$$;
revoke all on function public.operational_report(uuid,uuid,uuid,date,date,text,text,integer,boolean) from public,anon;
grant execute on function public.operational_report(uuid,uuid,uuid,date,date,text,text,integer,boolean) to authenticated;

create index survey_response_report_created on public.survey_responses(project_id,created_at,id);
create index case_report_created on public.beneficiary_cases(project_id,created_at,id);
