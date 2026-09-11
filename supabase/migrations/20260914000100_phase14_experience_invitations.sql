-- Experience confirmation is independent of profile review and NGO profile sharing.
create table public.volunteer_experiences (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.accounts(id),
 organization_id uuid not null references public.organizations(id),volunteer_name text not null,
 role_title text not null,start_date date not null,end_date date,description text not null,
 status text not null default 'unverified' check(status in ('unverified','pending','verified','rejected')),
 version integer not null default 1,reviewed_by uuid references public.accounts(id),reviewed_at timestamptz,review_note text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date)
);
alter table public.volunteer_experiences enable row level security;
create policy experience_read on public.volunteer_experiences for select to authenticated using(app_private.is_active() and (user_id=auth.uid() or app_private.can_manage_volunteers() or (status<>'unverified' and app_private.ngo_admin(organization_id)) or (status='verified' and app_private.can_read_profile(user_id))));
create index experiences_owner on public.volunteer_experiences(user_id,created_at desc);
create index experiences_review on public.volunteer_experiences(organization_id,status);
create function public.save_experience(p_id uuid,p_org uuid,p_role text,p_start date,p_end date,p_description text,p_request boolean,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
 declare old public.volunteer_experiences;new_id uuid;name text;
 begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 perform 1 from public.volunteer_profiles where user_id=auth.uid() and status<>'suspended' for update;
 if not found then raise exception 'Profile suspended';end if;
 if p_role is null or length(trim(p_role)) not between 2 and 120 or p_start is null or p_start>(now() at time zone 'UTC')::date or (p_end is not null and (p_end<p_start or p_end>(now() at time zone 'UTC')::date)) or p_description is null or length(trim(p_description)) not between 10 and 2000 or p_request is null then raise exception 'Valid role, past/current dates and 10–2000 character description required';end if;
 if not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'Choose an active NGO';end if;
 select full_name into name from public.accounts where id=auth.uid();
 if p_id is null then
 if p_version is distinct from 0 then raise exception 'New experience requires version zero';end if;
 if (select count(*) from public.volunteer_experiences where user_id=auth.uid())>=100 then raise exception 'Maximum 100 experience entries';end if;
 insert into public.volunteer_experiences(user_id,organization_id,volunteer_name,role_title,start_date,end_date,description,status) values(auth.uid(),p_org,name,trim(p_role),p_start,p_end,trim(p_description),case when p_request then 'pending' else 'unverified' end) returning id into new_id;
 else
 select * into old from public.volunteer_experiences where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Experience not found';end if;
 if old.version is distinct from p_version then raise exception 'Experience changed. Reload.';end if;
 if old.organization_id<>p_org then raise exception 'Create a separate entry for another NGO';end if;
 new_id:=p_id;
 update public.volunteer_experiences set organization_id=p_org,volunteer_name=name,role_title=trim(p_role),start_date=p_start,end_date=p_end,description=trim(p_description),status=case when p_request then 'pending' else 'unverified' end,version=version+1,reviewed_by=null,reviewed_at=null,review_note='',updated_at=now() where id=p_id;
 end if;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),auth.uid(),p_org,'experience_saved',jsonb_build_object('id',new_id,'previous',to_jsonb(old),'requested',p_request,'role',p_role,'start',p_start,'end',p_end,'description',p_description));
 if p_request then insert into public.notifications(user_id,title,body) select m.user_id,'Experience confirmation requested','Open Work experience in your NGO workspace to review a request.' from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=p_org and m.role='ngo_admin' and m.status='active' and a.status='active' and m.user_id<>auth.uid();end if;
 return new_id;
 end; $$;
create function public.review_experience(p_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare e public.volunteer_experiences;
 begin
 select * into e from public.volunteer_experiences where id=p_id for update;
 if not found or not app_private.ngo_admin(e.organization_id) then raise exception 'Relevant active NGO Admin required';end if;
 if e.user_id=auth.uid() then raise exception 'Cannot verify your own experience';end if;
 if e.status<>'pending' or e.version is distinct from p_version then raise exception 'Experience changed or not pending. Reload.';end if;
 if p_status is null or p_status not in ('verified','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Decision and review note required';end if;
 update public.volunteer_experiences set status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),version=version+1,updated_at=now() where id=p_id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),e.user_id,e.organization_id,'experience_reviewed',jsonb_build_object('id',p_id,'status',p_status,'note',p_note,'previous_version',p_version));
 insert into public.notifications(user_id,title,body) values(e.user_id,'Experience review','An NGO reviewed your experience. Open Work experience to see the decision.');
 end; $$;

