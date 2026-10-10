import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AreaSelector } from '../geography/AreaSelector';
import { selectableArea } from '../geography/areaSelection';
import { geographyPath, type Geo } from '../geography/model';
import { db, rpc } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';
import { human } from '../../shared/ui/FormFields';
import {
  Alert,
  Button,
  Card,
  DataTable,
  Field,
  FieldGroup,
  FormActions,
  MetricCard,
  MobileRecordCard,
  ReasonDialog,
  SectionHeader,
  Select,
  StatusBadge,
  Textarea,
  type SemanticTone,
} from '../../components/ui/FieldLanceUI';
import styles from './ProjectTeamWorkspace.module.css';

type Project = Database['public']['Tables']['survey_projects']['Row'];
type StaffArea = { id: string; name: string; kind: string };
type StaffRow = { id: string; user_id: string; name: string | null; role: string; status: string; starts_at: string; ends_at: string | null; version: number; areas: StaffArea[] };
type Candidate = { user_id: string; name: string | null; email: string | null; membership_role: string };
type Assignment = Pick<Database['public']['Tables']['survey_assignments']['Row'], 'user_id' | 'collection_geography_id'>;
type ResponseRow = Pick<Database['public']['Tables']['survey_responses']['Row'], 'id' | 'person_id' | 'collector_id' | 'status' | 'updated_at' | 'collection_geography_id'>;
type Metrics = { submitted: number; approved: number; correction: number; rejected: number; assignments: number };
type RecruitmentPlan = { project_id: string; target: number; approved: number; pending_review: number; correction_required: number; rejected: number; remaining_target: number; over_target: number; target_reached: boolean; required_volunteers: number | null; committed_volunteers: number; remaining_capacity: number | null; capacity_reached: boolean; manual_status: 'open' | 'closed'; effective_open: boolean; version: number };
type CompensationPlan = { project_id: string; work_mode: 'volunteer' | 'paid'; compensation_type: 'none' | 'per_verified_survey' | 'daily_rate' | 'fixed_assignment'; currency: string; rate: number | null; note: string; version: number; can_change: boolean };
type PendingAction = { kind: 'revoke'; row: StaffRow } | { kind: 'recruitment' } | { kind: 'compensation' } | null;
type RosterFilter = 'all' | 'active' | 'revoked';

function statusTone(status: string): SemanticTone {
  if (status === 'active' || status === 'approved' || status === 'open') return 'success';
  if (status === 'submitted' || status === 'correction_required') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'neutral';
}

function scopeFor(row: StaffRow) {
  if (row.role === 'project_manager') return 'Whole project';
  return row.areas.map(area => area.name).join(', ') || 'No area visible';
}

