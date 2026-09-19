-- FieldLance 2.19.5 — branding compatibility only.
-- Historical poem_* schema/status/audit identifiers remain untouched.
-- New UI displays FL-BEN-* while canonical search accepts both FL-BEN-* and legacy POEM-BEN-*.

create or replace function public.search_canonical_registry(p_query text,p_state text,p_after bigint,p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;q text:=trim(coalesce(p_query,''));
begin
 if not app_private.can_manage_surveys() then raise exception 'FieldLance survey management permission required'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_after is null or p_after<0 or length(q)>200 or p_state is null or p_state not in ('active','review_required','merged','all') then raise exception 'Invalid registry search parameters'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.beneficiary_no),'[]'::jsonb) into result from (
  select c.*,(select count(*) from public.canonical_person_links l where l.canonical_person_id=c.id) linked_records from public.canonical_persons c where c.beneficiary_no>p_after
  and (p_state='all' or (p_state='active' and c.identity_status<>'merged') or (p_state='review_required' and c.review_required and c.identity_status<>'merged') or (p_state='merged' and c.identity_status='merged'))
  and (q='' or position(lower(q) in lower(c.display_name))>0 or c.id::text=q or ltrim(regexp_replace(upper(q),'^(FL-BEN-|POEM-BEN-)',''),'0')=c.beneficiary_no::text)
  order by c.beneficiary_no limit p_limit+1
 ) x;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'canonical_registry_searched',jsonb_build_object('state',p_state,'after',p_after,'query_used',q<>''));
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality r(value,ord) where ord<=p_limit),'has_more',jsonb_array_length(result)>p_limit);
end;$$;

create or replace function public.verification_subjects(p_kind text,p_query text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;q text:=lower(trim(coalesce(p_query,'')));
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 if p_kind is null or p_kind not in ('organization','volunteer','beneficiary') or length(q)>200 then raise exception 'Invalid subject query'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.label,x.id),'[]'::jsonb) into result from (
 select id,label from (
 select o.id,o.name label from public.organizations o where p_kind='organization'
 union all select p.user_id,coalesce(nullif(p.details->>'full_name',''),a.full_name,a.email) from public.volunteer_profiles p join public.accounts a on a.id=p.user_id where p_kind='volunteer'
 union all select c.id,c.display_name||' — FL-BEN-'||lpad(c.beneficiary_no::text,8,'0') from public.canonical_persons c where p_kind='beneficiary' and c.identity_status<>'merged'
 ) candidates where app_private.can_request_verification(p_kind,id) and (q='' or position(q in lower(label))>0 or id::text=q) order by label,id limit 25) x;
 return result;
end;$$;

revoke all on function public.search_canonical_registry(text,text,bigint,integer) from public,anon;
grant execute on function public.search_canonical_registry(text,text,bigint,integer) to authenticated,service_role;
revoke all on function public.verification_subjects(text,text) from public,anon;
grant execute on function public.verification_subjects(text,text) to authenticated,service_role;