create table public.work_opportunities (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 title text not null,description text not null,geography_id uuid not null references public.geographies(id),
 start_date date not null,end_date date not null,reply_by timestamptz not null,
 payment_type text not null check(payment_type in ('paid','unpaid')),payment_note text not null default '',
 status text not null default 'open' check(status in ('open','closed')),created_by uuid not null references public.accounts(id),created_at timestamptz not null default now()
);
create table public.work_invitations (
 id uuid primary key default gen_random_uuid(),opportunity_id uuid not null references public.work_opportunities(id),
 organization_id uuid not null references public.organizations(id),user_id uuid not null references public.accounts(id),
 volunteer_name text not null,
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
 version integer not null default 1,created_by uuid not null references public.accounts(id),created_at timestamptz not null default now(),responded_at timestamptz,
 unique(opportunity_id,user_id)
);
alter table public.work_opportunities enable row level security;
alter table public.work_invitations enable row level security;
create function app_private.is_invited(opportunity uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.work_invitations where opportunity_id=opportunity and user_id=auth.uid());$$;
create policy opportunity_read on public.work_opportunities for select to authenticated using(app_private.is_active() and (app_private.ngo_admin(organization_id) or app_private.is_invited(id)));
create policy invitation_read on public.work_invitations for select to authenticated using(app_private.is_active() and (user_id=auth.uid() or app_private.ngo_profile_access(organization_id,user_id)));
create index invitations_user on public.work_invitations(user_id,created_at desc);
create index opportunities_org on public.work_opportunities(organization_id,created_at desc);
create function public.create_opportunity(p_org uuid,p_title text,p_description text,p_geography uuid,p_start date,p_end date,p_reply_by timestamptz,p_payment text,p_payment_note text) returns uuid language plpgsql security definer set search_path='' as $$
 declare new_id uuid;
 begin
 if not app_private.ngo_admin(p_org) then raise exception 'Active NGO Admin required';end if;
 if p_title is null or length(trim(p_title)) not between 3 and 150 or p_description is null or length(trim(p_description)) not between 10 and 4000 or p_start is null or p_end is null or p_start<(now() at time zone 'UTC')::date or p_end<p_start or p_reply_by is null or p_reply_by<=now() or p_reply_by>((p_start+1)::timestamp at time zone 'UTC') or p_payment is null or p_payment not in ('paid','unpaid') or p_payment_note is null or length(p_payment_note)>1000 then raise exception 'Valid title, tasks, future dates, reply deadline and payment preference required';end if;
 if p_payment='paid' and length(trim(p_payment_note))<3 then raise exception 'Describe proposed paid terms';end if;
 if not app_private.geo_active(p_geography) then raise exception 'Active geography required';end if;
 insert into public.work_opportunities(organization_id,title,description,geography_id,start_date,end_date,reply_by,payment_type,payment_note,created_by) values(p_org,trim(p_title),trim(p_description),p_geography,p_start,p_end,p_reply_by,p_payment,trim(p_payment_note),auth.uid()) returning id into new_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_org,'opportunity_created',jsonb_build_object('id',new_id,'title',p_title));return new_id;
 end; $$;
