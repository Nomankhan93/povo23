-- Project-scoped registry corrections, explainable matching and a recorded-delivery ledger.
alter table public.registry_persons add column version integer not null default 1;
create table public.registry_person_revisions (
 person_id uuid not null references public.registry_persons(id), version integer not null,
 snapshot jsonb not null, reason text not null, actor_id uuid references public.accounts(id),
 recorded_at timestamptz not null default now(), primary key(person_id,version)
);
-- Existing state is an upgrade baseline, not reconstructed collection-time evidence.
insert into public.registry_person_revisions(person_id,version,snapshot,reason)
 select id,version,to_jsonb(p),'Phase 2.2 upgrade baseline; earlier identity history unavailable' from public.registry_persons p;
create function app_private.capture_person_creation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.registry_person_revisions(person_id,version,snapshot,reason,actor_id)
 values(new.id,new.version,to_jsonb(new),'Created during survey collection',auth.uid());return new;
end;$$;
create trigger person_created after insert on public.registry_persons for each row execute function app_private.capture_person_creation();
alter table public.survey_responses add column identity_snapshot jsonb;
alter table public.survey_responses disable trigger survey_revision;
update public.survey_responses r set identity_snapshot=jsonb_build_object('person',to_jsonb(p),'source','Phase 2.2 upgrade baseline','recorded_at',now()) from public.registry_persons p where p.id=r.person_id;
alter table public.survey_responses enable trigger survey_revision;
create function app_private.snapshot_response_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or new.consent is distinct from old.consent then
  select jsonb_build_object('person',to_jsonb(p),'source','Collection revision','recorded_at',now()) into new.identity_snapshot from public.registry_persons p where id=new.person_id;
 end if;return new;
