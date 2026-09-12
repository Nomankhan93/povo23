-- Stabilization: preserve prior migration files and existing record history.
create or replace function public.set_survey_assignment(p_project uuid,p_user uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
 declare org uuid;
 begin
 if not app_private.can_review_survey(p_project) then raise exception 'Project management permission required';end if;
 select organization_id into org from public.survey_projects where id=p_project for update;
 if not found or p_active is null then raise exception 'Project and assignment decision required';end if;
 if p_active and not exists(select 1 from public.survey_projects where id=p_project and status='active') then raise exception 'Active project required for assignment';end if;
 if p_active and not exists(select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.id=p_user and a.status='active' and v.status='verified' and exists(select 1 from public.profile_shares s where s.user_id=a.id and s.organization_id=org)) then raise exception 'Assign an active verified volunteer sharing with the project NGO';end if;
 insert into public.survey_assignments(project_id,user_id,active) values(p_project,p_user,p_active) on conflict(project_id,user_id) do update set active=excluded.active;
 insert into public.notifications(user_id,title,body) values(p_user,'Survey assignment updated','Open Survey projects to see your assigned field work.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,org,'survey_assignment_changed',jsonb_build_object('project',p_project,'active',p_active));
 end;$$;

create or replace function public.set_membership(p_org uuid,p_user uuid,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not app_private.is_admin() then raise exception 'Membership permission required: POEM Admin or Super Admin must authorize memberships'; end if;
 if p_role not in ('ngo_admin','member') or p_status not in ('active','suspended') then raise exception 'Invalid membership'; end if;
 insert into public.organization_memberships(organization_id,user_id,role,status) values(p_org,p_user,p_role,p_status) on conflict(organization_id,user_id) do update set role=excluded.role,status=excluded.status;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,p_org,'membership_changed',jsonb_build_object('role',p_role,'status',p_status));
 end; $$;

-- Existing cross-scope inconsistencies abort this migration rather than silently moving records.
alter table public.registry_households add constraint households_id_project_unique unique(id,project_id);
alter table public.registry_persons add constraint persons_id_project_unique unique(id,project_id);
alter table public.registry_persons add constraint person_household_scope foreign key(household_id,project_id) references public.registry_households(id,project_id);
alter table public.survey_responses add constraint response_person_scope foreign key(person_id,project_id) references public.registry_persons(id,project_id);
alter table public.survey_responses add constraint response_id_project_person_unique unique(id,project_id,person_id);
alter table public.assistance_entries add constraint assistance_person_scope foreign key(person_id,project_id) references public.registry_persons(id,project_id);
alter table public.assistance_entries add constraint assistance_id_project_person_unique unique(id,project_id,person_id);
alter table public.beneficiary_needs add constraint need_person_scope foreign key(person_id,project_id) references public.registry_persons(id,project_id);
alter table public.beneficiary_needs add constraint need_source_scope foreign key(source_response_id,project_id,person_id) references public.survey_responses(id,project_id,person_id);
alter table public.beneficiary_needs add constraint need_id_project_person_unique unique(id,project_id,person_id);
alter table public.registry_match_decisions add constraint match_a_scope foreign key(person_a,project_id) references public.registry_persons(id,project_id);
alter table public.registry_match_decisions add constraint match_b_scope foreign key(person_b,project_id) references public.registry_persons(id,project_id);
alter table public.need_assistance_links add column project_id uuid,add column person_id uuid;
alter table public.need_assistance_links disable trigger need_link_revision;
update public.need_assistance_links l set project_id=n.project_id,person_id=n.person_id from public.beneficiary_needs n where n.id=l.need_id;
alter table public.need_assistance_links enable trigger need_link_revision;
alter table public.need_assistance_links alter column project_id set not null,alter column person_id set not null;
alter table public.need_assistance_links add constraint link_need_scope foreign key(need_id,project_id,person_id) references public.beneficiary_needs(id,project_id,person_id);
alter table public.need_assistance_links add constraint link_assistance_scope foreign key(assistance_id,project_id,person_id) references public.assistance_entries(id,project_id,person_id);
create function app_private.populate_need_link_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select n.project_id,n.person_id into new.project_id,new.person_id from public.beneficiary_needs n where n.id=new.need_id;
 return new;
end;$$;
create trigger need_link_scope before insert on public.need_assistance_links for each row execute function app_private.populate_need_link_scope();
revoke all on function app_private.populate_need_link_scope() from public,anon,authenticated;
create index responses_person_collector on public.survey_responses(person_id,collector_id);
create index responses_project_collector_time on public.survey_responses(project_id,collector_id,created_at desc,id);
create index persons_household on public.registry_persons(household_id);

-- Require an explicit request key. The legacy implementation is callable only by the guarded wrapper.
alter function public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer) set schema app_private;
alter function app_private.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer) rename to save_survey_response_v21;
revoke all on function app_private.save_survey_response_v21(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer) from public,anon,authenticated;
create table public.survey_save_receipts(
 actor_id uuid not null references public.accounts(id),request_id uuid not null,
 project_id uuid not null references public.survey_projects(id),response_id uuid not null references public.survey_responses(id),
 payload_hash text not null,response_version integer not null,created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
alter table public.survey_save_receipts enable row level security;
create policy receipt_read on public.survey_save_receipts for select to authenticated using(actor_id=auth.uid() and app_private.can_read_project(project_id));
revoke all on public.survey_save_receipts from anon,authenticated;
grant select on public.survey_save_receipts to authenticated;
grant all on public.survey_save_receipts to service_role;
create function public.save_survey_response(p_id uuid,p_project uuid,p_person uuid,p_household uuid,p_name text,p_birth date,p_household_label text,p_answers jsonb,p_consent jsonb,p_submit boolean,p_version integer,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare receipt public.survey_save_receipts;fingerprint text;result uuid;v integer;
begin
 if not app_private.is_active() or p_request_id is null then raise exception 'Active account and request ID required';end if;
 if p_answers is null or octet_length(p_answers::text)>100000 or p_consent is null or octet_length(p_consent::text)>5000 or length(coalesce(p_name,''))>200 or length(coalesce(p_household_label,''))>200 then raise exception 'Invalid request size';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_id,p_project,p_person,p_household,p_name,p_birth,p_household_label,p_answers,p_consent,p_submit,p_version)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id::text,0));
 select * into receipt from public.survey_save_receipts where actor_id=auth.uid() and request_id=p_request_id;
 if found then
  if not app_private.can_read_project(receipt.project_id) then raise exception 'Project access revoked; contact your supervisor';end if;
  if receipt.payload_hash<>fingerprint then raise exception 'Request ID already used with different survey details';end if;
  return receipt.response_id;
 end if;
 result:=app_private.save_survey_response_v21(p_id,p_project,p_person,p_household,p_name,p_birth,p_household_label,p_answers,p_consent,p_submit,p_version);
 select version into v from public.survey_responses where id=result;
 insert into public.survey_save_receipts(actor_id,request_id,project_id,response_id,payload_hash,response_version) values(auth.uid(),p_request_id,p_project,result,fingerprint,v);
 return result;
end;$$;
revoke all on function public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer,uuid) to authenticated;