export function ProjectTeamWorkspace({
  userId,
  organization,
  projectId,
  geographies,
  canManageTeam,
  openOperations,
  openNotifications,
}: {
  userId: string;
  organization: string | null;
  projectId?: string | null;
  geographies: Geo[];
  canManageTeam: boolean;
  openOperations?: () => void;
  openNotifications?: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState(projectId || '');
  const [roster, setRoster] = useState<StaffRow[]>([]);
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [metrics, setMetrics] = useState<Metrics>({ submitted: 0, approved: 0, correction: 0, rejected: 0, assignments: 0 });
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [recent, setRecent] = useState<ResponseRow[]>([]);
  const [personNames, setPersonNames] = useState<Record<string, string>>({});
  const [recruitment, setRecruitment] = useState<RecruitmentPlan | null>(null);
  const [compensation, setCompensation] = useState<CompensationPlan | null>(null);
  const [planTarget, setPlanTarget] = useState('');
  const [planVolunteers, setPlanVolunteers] = useState('');
  const [planStatus, setPlanStatus] = useState<'open' | 'closed'>('open');
  const [compMode, setCompMode] = useState<'volunteer' | 'paid'>('volunteer');
  const [compType, setCompType] = useState<CompensationPlan['compensation_type']>('none');
  const [compCurrency, setCompCurrency] = useState('PKR');
  const [compRate, setCompRate] = useState('');
  const [compNote, setCompNote] = useState('Volunteer / unpaid project');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState('project_manager');
  const [person, setPerson] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const detailRequest = useRef(0);

  const project = projects.find(item => item.id === selected) || null;
  const own = roster.find(row => row.user_id === userId && row.status === 'active');
  const projectAreas = useMemo(
    () => project ? geographies.filter(g => g.id === project.geography_id || geographyPath(g.id, geographies).some(x => x.id === project.geography_id)) : [],
    [project, geographies],
  );
  const visibleAreaSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of assignments) counts.set(row.collection_geography_id, (counts.get(row.collection_geography_id) || 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, name: geographyPath(id, geographies).map(g => g.name).join(' / ') || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, geographies]);
  const teamSummary = useMemo(() => ({
    active: roster.filter(row => row.status === 'active').length,
    managers: roster.filter(row => row.status === 'active' && row.role === 'project_manager').length,
    focals: roster.filter(row => row.status === 'active' && row.role === 'area_focal_person').length,
    revoked: roster.filter(row => row.status === 'revoked').length,
  }), [roster]);
  const filteredRoster = useMemo(
    () => rosterFilter === 'all' ? roster : roster.filter(row => row.status === rosterFilter),
    [roster, rosterFilter],
  );
  const completion = project?.target ? Math.min(100, Math.round((metrics.approved / project.target) * 100)) : 0;
  const remaining = project ? Math.max(0, project.target - metrics.approved) : 0;
  const projectGeography = project ? geographyPath(project.geography_id, geographies).map(g => g.name).join(' / ') : '';
  const ownScope = own?.role === 'project_manager' ? 'Whole project' : own?.areas?.length ? own.areas.map(item => item.name).join(', ') : null;

  useEffect(() => {
    let live = true;
    setError('');
    (async () => {
      let query = db!.from('survey_projects').select('*').order('created_at', { ascending: false }).limit(500);
      if (organization) query = query.eq('organization_id', organization);
      if (projectId) query = query.eq('id', projectId);
      const result = await query;
      if (result.error) throw result.error;
      if (!live) return;
      setProjects(result.data || []);
      setSelected(old => projectId || old || (result.data?.[0]?.id || ''));
    })().catch(e => live && setError((e as Error).message));
    return () => { live = false; };
  }, [organization, projectId]);

  async function loadDetail() {
    if (!selected) {
      setRoster([]);
      setAssignments([]);
      setRecent([]);
      setPersonNames({});
      setRecruitment(null);
      setCompensation(null);
      return;
    }
    const request = ++detailRequest.current;
    setBusy(true);
    setError('');
    try {
      const [staff, submitted, approved, correction, rejected, assignmentRows, responseRows] = await Promise.all([
        rpc('project_staff_roster', { p_project: selected }) as unknown as Promise<StaffRow[]>,
        db!.from('survey_responses').select('id', { count: 'exact', head: true }).eq('project_id', selected).eq('status', 'submitted'),
        db!.from('survey_responses').select('id', { count: 'exact', head: true }).eq('project_id', selected).eq('status', 'approved'),
        db!.from('survey_responses').select('id', { count: 'exact', head: true }).eq('project_id', selected).eq('status', 'correction_required'),
        db!.from('survey_responses').select('id', { count: 'exact', head: true }).eq('project_id', selected).eq('status', 'rejected'),
        db!.from('survey_assignments').select('user_id,collection_geography_id', { count: 'exact' }).eq('project_id', selected).eq('active', true).order('collection_geography_id').limit(500),
        db!.from('survey_responses').select('id,person_id,collector_id,status,updated_at,collection_geography_id').eq('project_id', selected).order('updated_at', { ascending: false }).limit(8),
      ]);
      for (const result of [submitted, approved, correction, rejected, assignmentRows, responseRows]) if (result.error) throw result.error;
      const visibleResponses = (responseRows.data || []) as ResponseRow[];
      const ids = [...new Set(visibleResponses.map(row => row.person_id))];
      let names: Record<string, string> = {};
      if (ids.length) {
        const people = await db!.from('registry_persons').select('id,full_name').in('id', ids);
        if (people.error) throw people.error;
        names = Object.fromEntries((people.data || []).map(personRow => [personRow.id, personRow.full_name]));
      }
      const ownStaff = (staff || []).find(row => row.user_id === userId && row.status === 'active');
      let plan: RecruitmentPlan | null = null;
      let comp: CompensationPlan | null = null;
      if (canManageTeam || ownStaff?.role === 'project_manager') {
        [plan, comp] = await Promise.all([
          rpc('project_recruitment_status', { p_project: selected }) as unknown as Promise<RecruitmentPlan>,
          rpc('project_compensation_status', { p_project: selected }) as unknown as Promise<CompensationPlan>,
        ]);
      }
      if (request !== detailRequest.current) return;
      setRoster(staff || []);
      setAssignments((assignmentRows.data || []) as Assignment[]);
      setRecent(visibleResponses);
      setPersonNames(names);
      setMetrics({ submitted: submitted.count || 0, approved: approved.count || 0, correction: correction.count || 0, rejected: rejected.count || 0, assignments: assignmentRows.count || 0 });
      setRecruitment(plan);
      setCompensation(comp);
      if (plan) {
        setPlanTarget(String(plan.target));
        setPlanVolunteers(plan.required_volunteers === null ? '' : String(plan.required_volunteers));
        setPlanStatus(plan.manual_status);
      }
      if (comp) {
        setCompMode(comp.work_mode);
        setCompType(comp.compensation_type);
        setCompCurrency(comp.currency);
        setCompRate(comp.rate === null ? '' : String(comp.rate));
        setCompNote(comp.note);
      }
    } catch (e) {
      if (request === detailRequest.current) setError((e as Error).message);
    } finally {
      if (request === detailRequest.current) setBusy(false);
    }
  }

  useEffect(() => { void loadDetail(); }, [selected]);

  useEffect(() => {
    if (!canManageTeam || !selected) {
      setCandidates([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      rpc('project_staff_candidates', { p_project: selected, p_query: candidateQuery })
        .then(result => { if (live) setCandidates((result || []) as unknown as Candidate[]); })
        .catch(e => { if (live) setError((e as Error).message); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [canManageTeam, selected, candidateQuery, roster.length]);

  useEffect(() => { if (project && !starts) setStarts(project.start_date); }, [project, starts]);

  function addArea() {
    if (!selectableArea(area, geographies)) {
      setError('Choose an active area inside the project geography.');
      return;
    }
    if (area && !areas.includes(area)) setAreas(value => [...value, area]);
    setArea(null);
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!project) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await rpc('assign_project_staff', {
        p_project: project.id,
        p_user: person,
        p_role: role,
        p_areas: role === 'area_focal_person' ? areas : [],
        p_starts: starts,
        p_ends: ends || null,
      });
      setMessage('Project staff assignment created.');
      setPerson('');
      setAreas([]);
      setArea(null);
      await loadDetail();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function revoke(row: StaffRow) { setPendingAction({ kind: 'revoke', row }); }
  function saveRecruitmentPlan(e: FormEvent) { e.preventDefault(); if (project && recruitment) setPendingAction({ kind: 'recruitment' }); }
  function saveCompensationPlan(e: FormEvent) { e.preventDefault(); if (project && compensation?.can_change) setPendingAction({ kind: 'compensation' }); }

  async function confirmPendingAction(reason: string) {
    if (!pendingAction || !project) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (pendingAction.kind === 'revoke') {
        await rpc('revoke_project_staff', { p_id: pendingAction.row.id, p_reason: reason, p_version: pendingAction.row.version });
        setMessage('Project staff access revoked.');
      } else if (pendingAction.kind === 'recruitment') {
        if (!recruitment) return;
        await rpc('set_project_recruitment_plan', {
          p_project: project.id,
          p_target: Number(planTarget),
          p_required_volunteers: Number(planVolunteers),
          p_status: planStatus,
          p_reason: reason,
          p_version: recruitment.version,
        });
        setMessage('Project target and recruitment capacity updated.');
      } else {
        if (!compensation?.can_change) return;
        await rpc('set_project_compensation_defaults', {
          p_project: project.id,
          p_work_mode: compMode,
          p_compensation_type: compMode === 'paid' ? compType : 'none',
          p_currency: compCurrency.toUpperCase(),
          p_rate: compMode === 'paid' ? Number(compRate) : null,
          p_note: compNote,
          p_reason: reason,
          p_version: compensation.version,
        });
        setMessage('Project compensation defaults updated. FieldLance rolled forward the automatic marketplace listing for future applicants; historical opportunity and assignment snapshots were not changed.');
      }
      setPendingAction(null);
      await loadDetail();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!projects.length && !error) {
    return <section className={styles.workspace}>
      <SectionHeader eyebrow="TEAM & ACCESS" title="Project team" description="Manage project-level responsibilities and understand the staff access currently visible through your permissions." />
      <Alert title="No authorized project workspace" tone="neutral">No project team workspace is available in your current scope.</Alert>
    </section>;
  }

  return <section className={styles.workspace} aria-label="Team and access">
    <SectionHeader
      eyebrow="TEAM & ACCESS"
      title="Project team"
      description="Manage project-level responsibilities and understand the staff access currently visible through your permissions."
      actions={<Button type="button" disabled={busy || !selected} onClick={() => void loadDetail()}>Refresh</Button>}
    />

    {error && <Alert title="Project team could not be updated" tone="danger">{error}</Alert>}
    {message && <Alert title="Project team updated" tone="success">{message}</Alert>}

    {!projectId && <Card className={styles.projectSelector}>
      <Select label="Project" value={selected} onChange={e => { setSelected(e.target.value); setStarts(''); setEnds(''); setMessage(''); }}>
        <option value="">Choose project</option>
        {projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </Select>
    </Card>}

    {project && <>
      <Card className={styles.contextCard}>
        <div className={styles.contextIdentity}>
          <span className={styles.contextLabel}>Project / scope context</span>
          <strong>{project.title}</strong>
          <span>{projectGeography || 'Project geography'}</span>
        </div>
        <dl className={styles.contextFacts}>
          <div><dt>Your role</dt><dd>{own ? human(own.role) : canManageTeam ? 'Authorized team manager' : 'Authorized staff'}</dd></div>
          {ownScope && <div><dt>{own?.role === 'area_focal_person' ? 'Assigned scope' : 'Your scope'}</dt><dd>{ownScope}</dd></div>}
          {!ownScope && canManageTeam && <div><dt>Your access</dt><dd>Team management enabled</dd></div>}
          <div><dt>Project period</dt><dd>{project.start_date} → {project.end_date}</dd></div>
        </dl>
      </Card>

      <section className={styles.teamSection}>
        <SectionHeader title="Team summary" description="Counts are derived from the project staff roster already authorized for your current scope." />
        <div className={styles.summaryGrid}>
          <MetricCard label="Active staff" value={teamSummary.active.toLocaleString()} />
          <MetricCard label="Project Managers" value={teamSummary.managers.toLocaleString()} />
          <MetricCard label="Area Focal Persons" value={teamSummary.focals.toLocaleString()} />
          <MetricCard label="Revoked assignments" value={teamSummary.revoked.toLocaleString()} />
        </div>
      </section>

      <Card className={styles.rosterCard}>
        <SectionHeader
          title="Staff roster"
          description="Project-level responsibilities and access assignments currently visible through your permissions."
          actions={<Select label="Roster status" value={rosterFilter} onChange={e => setRosterFilter(e.target.value as RosterFilter)} className={styles.rosterFilter}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </Select>}
        />
        {filteredRoster.length ? <>
          <div className={styles.desktopRoster}>
            <DataTable caption="Project staff roster">
              <thead><tr><th>Person</th><th>Role</th><th>Assigned scope</th><th>Status</th><th>Active period</th>{canManageTeam && <th>Action</th>}</tr></thead>
              <tbody>{filteredRoster.map(row => {
                const name = row.name || row.user_id;
                return <tr key={row.id}>
                  <td><strong>{name}</strong></td>
                  <td>{human(row.role)}</td>
                  <td>{scopeFor(row)}</td>
                  <td><StatusBadge tone={statusTone(row.status)}>{human(row.status)}</StatusBadge></td>
                  <td>{row.starts_at} → {row.ends_at || 'project end'}</td>
                  {canManageTeam && <td>{row.status === 'active' ? <Button type="button" variant="danger" disabled={busy} aria-label={`Revoke access for ${name}`} onClick={() => revoke(row)}>Revoke access</Button> : '—'}</td>}
                </tr>;
              })}</tbody>
            </DataTable>
          </div>
          <div className={styles.mobileRoster} aria-label="Project staff roster">
            {filteredRoster.map(row => {
              const name = row.name || row.user_id;
              return <MobileRecordCard
                key={row.id}
                title={name}
                status={<StatusBadge tone={statusTone(row.status)}>{human(row.status)}</StatusBadge>}
                meta={human(row.role)}
                rows={[
                  { label: 'Assigned scope', value: scopeFor(row) },
                  { label: 'Active period', value: `${row.starts_at} → ${row.ends_at || 'project end'}` },
                ]}
                action={canManageTeam && row.status === 'active' ? <Button type="button" variant="danger" disabled={busy} aria-label={`Revoke access for ${name}`} onClick={() => revoke(row)}>Revoke access</Button> : undefined}
              />;
            })}
          </div>
        </> : !busy && <p className={styles.emptyState}>No project staff assignments match this roster filter.</p>}
      </Card>

      {canManageTeam && <Card className={styles.assignmentCard}>
        <SectionHeader title="Assign project staff" description="Choose an authorized organization member and create a project-level responsibility assignment." />
        <form className={styles.assignmentForm} onSubmit={assign}>
          <FieldGroup columns={2}>
            <Field label="Find organization member">
              <input className="fl-control" value={candidateQuery} maxLength={100} placeholder="Name or email" onChange={e => setCandidateQuery(e.target.value)} />
            </Field>
            <Select label="Member" required value={person} onChange={e => setPerson(e.target.value)}>
              <option value="">Choose active member</option>
              {candidates.map(candidate => <option key={candidate.user_id} value={candidate.user_id}>{candidate.name || candidate.email || candidate.user_id}</option>)}
            </Select>
            <Select label="Role" value={role} onChange={e => { setRole(e.target.value); setAreas([]); setArea(null); }}>
              <option value="project_manager">Project Manager</option>
              <option value="area_focal_person">Area Focal Person</option>
            </Select>
            <Field label="Starts" required>
              <input className="fl-control" required type="date" min={project.start_date} max={project.end_date} value={starts} onChange={e => setStarts(e.target.value)} />
            </Field>
            <Field label="Ends (optional)">
              <input className="fl-control" type="date" min={starts || project.start_date} max={project.end_date} value={ends} onChange={e => setEnds(e.target.value)} />
            </Field>
          </FieldGroup>
          {role === 'area_focal_person' && <div className={styles.areaAssignment}>
            <AreaSelector rows={projectAreas} value={area} onChange={setArea} title="Focal area" disabled={busy} />
            <Button type="button" onClick={addArea} disabled={busy || !area}>Add area</Button>
            {areas.length > 0 && <div className={styles.areaChips} aria-label="Selected focal areas">
              {areas.map(id => {
                const name = geographyPath(id, geographies).map(g => g.name).join(' / ') || id;
                return <span className={styles.areaChip} key={id}>{name}<Button type="button" variant="tertiary" className={styles.areaChipRemove} aria-label={`Remove ${name}`} onClick={() => setAreas(value => value.filter(item => item !== id))}>Remove</Button></span>;
              })}
            </div>}
          </div>}
          <FormActions><Button type="submit" variant="primary" disabled={busy || !person || (role === 'area_focal_person' && !areas.length)}>Assign staff</Button></FormActions>
        </form>
      </Card>}

      {!canManageTeam && <section className={styles.operationalSection}>
        <SectionHeader
          eyebrow="OPERATIONAL CONTEXT"
          title="Current project activity"
          description="These metrics and records remain filtered by your current database permissions and project/geography scope."
          actions={<div className={styles.quickActions} aria-label="Project quick actions">
            <Button type="button" variant="primary" onClick={openOperations}>Open responses & reviews</Button>
            {openNotifications && <Button type="button" onClick={openNotifications}>Open notifications</Button>}
          </div>}
        />
        <div className={styles.operationsMetrics}>
          <MetricCard label="Active survey assignments" value={metrics.assignments.toLocaleString()} />
          <MetricCard label="Pending review" value={metrics.submitted.toLocaleString()} />
          <MetricCard label="Approved" value={metrics.approved.toLocaleString()} />
          <MetricCard label="Corrections" value={metrics.correction.toLocaleString()} />
          <MetricCard label="Rejected" value={metrics.rejected.toLocaleString()} />
        </div>
        <Alert title="Collection eligibility remains separate" tone="info">Historical survey records do not establish collection eligibility. Workers need accepted active contracts.</Alert>
        <div className={styles.operationsGrid}>
          <Card className={styles.operationsCard}>
            <SectionHeader eyebrow="FIELD COVERAGE" title="Visible assignment areas" description={`${visibleAreaSummary.length} area${visibleAreaSummary.length === 1 ? '' : 's'} visible in your current scope.`} />
            <div className={styles.areaRows}>{visibleAreaSummary.map(row => <div className={styles.areaRow} key={row.id}><span>{row.name}</span><strong>{row.count} active</strong></div>)}</div>
            {!visibleAreaSummary.length && !busy && <p className={styles.emptyState}>No active volunteer assignment is visible in your current scope.</p>}
          </Card>
          <Card className={styles.operationsCard}>
            <SectionHeader eyebrow="REVIEW QUEUE" title="Latest visible responses" actions={<Button type="button" variant="tertiary" onClick={openOperations}>Open all</Button>} />
            <div className={styles.responseRows}>{recent.map(row => <div className={styles.responseRow} key={row.id}>
              <div><strong>{personNames[row.person_id] || `Response ${row.id.slice(0, 8)}`}</strong><span>{geographyPath(row.collection_geography_id, geographies).map(g => g.name).join(' / ') || 'Collection area'}</span></div>
              <div><StatusBadge tone={statusTone(row.status)}>{human(row.status)}</StatusBadge><small>{new Date(row.updated_at).toLocaleString()}</small></div>
            </div>)}</div>
            {!recent.length && !busy && <p className={styles.emptyState}>No response is visible in your current scope.</p>}
          </Card>
        </div>
      </section>}

      {recruitment && <Card className={styles.secondaryCard}>
        <SectionHeader
          eyebrow="STAFFING POLICY"
          title={recruitment.effective_open ? 'Recruitment open' : 'Recruitment paused'}
          description="Soft target and recruitment capacity guide future marketplace and offer decisions; they do not change existing field-submission semantics."
          actions={<StatusBadge tone={recruitment.effective_open ? 'success' : 'neutral'}>{recruitment.effective_open ? 'Open' : 'Closed'}</StatusBadge>}
        />
        <div className={styles.policyMetrics}>
          <MetricCard label="Approved target" value={`${recruitment.approved.toLocaleString()} / ${recruitment.target.toLocaleString()}`} />
          <MetricCard label="Remaining target" value={recruitment.remaining_target.toLocaleString()} />
          <MetricCard label="Committed volunteers" value={`${recruitment.committed_volunteers}${recruitment.required_volunteers === null ? '' : ` / ${recruitment.required_volunteers}`}`} />
          <MetricCard label="Open capacity" value={recruitment.remaining_capacity === null ? 'Not configured' : recruitment.remaining_capacity.toLocaleString()} />
        </div>
        {recruitment.over_target > 0 && <Alert title="Over target" tone="warning">Over-target approved responses: {recruitment.over_target}. Existing/offline field submissions are retained; review and close collection operationally when appropriate.</Alert>}
        {recruitment.target_reached && <Alert title="Approved target reached" tone="info">New recruitment/offers are blocked, but existing active field work can still synchronize.</Alert>}
        {recruitment.capacity_reached && <Alert title="Volunteer capacity reached" tone="warning">Increase capacity before creating new assignment offers.</Alert>}
        <div className={styles.progressBlock}>
          <div><strong>{metrics.approved.toLocaleString()} / {project.target.toLocaleString()}</strong><span>{remaining.toLocaleString()} target responses remaining</span></div>
          <div className={styles.progressMeter}><progress max={100} value={completion} aria-label="Approved response target completion" /><span>{completion}%</span></div>
        </div>
        <form className={styles.secondaryForm} onSubmit={saveRecruitmentPlan}>
          <FieldGroup columns={2}>
            <Field label="Approved-response target" required><input className="fl-control" type="number" min={recruitment.target} max={1000000} required value={planTarget} onChange={e => setPlanTarget(e.target.value)} /></Field>
            <Field label="Required volunteers" required><input className="fl-control" type="number" min={Math.max(1, recruitment.committed_volunteers)} max={5000} required value={planVolunteers} onChange={e => setPlanVolunteers(e.target.value)} /></Field>
            <Select label="Manual recruitment gate" value={planStatus} onChange={e => setPlanStatus(e.target.value as 'open' | 'closed')}>
              <option value="open">Open when target/capacity allow</option>
              <option value="closed">Closed by manager</option>
            </Select>
          </FieldGroup>
          <p className={styles.helper}>Target counts approved responses only. Closing recruitment does not reject already-created/offline survey submissions.</p>
          <FormActions><Button type="submit" disabled={busy || !planTarget || !planVolunteers}>Update recruitment plan</Button></FormActions>
        </form>
      </Card>}

      {compensation && <Card className={styles.secondaryCard}>
        <SectionHeader
          eyebrow="COMPENSATION DEFAULTS"
          title={compensation.work_mode === 'paid' ? `${compensation.currency} ${Number(compensation.rate || 0).toLocaleString()} · ${human(compensation.compensation_type)}` : 'Volunteer / unpaid'}
          description="Defaults are snapshotted into automatic marketplace opportunities. Existing assignments and payables retain their original terms."
          actions={<StatusBadge tone={compensation.work_mode === 'paid' ? 'info' : 'neutral'}>{human(compensation.work_mode)}</StatusBadge>}
        />
        <p className={styles.helper}>{compensation.note}</p>
        {compensation.can_change ? <form className={styles.secondaryForm} onSubmit={saveCompensationPlan}>
          <FieldGroup columns={2}>
            <Select label="Work mode" value={compMode} onChange={e => {
              const mode = e.target.value as 'volunteer' | 'paid';
              setCompMode(mode);
              if (mode === 'volunteer') {
                setCompType('none');
                setCompRate('');
                if (!compNote.trim() || compNote === compensation.note) setCompNote('Volunteer / unpaid project');
              } else if (compType === 'none') setCompType('per_verified_survey');
            }}>
              <option value="volunteer">Volunteer / unpaid</option><option value="paid">Paid</option>
            </Select>
            {compMode === 'paid' && <>
              <Select label="Compensation basis" value={compType} onChange={e => setCompType(e.target.value as CompensationPlan['compensation_type'])}>
                <option value="per_verified_survey">Per verified survey</option><option value="daily_rate">Daily rate</option><option value="fixed_assignment">Fixed assignment</option>
              </Select>
              <Field label="Currency"><input className="fl-control" value={compCurrency} maxLength={3} onChange={e => setCompCurrency(e.target.value.toUpperCase())} /></Field>
              <Field label="Rate" required><input className="fl-control" type="number" min="0.01" step="0.01" required value={compRate} onChange={e => setCompRate(e.target.value)} /></Field>
            </>}
          </FieldGroup>
          <Textarea label="Compensation note" minLength={3} maxLength={1000} required value={compNote} onChange={e => setCompNote(e.target.value)} />
          <p className={styles.helper}>Changing these defaults rolls the automatic marketplace listing forward for future applicants. Historical opportunities, existing applications, assignment contracts and payable units keep their original terms.</p>
          <FormActions><Button type="submit" disabled={busy || !compNote.trim() || (compMode === 'paid' && (!compRate || compType === 'none'))}>Update compensation defaults</Button></FormActions>
        </form> : <Alert title="Compensation defaults are read-only" tone="neutral">Project Managers can use these terms for recruitment and assignment offers but cannot change the compensation defaults. NGO Admin or FieldLance survey-management authority is required.</Alert>}
      </Card>}
    </>}

    <ReasonDialog
      open={Boolean(pendingAction)}
      title={pendingAction?.kind === 'revoke' ? `Revoke ${pendingAction.row.name || 'project staff'} access?` : pendingAction?.kind === 'recruitment' ? 'Update recruitment plan?' : 'Update compensation defaults?'}
      description={pendingAction?.kind === 'revoke' ? `Remove ${pendingAction.row.name || 'this staff member'} from ${human(pendingAction.row.role)} access${pendingAction.row.areas.length ? ` for ${pendingAction.row.areas.map(item => item.name).join(', ')}` : ''}. Existing audit history is retained.` : pendingAction?.kind === 'recruitment' ? 'The target and recruitment-capacity controls affect future recruitment decisions; existing field submissions are retained.' : 'New compensation defaults apply only to future opportunity snapshots and do not rewrite existing assignments or payables.'}
      confirmLabel={pendingAction?.kind === 'revoke' ? 'Revoke access' : 'Confirm update'}
      danger={pendingAction?.kind === 'revoke'}
      reasonLabel="Reason for change"
      initialReason={pendingAction?.kind === 'revoke' ? 'Project staffing changed' : pendingAction?.kind === 'recruitment' ? 'Operational recruitment plan updated' : 'Project compensation terms updated for future recruitment'}
      minReasonLength={5}
      busy={busy}
      onCancel={() => setPendingAction(null)}
      onConfirm={confirmPendingAction}
    />
  </section>;
}
