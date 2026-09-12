-- Human-reviewed needs. No eligibility inference or automatic claim of impact.
create table public.beneficiary_needs (
 id uuid primary key,project_id uuid not null references public.survey_projects(id),person_id uuid not null references public.registry_persons(id),
 source_response_id uuid not null references public.survey_responses(id),source_response_version integer not null,
 category text not null check(category in ('food','education','health','housing','livelihood','other')),
 description text not null,priority text not null check(priority in ('low','medium','high')),
 status text not null default 'open' check(status in ('open','in_progress','met','closed','needs_review')),
 follow_up_on date,version integer not null default 1,last_reason text not null,
 identity_snapshot jsonb not null,creation_request jsonb not null,
 created_by uuid not null references public.accounts(id),created_at timestamptz not null default now(),
 updated_by uuid not null references public.accounts(id),updated_at timestamptz not null default now()
);
create index needs_project_status on public.beneficiary_needs(project_id,status,follow_up_on,id);
create index needs_person on public.beneficiary_needs(person_id,created_at desc,id);
create table public.need_revisions (
 need_id uuid not null references public.beneficiary_needs(id),version integer not null,snapshot jsonb not null,
 recorded_at timestamptz not null default now(),primary key(need_id,version)
);
create table public.need_assistance_links (
 need_id uuid not null references public.beneficiary_needs(id),assistance_id uuid not null references public.assistance_entries(id),
 active boolean not null default true,version integer not null default 1,reason text not null,
 updated_by uuid not null references public.accounts(id),updated_at timestamptz not null default now(),primary key(need_id,assistance_id)
);
create index need_link_assistance on public.need_assistance_links(assistance_id,need_id);
create table public.need_link_revisions (
 need_id uuid not null,assistance_id uuid not null,version integer not null,snapshot jsonb not null,
 recorded_at timestamptz not null default now(),primary key(need_id,assistance_id,version),
 foreign key(need_id,assistance_id) references public.need_assistance_links(need_id,assistance_id)
);
create function app_private.capture_need_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.need_revisions(need_id,version,snapshot) values(new.id,new.version,to_jsonb(new));return new;end;$$;
create trigger need_revision after insert or update on public.beneficiary_needs for each row execute function app_private.capture_need_revision();
create function app_private.capture_need_link_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.need_link_revisions(need_id,assistance_id,version,snapshot) values(new.need_id,new.assistance_id,new.version,to_jsonb(new));return new;end;$$;
create trigger need_link_revision after insert or update on public.need_assistance_links for each row execute function app_private.capture_need_link_revision();
create function public.create_beneficiary_need(p_id uuid,p_response uuid,p_category text,p_description text,p_priority text,p_follow_up date,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare response public.survey_responses;person public.registry_persons;existing public.beneficiary_needs;request jsonb;org uuid;
begin
 select * into response from public.survey_responses where id=p_response;
 if not found or not app_private.can_review_survey(response.project_id) then raise exception 'Needs review permission required';end if;
 select organization_id into org from public.survey_projects where id=response.project_id for update;
 if not exists(select 1 from public.organizations where id=org and status='active') then raise exception 'Active NGO required for a new assessment';end if;
 if p_id is null then raise exception 'Request ID required';end if;
 request:=jsonb_build_object('response',p_response,'category',p_category,'description',trim(p_description),'priority',p_priority,'follow_up',p_follow_up,'reason',trim(p_reason));
 select * into existing from public.beneficiary_needs where id=p_id;
 if found then
 if existing.created_by=auth.uid() and existing.creation_request=request then return p_id;end if;
 raise exception 'Request ID already used with different details';end if;
 select * into response from public.survey_responses where id=p_response for update;
 if response.status<>'approved' then raise exception 'Approved source survey required';end if;
 if p_category is null or p_category not in ('food','education','health','housing','livelihood','other') or p_description is null or length(trim(p_description)) not between 5 and 1000 or p_priority is null or p_priority not in ('low','medium','high') or p_reason is null or length(trim(p_reason)) not between 5 and 1000 or (p_follow_up is not null and (not isfinite(p_follow_up) or p_follow_up<'1900-01-01'::date)) then raise exception 'Valid category, description, priority, follow-up date and assessment reason required';end if;
 select * into person from public.registry_persons where id=response.person_id;
 insert into public.beneficiary_needs(id,project_id,person_id,source_response_id,source_response_version,category,description,priority,follow_up_on,last_reason,identity_snapshot,creation_request,created_by,updated_by)
 values(p_id,response.project_id,response.person_id,p_response,response.version,p_category,trim(p_description),p_priority,p_follow_up,trim(p_reason),to_jsonb(person),request,auth.uid(),auth.uid());
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'need_created',jsonb_build_object('id',p_id,'person',response.person_id,'source_response',p_response));return p_id;
end;$$;
create function public.update_beneficiary_need(p_id uuid,p_description text,p_priority text,p_status text,p_follow_up date,p_reason text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare need public.beneficiary_needs;org uuid;
begin
 select * into need from public.beneficiary_needs where id=p_id;
 if not found or not app_private.can_review_survey(need.project_id) then raise exception 'Needs review permission required';end if;
 -- Consistent lock order: assistance entries, then need. Void trigger uses this order too.
 perform a.id from public.assistance_entries a join public.need_assistance_links l on l.assistance_id=a.id where l.need_id=p_id and l.active order by a.id for update of a;
 select * into need from public.beneficiary_needs where id=p_id for update;
 if need.version is distinct from p_version then raise exception 'Need changed. Reload before saving.';end if;
 if p_description is null or length(trim(p_description)) not between 5 and 1000 or p_priority is null or p_priority not in ('low','medium','high') or p_status is null or p_status not in ('open','in_progress','met','closed','needs_review') or p_reason is null or length(trim(p_reason)) not between 5 and 1000 or (p_follow_up is not null and (not isfinite(p_follow_up) or p_follow_up<'1900-01-01'::date)) then raise exception 'Valid details, status, follow-up date and review reason required';end if;
 if p_status='met' and (not exists(select 1 from public.need_assistance_links l join public.assistance_entries a on a.id=l.assistance_id where l.need_id=p_id and l.active and a.status='recorded') or exists(select 1 from public.need_assistance_links l join public.assistance_entries a on a.id=l.assistance_id where l.need_id=p_id and l.active and a.status='void')) then raise exception 'Met requires recorded linked assistance. Remove voided links before confirming.';end if;
 if need.description=trim(p_description) and need.priority=p_priority and need.status=p_status and need.follow_up_on is not distinct from p_follow_up then raise exception 'No changes supplied';end if;
 update public.beneficiary_needs set description=trim(p_description),priority=p_priority,status=p_status,follow_up_on=p_follow_up,last_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 select organization_id into org from public.survey_projects where id=need.project_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'need_updated',jsonb_build_object('id',p_id,'previous_version',p_version,'status',p_status));