create function public.send_work_invitation(p_opportunity uuid,p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare o public.work_opportunities;new_id uuid;
 begin
 select * into o from public.work_opportunities where id=p_opportunity for update;
 if not found or not app_private.ngo_profile_access(o.organization_id,p_user) then raise exception 'Active NGO membership and profile grant required';end if;
 if p_user=auth.uid() then raise exception 'Cannot invite yourself';end if;
 if o.status<>'open' or o.reply_by<=now() or not app_private.geo_active(o.geography_id) then raise exception 'Opportunity closed, expired or area inactive';end if;
 if not exists(select 1 from public.volunteer_shortlists where organization_id=o.organization_id and user_id=p_user and status in ('shortlisted','considering','selected')) then raise exception 'Shortlist the volunteer first';end if;
 insert into public.work_invitations(opportunity_id,organization_id,user_id,created_by,volunteer_name) values(o.id,o.organization_id,p_user,auth.uid(),(select full_name from public.accounts where id=p_user)) on conflict(opportunity_id,user_id) do nothing returning id into new_id;
 if new_id is null then raise exception 'This volunteer already has an invitation for this opportunity';end if;
 insert into public.notifications(user_id,title,body) values(p_user,'New NGO invitation','Open Invitations to review the opportunity and respond.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,o.organization_id,'invitation_sent',jsonb_build_object('id',new_id,'opportunity',o.id));return new_id;
 end; $$;
create function public.respond_work_invitation(p_id uuid,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare i public.work_invitations;o public.work_opportunities;oid uuid;
 begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select opportunity_id into oid from public.work_invitations where id=p_id and user_id=auth.uid();
 select * into o from public.work_opportunities where id=oid for update;
 select * into i from public.work_invitations where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Invitation not found';end if;
 if i.status<>'pending' or i.version is distinct from p_version then raise exception 'Invitation changed. Reload.';end if;
 if o.status<>'open' or o.reply_by<=now() then raise exception 'Opportunity closed or invitation expired';end if;
 if not exists(select 1 from public.organizations where id=i.organization_id and status='active') or not exists(select 1 from public.profile_shares where organization_id=i.organization_id and user_id=auth.uid()) then raise exception 'Active NGO and profile sharing required';end if;
 if not exists(select 1 from public.volunteer_profiles where user_id=auth.uid() and status<>'suspended') then raise exception 'Profile suspended';end if;
 if p_status is null or p_status not in ('accepted','declined') then raise exception 'Accept or decline required';end if;
 update public.work_invitations set status=p_status,version=version+1,responded_at=now() where id=p_id;
 insert into public.notifications(user_id,title,body) select m.user_id,'Invitation response','A volunteer responded. Open your NGO Invitations workspace.' from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=i.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),auth.uid(),i.organization_id,'invitation_responded',jsonb_build_object('id',p_id,'status',p_status));
 end; $$;
create function public.cancel_work_invitation(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare i public.work_invitations;
 begin
 select * into i from public.work_invitations where id=p_id for update;
 if not found or not app_private.ngo_profile_access(i.organization_id,i.user_id) then raise exception 'NGO invitation access required';end if;
 if i.version is distinct from p_version or i.status<>'pending' then raise exception 'Only current pending invitations can be cancelled';end if;
 update public.work_invitations set status='cancelled',version=version+1,responded_at=now() where id=p_id;
 insert into public.notifications(user_id,title,body) values(i.user_id,'Invitation cancelled','An NGO cancelled a pending invitation.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),i.user_id,i.organization_id,'invitation_cancelled',jsonb_build_object('id',p_id));
 end; $$;
create function public.close_opportunity(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare o public.work_opportunities;
 begin
 select * into o from public.work_opportunities where id=p_id for update;
 if not found or not app_private.ngo_admin(o.organization_id) then raise exception 'Active NGO Admin required';end if;
 if o.status='closed' then return;end if;
 update public.work_opportunities set status='closed' where id=p_id;
 insert into public.notifications(user_id,title,body) select user_id,'Opportunity closed','A pending invitation was cancelled because the NGO closed the opportunity.' from public.work_invitations where opportunity_id=p_id and status='pending';
 update public.work_invitations set status='cancelled',version=version+1,responded_at=now() where opportunity_id=p_id and status='pending';
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),o.organization_id,'opportunity_closed',jsonb_build_object('id',p_id));
 end; $$;
-- Sharing revocation cancels pending invitations. Historical accepted/declined records remain.
create function app_private.revoke_invitations() returns trigger language plpgsql security definer set search_path='' as $$
 begin update public.work_invitations set status='cancelled',version=version+1,responded_at=now() where organization_id=old.organization_id and user_id=old.user_id and status='pending';return old;end; $$;
create trigger revoke_pending_invitations after delete on public.profile_shares for each row execute function app_private.revoke_invitations();
revoke all on public.volunteer_experiences,public.work_opportunities,public.work_invitations from anon,authenticated;
grant select on public.volunteer_experiences,public.work_opportunities,public.work_invitations to authenticated;
grant all on public.volunteer_experiences,public.work_opportunities,public.work_invitations to service_role;
revoke all on function app_private.is_invited(uuid),app_private.revoke_invitations() from public,anon,authenticated;
grant execute on function app_private.is_invited(uuid) to authenticated;
revoke all on function public.save_experience(uuid,uuid,text,date,date,text,boolean,integer),public.review_experience(uuid,text,text,integer),public.create_opportunity(uuid,text,text,uuid,date,date,timestamptz,text,text),public.send_work_invitation(uuid,uuid),public.respond_work_invitation(uuid,text,integer),public.cancel_work_invitation(uuid,integer),public.close_opportunity(uuid) from public,anon,authenticated;
grant execute on function public.save_experience(uuid,uuid,text,date,date,text,boolean,integer),public.review_experience(uuid,text,text,integer),public.create_opportunity(uuid,text,text,uuid,date,date,timestamptz,text,text),public.send_work_invitation(uuid,uuid),public.respond_work_invitation(uuid,text,integer),public.cancel_work_invitation(uuid,integer),public.close_opportunity(uuid) to authenticated;
