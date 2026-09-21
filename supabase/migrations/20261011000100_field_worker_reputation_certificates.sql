-- FieldLance 2.29.0 — Field Worker Reputation & Certificates
-- Reputation is attached to completed assignments. Certificates are issued from
-- platform evidence and never inferred from profile existence alone.

create table public.field_worker_reputation_reviews (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.work_assignments(id),
  organization_id uuid not null references public.organizations(id),
  worker_id uuid not null references public.accounts(id),
  reviewer_id uuid not null references public.accounts(id),
  rating smallint not null check(rating between 1 and 5),
  quality_rating smallint not null check(quality_rating between 1 and 5),
  reliability_rating smallint not null check(reliability_rating between 1 and 5),
  communication_rating smallint not null check(communication_rating between 1 and 5),
  note text not null default '' check(length(note)<=2000),
  status text not null default 'published' check(status in ('published','withdrawn')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assignment_id),
  check(worker_id<>reviewer_id)
);
create index field_worker_reputation_worker on public.field_worker_reputation_reviews(worker_id,status,created_at desc);
create index field_worker_reputation_org on public.field_worker_reputation_reviews(organization_id,status,created_at desc);

create table public.field_worker_certificates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.accounts(id),
  certificate_no text not null unique check(length(certificate_no) between 8 and 40),
  verification_code text not null unique check(length(verification_code) between 12 and 80),
  certificate_type text not null check(certificate_type in ('field_professional','survey_quality','project_completion','custom')),
  title text not null check(length(trim(title)) between 3 and 160),
  issuer_label text not null default 'FieldLance' check(length(trim(issuer_label)) between 2 and 160),
  evidence_note text not null default '' check(length(evidence_note)<=2000),
  evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object'),
  issued_by uuid not null references public.accounts(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check(status in ('active','revoked')),
  revoked_by uuid references public.accounts(id),
  revoked_at timestamptz,
  revoke_note text not null default '' check(length(revoke_note)<=1000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check(expires_at is null or expires_at>issued_at),
  check((status='active' and revoked_by is null and revoked_at is null) or (status='revoked' and revoked_by is not null and revoked_at is not null))
);
create index field_worker_certificates_worker on public.field_worker_certificates(worker_id,status,issued_at desc);
create index field_worker_certificates_code on public.field_worker_certificates(verification_code);

alter table public.field_worker_reputation_reviews enable row level security;
alter table public.field_worker_certificates enable row level security;
revoke all on public.field_worker_reputation_reviews,public.field_worker_certificates from anon,authenticated;
grant select on public.field_worker_reputation_reviews,public.field_worker_certificates to authenticated;
create policy field_worker_reputation_read on public.field_worker_reputation_reviews for select to authenticated using(
  app_private.is_active() and (worker_id=auth.uid() or app_private.can_manage_volunteers() or app_private.ngo_admin(organization_id))
);
create policy field_worker_certificates_read on public.field_worker_certificates for select to authenticated using(
  app_private.is_active() and (worker_id=auth.uid() or app_private.can_manage_volunteers())
);

alter table public.field_worker_certificates add column public_sharing boolean not null default false, add column worker_name text not null default '';
create function app_private.reputation_access(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and exists(select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.id=p_user and a.status='active' and v.status<>'suspended') and (p_user=auth.uid() or app_private.can_manage_volunteers());
$$;
revoke all on function app_private.reputation_access(uuid) from public,anon;
grant execute on function app_private.reputation_access(uuid) to authenticated;
create function public.field_worker_reputation(p_user uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid:=coalesce(p_user,auth.uid());begin
 if not app_private.reputation_access(target) then raise exception 'Active Field Worker or management permission required';end if;
 return jsonb_build_object('completed_assignments',(select count(*) from public.work_assignments where user_id=target and status='completed'),
 'approved_surveys',(select count(*) from public.survey_responses where collector_id=target and status='approved'),
 'reviewed_surveys',(select count(*) from public.survey_responses where collector_id=target and status in ('approved','rejected','correction_required')),
 'review_count',(select count(*) from public.field_worker_reputation_reviews where worker_id=target and status='published'),
 'average_rating',(select round(avg(rating),2) from public.field_worker_reputation_reviews where worker_id=target and status='published'),
 'average_quality',(select round(avg(quality_rating),2) from public.field_worker_reputation_reviews where worker_id=target and status='published'),
 'average_reliability',(select round(avg(reliability_rating),2) from public.field_worker_reputation_reviews where worker_id=target and status='published'),
 'average_communication',(select round(avg(communication_rating),2) from public.field_worker_reputation_reviews where worker_id=target and status='published'),
 'verified_experiences',(select count(*) from public.volunteer_experiences where user_id=target and status='verified'));
end;$$;
create function public.field_worker_reputation_reviews(p_user uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.reputation_access(coalesce(p_user,auth.uid())) then raise exception 'Active Field Worker or management permission required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select r.id,r.rating,r.quality_rating,r.reliability_rating,r.communication_rating,r.note,r.created_at,r.version,o.name organization_name from public.field_worker_reputation_reviews r join public.organizations o on o.id=r.organization_id where r.worker_id=coalesce(p_user,auth.uid()) and r.status='published' order by r.created_at desc,r.id limit 100) x),'[]'::jsonb);
end;$$;
create function public.submit_field_worker_review(p_assignment uuid,p_rating integer,p_quality integer,p_reliability integer,p_communication integer,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.work_assignments;result uuid;begin
 select * into a from public.work_assignments where id=p_assignment for update;
 if not found or not app_private.ngo_admin(a.organization_id) or a.status<>'completed' or a.responded_at is null or a.completed_by is null then raise exception 'Completed accepted assignment and organization admin required';end if;
 if a.user_id=auth.uid() then raise exception 'Cannot review your own assignment';end if;
 if p_rating is null or p_quality is null or p_reliability is null or p_communication is null or p_rating not between 1 and 5 or p_quality not between 1 and 5 or p_reliability not between 1 and 5 or p_communication not between 1 and 5 or p_note is null or length(trim(p_note)) not between 5 and 2000 then raise exception 'Complete ratings and review note required';end if;
 insert into public.field_worker_reputation_reviews(assignment_id,organization_id,worker_id,reviewer_id,rating,quality_rating,reliability_rating,communication_rating,note) values(a.id,a.organization_id,a.user_id,auth.uid(),p_rating,p_quality,p_reliability,p_communication,trim(p_note)) returning id into result;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),a.user_id,a.organization_id,'field_worker_review_submitted',jsonb_build_object('assignment',a.id,'review',result));return result;
end;$$;
create function public.withdraw_field_worker_review(p_id uuid,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.field_worker_reputation_reviews;begin
 select * into r from public.field_worker_reputation_reviews where id=p_id for update;
 if not found or not (app_private.can_manage_volunteers() or app_private.ngo_admin(r.organization_id)) or not app_private.is_active() then raise exception 'Review management permission required';end if;
 if r.version is distinct from p_version or r.status<>'published' then raise exception 'Review changed; reload';end if;
 if p_note is null or length(trim(p_note)) not between 5 and 1000 then raise exception 'Withdrawal reason required';end if;
 update public.field_worker_reputation_reviews set status='withdrawn',version=version+1,updated_at=now() where id=p_id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),r.worker_id,r.organization_id,'field_worker_review_withdrawn',jsonb_build_object('review',p_id,'reason',trim(p_note)));
end;$$;
create function public.reputation_candidates(p_org uuid default null,p_query text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if p_query is null or length(p_query)>100 then raise exception 'Valid search required';end if;
 if p_org is null then
 if not app_private.can_manage_volunteers() then raise exception 'Field Worker management permission required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.full_name name from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.status='active' and v.status<>'suspended' and (p_query='' or strpos(lower(a.full_name),lower(p_query))>0) order by a.full_name,a.id limit 100) x),'[]'::jsonb);
 end if;
 if not app_private.ngo_admin(p_org) then raise exception 'Organization admin required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.volunteer_name name,a.project_title,r.id review_id,r.version review_version,r.status review_status from public.work_assignments a left join public.field_worker_reputation_reviews r on r.assignment_id=a.id where a.organization_id=p_org and a.status='completed' and a.user_id<>auth.uid() and (p_query='' or strpos(lower(a.volunteer_name),lower(p_query))>0) order by a.completed_at desc,a.id limit 100) x),'[]'::jsonb);
end;$$;
create function public.field_worker_certificates(p_user uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not app_private.reputation_access(coalesce(p_user,auth.uid())) then raise exception 'Active Field Worker or management permission required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,certificate_no,verification_code,worker_name,certificate_type,title,issuer_label,evidence_note,evidence,issued_at,expires_at,version,public_sharing,case when status='active' and expires_at<=now() then 'expired' else status end status from public.field_worker_certificates where worker_id=coalesce(p_user,auth.uid()) order by issued_at desc,id limit 100) x),'[]'::jsonb);
end;$$;
create function public.issue_field_worker_certificate(p_user uuid,p_type text,p_title text,p_note text,p_expires timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;ev jsonb;begin
 if not app_private.can_manage_volunteers() or not app_private.reputation_access(p_user) or p_user=auth.uid() then raise exception 'Independent Field Worker management permission required';end if;
 if p_type is null or p_type not in ('field_professional','survey_quality','project_completion','custom') or p_title is null or length(trim(p_title)) not between 3 and 160 or p_note is null or length(trim(p_note)) not between 5 and 2000 or (p_expires is not null and (not isfinite(p_expires) or p_expires<=now())) then raise exception 'Valid certificate details required';end if;
 ev:=public.field_worker_reputation(p_user);
 if (ev->>'completed_assignments')::int=0 and (ev->>'approved_surveys')::int=0 then raise exception 'Verified platform work evidence required';end if;
 if p_type='project_completion' and (ev->>'completed_assignments')::int=0 then raise exception 'Completed assignment evidence required';end if;
 if p_type='survey_quality' and (ev->>'approved_surveys')::int=0 then raise exception 'Approved survey evidence required';end if;
 insert into public.field_worker_certificates(worker_id,worker_name,certificate_no,verification_code,certificate_type,title,evidence_note,evidence,issued_by,expires_at) values(p_user,(select full_name from public.accounts where id=p_user),'FL-CERT-'||upper(replace(gen_random_uuid()::text,'-','')),replace(gen_random_uuid()::text,'-',''),p_type,trim(p_title),trim(p_note),ev,auth.uid(),p_expires) returning id into result;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),p_user,'field_worker_certificate_issued',jsonb_build_object('certificate',result,'type',p_type));return result;
end;$$;
create function public.revoke_field_worker_certificate(p_id uuid,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare c public.field_worker_certificates;begin
 if not app_private.can_manage_volunteers() then raise exception 'Field Worker management permission required';end if;
 select * into c from public.field_worker_certificates where id=p_id for update;
 if not found or c.status<>'active' or c.version is distinct from p_version then raise exception 'Certificate changed; reload';end if;
 if p_note is null or length(trim(p_note)) not between 5 and 1000 then raise exception 'Revocation reason required';end if;
 update public.field_worker_certificates set status='revoked',revoked_by=auth.uid(),revoked_at=now(),revoke_note=trim(p_note),version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),c.worker_id,'field_worker_certificate_revoked',jsonb_build_object('certificate',p_id,'reason',trim(p_note)));
end;$$;
create function public.share_field_worker_certificate(p_id uuid,p_share boolean,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare c public.field_worker_certificates;begin
 select * into c from public.field_worker_certificates where id=p_id for update;
 if not found or c.worker_id<>auth.uid() or not app_private.reputation_access(c.worker_id) then raise exception 'Certificate owner permission required';end if;
 if p_share is null or c.version is distinct from p_version then raise exception 'Certificate changed; reload';end if;
 update public.field_worker_certificates set public_sharing=p_share,version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),auth.uid(),'field_worker_certificate_sharing',jsonb_build_object('certificate',p_id,'public',p_share));
end;$$;
create function public.verify_field_worker_certificate(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.field_worker_certificates;begin
 if p_code is null or length(p_code)<>32 then return jsonb_build_object('valid',false,'status','unavailable');end if;
 select * into c from public.field_worker_certificates where verification_code=p_code and public_sharing;
 if not found or not exists(select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.id=c.worker_id and a.status='active' and v.status<>'suspended') then return jsonb_build_object('valid',false,'status','unavailable');end if;
 return jsonb_build_object('valid',c.status='active' and (c.expires_at is null or c.expires_at>now()),'status',case when c.status='active' and c.expires_at<=now() then 'expired' else c.status end,'worker_name',c.worker_name,'certificate_no',c.certificate_no,'title',c.title,'issuer_label',c.issuer_label,'issued_at',c.issued_at,'expires_at',c.expires_at);
end;$$;
revoke all on function public.field_worker_reputation(uuid),public.field_worker_reputation_reviews(uuid),public.submit_field_worker_review(uuid,integer,integer,integer,integer,text),public.withdraw_field_worker_review(uuid,text,integer),public.reputation_candidates(uuid,text),public.field_worker_certificates(uuid),public.issue_field_worker_certificate(uuid,text,text,text,timestamptz),public.revoke_field_worker_certificate(uuid,text,integer),public.share_field_worker_certificate(uuid,boolean,integer) from public,anon;
grant execute on function public.field_worker_reputation(uuid),public.field_worker_reputation_reviews(uuid),public.submit_field_worker_review(uuid,integer,integer,integer,integer,text),public.withdraw_field_worker_review(uuid,text,integer),public.reputation_candidates(uuid,text),public.field_worker_certificates(uuid),public.issue_field_worker_certificate(uuid,text,text,text,timestamptz),public.revoke_field_worker_certificate(uuid,text,integer),public.share_field_worker_certificate(uuid,boolean,integer) to authenticated;
revoke all on function public.verify_field_worker_certificate(text) from public;
grant execute on function public.verify_field_worker_certificate(text) to anon,authenticated;