end;$$;
create function public.set_need_assistance_link(p_need uuid,p_assistance uuid,p_active boolean,p_reason text,p_need_version integer,p_link_version integer) returns void language plpgsql security definer set search_path='' as $$
declare need public.beneficiary_needs;entry public.assistance_entries;link public.need_assistance_links;org uuid;
begin
 select * into need from public.beneficiary_needs where id=p_need;
 if not found or not app_private.can_review_survey(need.project_id) then raise exception 'Needs review permission required';end if;
 select * into entry from public.assistance_entries where id=p_assistance and project_id=need.project_id and person_id=need.person_id for update;
 if not found then raise exception 'Assistance must belong to the same person and project';end if;
 select * into need from public.beneficiary_needs where id=p_need for update;
 select * into link from public.need_assistance_links where need_id=p_need and assistance_id=p_assistance for update;
 if need.version is distinct from p_need_version or coalesce(link.version,0) is distinct from p_link_version then raise exception 'Need or link changed. Reload before saving.';end if;
 if p_active is null or p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Link decision and reason required';end if;
 if need.status='closed' then raise exception 'Reopen a closed need before changing links';end if;
 if p_active and entry.status<>'recorded' then raise exception 'Cannot link voided assistance';end if;
 if (link.version is null and not p_active) or link.active is not distinct from p_active then raise exception 'No link change supplied';end if;
 insert into public.need_assistance_links(need_id,assistance_id,active,reason,updated_by) values(p_need,p_assistance,p_active,trim(p_reason),auth.uid())
 on conflict(need_id,assistance_id) do update set active=excluded.active,reason=excluded.reason,version=public.need_assistance_links.version+1,updated_by=auth.uid(),updated_at=now();
 update public.beneficiary_needs set status=case when not p_active and status='met' then 'needs_review' when p_active and status='open' then 'in_progress' else status end,version=version+1,last_reason=case when p_active then 'Assistance linked: ' else 'Assistance unlinked: ' end||trim(p_reason),updated_by=auth.uid(),updated_at=now() where id=p_need;
 select organization_id into org from public.survey_projects where id=need.project_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'need_assistance_link_changed',jsonb_build_object('need',p_need,'assistance',p_assistance,'active',p_active,'previous_need_version',p_need_version));