end;$$;
create trigger response_identity before insert or update on public.survey_responses for each row execute function app_private.snapshot_response_identity();
create function public.correct_registry_person(p_id uuid,p_name text,p_birth date,p_household uuid,p_reason text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare person public.registry_persons;proj uuid;org uuid;
begin
 select project_id into proj from public.registry_persons where id=p_id;
 if not app_private.can_review_survey(proj) then raise exception 'Registry review permission required';end if;
 -- Collection also locks the project: snapshot and identity corrections are serialized.
 select organization_id into org from public.survey_projects where id=proj for update;
 select * into person from public.registry_persons where id=p_id for update;
 if person.version is distinct from p_version then raise exception 'Person changed. Reload before correcting.';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 200 or (p_birth is not null and (p_birth<'1900-01-01'::date or p_birth>(now() at time zone 'UTC')::date)) or p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Valid name, birth date and correction reason required';end if;
 if not exists(select 1 from public.registry_households where id=p_household and project_id=proj) then raise exception 'Household must belong to this project';end if;
 if person.full_name=trim(p_name) and person.birth_date is not distinct from p_birth and person.household_id=p_household then raise exception 'No identity changes supplied';end if;
 update public.registry_persons set full_name=trim(p_name),birth_date=p_birth,household_id=p_household,version=version+1 where id=p_id returning * into person;
 insert into public.registry_person_revisions(person_id,version,snapshot,reason,actor_id) values(p_id,person.version,to_jsonb(person),trim(p_reason),auth.uid());
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'registry_person_corrected',jsonb_build_object('person',p_id,'previous_version',p_version,'version',person.version));
end;$$;
create table public.registry_match_decisions (
 project_id uuid not null references public.survey_projects(id),person_a uuid not null references public.registry_persons(id),person_b uuid not null references public.registry_persons(id),
 status text not null check(status in ('same_person','different_people','needs_review')),reason text not null,
 person_a_version integer not null,person_b_version integer not null,version integer not null default 1,
 reviewed_by uuid not null references public.accounts(id),reviewed_at timestamptz not null default now(),
 primary key(person_a,person_b),check(person_a<person_b)
);
create table public.registry_match_revisions (
 person_a uuid not null,person_b uuid not null,version integer not null,snapshot jsonb not null,
 recorded_at timestamptz not null default now(),primary key(person_a,person_b,version),
 foreign key(person_a,person_b) references public.registry_match_decisions(person_a,person_b)
);
create function app_private.normalized_person_name(value text) returns text language sql immutable set search_path='' as $$select regexp_replace(lower(trim(value)),'[[:space:][:punct:]]','','g');$$;
create index registry_name_match on public.registry_persons(project_id,app_private.normalized_person_name(full_name));
create function public.registry_match_candidates(p_person uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare person public.registry_persons;result jsonb;
begin
 select * into person from public.registry_persons where id=p_person;
 if not found or not app_private.can_review_survey(person.project_id) then raise exception 'Registry review permission required';end if;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from (
 select p.id,p.registry_no,p.full_name,p.birth_date,p.household_id,p.version,
 array_remove(array[
 case when app_private.normalized_person_name(p.full_name)=app_private.normalized_person_name(person.full_name) then 'Same normalized name' end,
 case when p.birth_date=person.birth_date then 'Same birth date' end,
 case when p.household_id=person.household_id then 'Same household (supporting context only)' end],null) as signals,
 d.status,d.reason,d.version as decision_version,
 case when d.version is null then false else (d.person_a_version<>(case when d.person_a=person.id then person.version else p.version end) or d.person_b_version<>(case when d.person_b=person.id then person.version else p.version end)) end as stale
 from public.registry_persons p left join public.registry_match_decisions d on d.person_a=least(p.id,person.id) and d.person_b=greatest(p.id,person.id)
 where p.project_id=person.project_id and p.id<>person.id and (
 app_private.normalized_person_name(p.full_name)=app_private.normalized_person_name(person.full_name)
 or (p.birth_date=person.birth_date and p.household_id=person.household_id) or d.version is not null)
 order by p.full_name,p.id limit 51) c;
 return result;
end;$$;
create function public.review_registry_match(p_person uuid,p_other uuid,p_status text,p_reason text,p_person_version integer,p_other_version integer,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.registry_persons;b public.registry_persons;decision public.registry_match_decisions;proj uuid;org uuid;first_id uuid;second_id uuid;
begin
 select project_id into proj from public.registry_persons where id=p_person;
 if not app_private.can_review_survey(proj) then raise exception 'Registry review permission required';end if;
 select organization_id into org from public.survey_projects where id=proj for update;
 select * into a from public.registry_persons where id=p_person;
 select * into b from public.registry_persons where id=p_other and project_id=proj;
 if not found or p_person=p_other then raise exception 'Choose two different records in the same project';end if;
 if a.version is distinct from p_person_version or b.version is distinct from p_other_version then raise exception 'Identity changed. Reload candidates.';end if;
 if p_status is null or p_status not in ('same_person','different_people','needs_review') or p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Decision and reason required';end if;
 first_id:=least(p_person,p_other);second_id:=greatest(p_person,p_other);
 select * into decision from public.registry_match_decisions where person_a=first_id and person_b=second_id for update;
 if coalesce(decision.version,0) is distinct from p_version then raise exception 'Decision changed. Reload candidates.';end if;
 insert into public.registry_match_decisions(project_id,person_a,person_b,status,reason,person_a_version,person_b_version,reviewed_by)
 values(proj,first_id,second_id,p_status,trim(p_reason),case when first_id=a.id then a.version else b.version end,case when second_id=b.id then b.version else a.version end,auth.uid())
 on conflict(person_a,person_b) do update set status=excluded.status,reason=excluded.reason,person_a_version=excluded.person_a_version,person_b_version=excluded.person_b_version,version=public.registry_match_decisions.version+1,reviewed_by=auth.uid(),reviewed_at=now() returning * into decision;
 insert into public.registry_match_revisions(person_a,person_b,version,snapshot) values(first_id,second_id,decision.version,to_jsonb(decision));
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'registry_match_reviewed',jsonb_build_object('person_a',first_id,'person_b',second_id,'version',decision.version,'status',p_status));
end;$$;
create table public.assistance_entries (
 id uuid primary key,project_id uuid not null references public.survey_projects(id),person_id uuid not null references public.registry_persons(id),
 kind text not null check(kind in ('cash','goods','service')),category text not null check(category in ('food','education','health','housing','livelihood','other')),
 program text not null,description text not null,amount_pkr numeric(14,2),quantity numeric(12,3),unit text,
 delivered_on date not null,funding_source text not null,evidence_reference text not null,next_eligible_on date,
 identity_snapshot jsonb not null,created_by uuid not null references public.accounts(id),created_at timestamptz not null default now(),
 status text not null default 'recorded' check(status in ('recorded','void')),version integer not null default 1,
 void_reason text,voided_by uuid references public.accounts(id),voided_at timestamptz,
 check((kind='cash' and amount_pkr>0 and quantity is null and unit is null) or (kind in ('goods','service') and amount_pkr is null and quantity>0 and unit is not null))
);
create index assistance_person_date on public.assistance_entries(person_id,delivered_on desc,id);
create function public.record_assistance(p_id uuid,p_person uuid,p_kind text,p_category text,p_program text,p_description text,p_amount numeric,p_quantity numeric,p_unit text,p_delivered date,p_funding text,p_evidence text,p_next date) returns uuid language plpgsql security definer set search_path='' as $$
declare person public.registry_persons;org uuid;existing public.assistance_entries;
begin
 select * into person from public.registry_persons where id=p_person;
 if not found or not app_private.can_review_survey(person.project_id) then raise exception 'Assistance management permission required';end if;
 select organization_id into org from public.survey_projects where id=person.project_id for update;
 -- Re-read after acquiring the same lock as identity corrections.
 select * into person from public.registry_persons where id=p_person;
 if not exists(select 1 from public.organizations where id=org and status='active') then raise exception 'Active NGO required';end if;
 if p_id is null then raise exception 'Request ID required';end if;
 select * into existing from public.assistance_entries where id=p_id;
 if found then
 if existing.created_by=auth.uid() and existing.person_id=p_person and existing.kind is not distinct from p_kind and existing.category is not distinct from p_category and existing.program is not distinct from trim(p_program) and existing.description is not distinct from trim(p_description) and existing.amount_pkr is not distinct from p_amount and existing.quantity is not distinct from p_quantity and existing.unit is not distinct from nullif(trim(p_unit),'') and existing.delivered_on is not distinct from p_delivered and existing.funding_source is not distinct from trim(p_funding) and existing.evidence_reference is not distinct from trim(p_evidence) and existing.next_eligible_on is not distinct from p_next then return existing.id;end if;
 raise exception 'Request ID already used with different details';end if;
 if not exists(select 1 from public.survey_responses where person_id=p_person and status='approved') then raise exception 'At least one approved survey is required before recording assistance';end if;
 if p_kind is null or p_kind not in ('cash','goods','service') or p_category is null or p_category not in ('food','education','health','housing','livelihood','other') or p_program is null or length(trim(p_program)) not between 2 and 150 or p_description is null or length(trim(p_description)) not between 3 and 1000 or p_funding is null or length(trim(p_funding)) not between 2 and 200 or p_evidence is null or length(trim(p_evidence)) not between 3 and 500 then raise exception 'Assistance details, funding source and evidence reference required';end if;
 if p_delivered is null or p_delivered<'1900-01-01'::date or p_delivered>(now() at time zone 'UTC')::date or (p_next is not null and p_next<p_delivered) then raise exception 'Valid delivery and next eligibility dates required';end if;
 if p_kind='cash' then
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>1000000000 or round(p_amount,2)<>p_amount or p_quantity is not null or nullif(trim(p_unit),'') is not null then raise exception 'Cash requires a positive PKR amount with at most two decimal places';end if;
 else
 if p_amount is not null or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<=0 or p_quantity>1000000 or round(p_quantity,3)<>p_quantity or p_unit is null or length(trim(p_unit)) not between 1 and 30 then raise exception 'Goods/services require quantity and unit, without cash amount';end if;
 end if;
 insert into public.assistance_entries(id,project_id,person_id,kind,category,program,description,amount_pkr,quantity,unit,delivered_on,funding_source,evidence_reference,next_eligible_on,identity_snapshot,created_by)
 values(p_id,person.project_id,p_person,p_kind,p_category,trim(p_program),trim(p_description),p_amount,p_quantity,nullif(trim(p_unit),''),p_delivered,trim(p_funding),trim(p_evidence),p_next,to_jsonb(person),auth.uid());
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'assistance_recorded',jsonb_build_object('id',p_id,'person',p_person,'project',person.project_id));return p_id;
end;$$;
create function public.void_assistance(p_id uuid,p_reason text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare entry public.assistance_entries;org uuid;
begin
 select * into entry from public.assistance_entries where id=p_id for update;
 if not found or not app_private.can_review_survey(entry.project_id) then raise exception 'Assistance management permission required';end if;
 if entry.status<>'recorded' or entry.version is distinct from p_version then raise exception 'Entry changed or already void. Reload.';end if;
 if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Void reason required';end if;
 update public.assistance_entries set status='void',version=version+1,void_reason=trim(p_reason),voided_by=auth.uid(),voided_at=now() where id=p_id;
 select organization_id into org from public.survey_projects where id=entry.project_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'assistance_voided',jsonb_build_object('id',p_id,'previous_version',p_version));
