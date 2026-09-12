-- READ ONLY: run on the intended 2.3 database before the 2.3.1 migration.
-- Any result in this first query requires reviewed correction before upgrade.
select 'person_household' as issue,p.id from public.registry_persons p join public.registry_households h on h.id=p.household_id where p.project_id<>h.project_id
union all select 'response_person',r.id from public.survey_responses r join public.registry_persons p on p.id=r.person_id where r.project_id<>p.project_id
union all select 'assistance_person',a.id from public.assistance_entries a join public.registry_persons p on p.id=a.person_id where a.project_id<>p.project_id
union all select 'need_person',n.id from public.beneficiary_needs n join public.registry_persons p on p.id=n.person_id where n.project_id<>p.project_id
union all select 'need_source',n.id from public.beneficiary_needs n join public.survey_responses r on r.id=n.source_response_id where n.project_id<>r.project_id or n.person_id<>r.person_id
union all select 'match_person_a',m.person_a from public.registry_match_decisions m join public.registry_persons p on p.id=m.person_a where m.project_id<>p.project_id
union all select 'match_person_b',m.person_b from public.registry_match_decisions m join public.registry_persons p on p.id=m.person_b where m.project_id<>p.project_id
union all select 'need_assistance_link',l.need_id from public.need_assistance_links l join public.beneficiary_needs n on n.id=l.need_id join public.assistance_entries a on a.id=l.assistance_id where n.project_id<>a.project_id or n.person_id<>a.person_id;
-- Inventory only. Do not automatically delete legitimate historical memberships.
select m.organization_id,m.user_id,m.role,m.status,a.platform_role
from public.organization_memberships m join public.accounts a on a.id=m.user_id
where a.platform_role='ngo_manager';