end;$$;
create function app_private.review_needs_on_assistance_void() returns trigger language plpgsql security definer set search_path='' as $$
declare nid uuid;org uuid;
begin
 if old.status='recorded' and new.status='void' then
  select organization_id into org from public.survey_projects where id=new.project_id;
  for nid in select n.id from public.beneficiary_needs n join public.need_assistance_links l on l.need_id=n.id where l.assistance_id=new.id and l.active and n.status<>'closed' order by n.id for update of n loop
   update public.beneficiary_needs set status='needs_review',version=version+1,last_reason='Linked assistance was voided; reassess this need.',updated_by=new.voided_by,updated_at=now() where id=nid;
   insert into public.audit_events(actor_id,organization_id,action,detail) values(new.voided_by,org,'need_review_required',jsonb_build_object('need',nid,'voided_assistance',new.id));
  end loop;
 end if;return new;
end;$$;
create trigger needs_on_assistance_void after update of status on public.assistance_entries for each row execute function app_private.review_needs_on_assistance_void();
create function public.project_needs_summary(p_project uuid,p_person uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.can_review_survey(p_project) then raise exception 'Needs review permission required';end if;
 if p_person is not null and not exists(select 1 from public.registry_persons where id=p_person and project_id=p_project) then raise exception 'Person not found in project';end if;
 select jsonb_build_object('utc_today',(now() at time zone 'UTC')::date,'total',count(*),'people',count(distinct person_id),'open',count(*) filter(where status='open'),'in_progress',count(*) filter(where status='in_progress'),'met',count(*) filter(where status='met'),'closed',count(*) filter(where status='closed'),'needs_review',count(*) filter(where status='needs_review'),'overdue',count(*) filter(where status in ('open','in_progress','needs_review') and follow_up_on<(now() at time zone 'UTC')::date),'high_priority_pending',count(*) filter(where priority='high' and status in ('open','in_progress','needs_review'))) into result from public.beneficiary_needs where project_id=p_project and (p_person is null or person_id=p_person);
 return result;
end;$$;
alter table public.beneficiary_needs enable row level security;
alter table public.need_revisions enable row level security;
alter table public.need_assistance_links enable row level security;
alter table public.need_link_revisions enable row level security;
create policy need_read on public.beneficiary_needs for select to authenticated using(app_private.can_review_survey(project_id));
create policy need_revision_read on public.need_revisions for select to authenticated using(exists(select 1 from public.beneficiary_needs n where n.id=need_id));
create policy need_link_read on public.need_assistance_links for select to authenticated using(exists(select 1 from public.beneficiary_needs n where n.id=need_id));
create policy need_link_revision_read on public.need_link_revisions for select to authenticated using(exists(select 1 from public.beneficiary_needs n where n.id=need_id));
revoke all on public.beneficiary_needs,public.need_revisions,public.need_assistance_links,public.need_link_revisions from anon,authenticated;
grant select on public.beneficiary_needs,public.need_revisions,public.need_assistance_links,public.need_link_revisions to authenticated;
grant all on public.beneficiary_needs,public.need_revisions,public.need_assistance_links,public.need_link_revisions to service_role;
revoke all on function app_private.capture_need_revision(),app_private.capture_need_link_revision(),app_private.review_needs_on_assistance_void() from public,anon,authenticated;
revoke all on function public.create_beneficiary_need(uuid,uuid,text,text,text,date,text),public.update_beneficiary_need(uuid,text,text,text,date,text,integer),public.set_need_assistance_link(uuid,uuid,boolean,text,integer,integer),public.project_needs_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_beneficiary_need(uuid,uuid,text,text,text,date,text),public.update_beneficiary_need(uuid,text,text,text,date,text,integer),public.set_need_assistance_link(uuid,uuid,boolean,text,integer,integer),public.project_needs_summary(uuid,uuid) to authenticated;