end;$$;
alter table public.registry_person_revisions enable row level security;
alter table public.registry_match_decisions enable row level security;
alter table public.registry_match_revisions enable row level security;
alter table public.assistance_entries enable row level security;
create policy person_history_read on public.registry_person_revisions for select to authenticated using(exists(select 1 from public.registry_persons p where p.id=person_id and app_private.can_review_survey(p.project_id)));
create policy match_read on public.registry_match_decisions for select to authenticated using(app_private.can_review_survey(project_id));
create policy match_history_read on public.registry_match_revisions for select to authenticated using(exists(select 1 from public.registry_match_decisions d where d.person_a=registry_match_revisions.person_a and d.person_b=registry_match_revisions.person_b));
create policy assistance_read on public.assistance_entries for select to authenticated using(app_private.can_review_survey(project_id));
revoke all on public.registry_person_revisions,public.registry_match_decisions,public.registry_match_revisions,public.assistance_entries from anon,authenticated;
grant select on public.registry_person_revisions,public.registry_match_decisions,public.registry_match_revisions,public.assistance_entries to authenticated;
grant all on public.registry_person_revisions,public.registry_match_decisions,public.registry_match_revisions,public.assistance_entries to service_role;
revoke all on function app_private.capture_person_creation(),app_private.snapshot_response_identity(),app_private.normalized_person_name(text) from public,anon,authenticated;
revoke all on function public.correct_registry_person(uuid,text,date,uuid,text,integer),public.registry_match_candidates(uuid),public.review_registry_match(uuid,uuid,text,text,integer,integer,integer),public.record_assistance(uuid,uuid,text,text,text,text,numeric,numeric,text,date,text,text,date),public.void_assistance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.correct_registry_person(uuid,text,date,uuid,text,integer),public.registry_match_candidates(uuid),public.review_registry_match(uuid,uuid,text,text,integer,integer,integer),public.record_assistance(uuid,uuid,text,text,text,text,numeric,numeric,text,date,text,text,date),public.void_assistance(uuid,text,integer) to authenticated;
