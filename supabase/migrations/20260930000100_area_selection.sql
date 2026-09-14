-- POEM 2.12.1: finer NGO operating areas; preserve already-saved inactive areas.
create or replace function public.save_ngo_operations(p_org uuid,p_areas uuid[],p_programs text[],p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare v integer; label text;
 begin
 if not app_private.can_manage_ngos() then raise exception 'NGO management permission required'; end if;
 if p_areas is null or p_programs is null or cardinality(p_areas)>100 or cardinality(p_programs)>50 then raise exception 'Maximum 100 areas and 50 programs'; end if;
 select operations_version into v from public.organizations where id=p_org for update;
 if not found then raise exception 'Organization not found'; end if;
 if v is distinct from p_version then raise exception 'Operations changed. Reload before saving.'; end if;
 if exists(select 1 from unnest(p_areas) g where not exists(select 1 from public.geographies where id=g and kind in ('district','taluka','uc','village','ward') and (app_private.geo_active(id) or exists(select 1 from public.organization_areas old where old.organization_id=p_org and old.geography_id=g)))) then raise exception 'Choose active districts, talukas, union councils, villages or wards; existing inactive areas may be retained'; end if;
 foreach label in array p_programs loop
 if label is null or length(trim(label)) not between 2 and 100 then raise exception 'Program names need 2 to 100 characters'; end if;
 end loop;
 delete from public.organization_areas where organization_id=p_org;
 insert into public.organization_areas select p_org,g from (select distinct unnest(p_areas) g) x;
 delete from public.organization_programs where organization_id=p_org;
 insert into public.organization_programs select p_org,trim(x) from unnest(p_programs) x group by trim(x);
 update public.organizations set operations_version=operations_version+1 where id=p_org;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_org,'ngo_operations_updated',jsonb_build_object('areas',p_areas,'programs',p_programs,'previous_version',v));
 end; $$;
