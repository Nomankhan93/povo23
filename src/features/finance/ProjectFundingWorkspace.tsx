import { executeFundingRequest, readFundingRequest, retainFundingRequest, clearFundingRequest, type FundingRequest } from './fundingRequest';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { db, rpc } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';
import { human } from '../../shared/ui/FormFields';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  FormActions,
  MetricCard,
  MobileRecordCard,
  SectionHeader,
  StatusBadge,
} from '../../components/ui/FieldLanceUI';
import styles from './ProjectFundingWorkspace.module.css';

type Project = Pick<Database['public']['Tables']['survey_projects']['Row'], 'id' | 'organization_id' | 'title' | 'status' | 'compensation_currency'>;
type Org = Pick<Database['public']['Tables']['organizations']['Row'], 'id' | 'name'>;
type FundingSource = { id: string; organization_id: string; source_type: string; name: string; external_reference: string | null; currency: string; note: string; created_at: string };
type FundingStatus = { project_id: string; project_title: string; organization_id: string; project_status: string; currency: string; organization_available: number; project_reserved: number; project_committed: number; project_spent: number; project_funding_total: number; can_manage: boolean; can_record_external: boolean };
type FundingHistory = { project_id: string; currency: string; rows: Array<{ id: string; journal_type: string; reference_type: string | null; reference_id: string | null; memo: string; posted_at: string; created_by: string; amount: number }> };
type PayableReconciliation = { project_id: string; currency: string; approved_entitlement: number; recorded_payments: number; expected_committed: number; expected_spent: number; finance_reserved: number; finance_committed: number; finance_spent: number; monetary_events: number; linked_events: number; unbridged_events: number; matched: boolean; can_reconcile: boolean };
type FundingAssurance = { reserved_balance: number; pending_offer_commitment: number; active_assignment_commitment: number; released_commitment: number; coverage_available: number; shortfall: number; paid_offer_gate: boolean; project_closure_state: string };
type ClosureStatus = { state: string; status: string; active_assignments: number; pending_commitments: number; unbridged_events: number; financially_reconciled: boolean };
type FundingConfirmation = { contextKey: string; request: FundingRequest; form: HTMLFormElement; title: string; description: string; confirmLabel: string; danger: boolean };
type OperationalConfirmation =
  | { contextKey: string; kind: 'reconcile'; project: string; currency: string }
  | { contextKey: string; kind: 'sweep'; project: string }
  | { contextKey: string; kind: 'closure'; project: string; state: string };

function formatFinanceDecimal(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!/^-?\d+(?:\.\d{1,4})?$/.test(raw)) return 'Unavailable';
    const negative = raw.startsWith('-');
    const unsigned = negative ? raw.slice(1) : raw;
    const [whole, fraction] = unsigned.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

const money = (value: unknown, currency: string) => {
  const formatted = formatFinanceDecimal(value);
  return formatted === 'Unavailable' ? formatted : `${currency} ${formatted}`;
};

function statusTone(value: string) {
  if (['active', 'fully_closed', 'covered', 'matched'].includes(value)) return 'success' as const;
  if (['shortfall', 'attention', 'collection_closed', 'operational_completed', 'financially_reconciled'].includes(value)) return 'warning' as const;
  return 'neutral' as const;
}

function pendingProject(request: FundingRequest) {
  return 'p_project' in request.args ? request.args.p_project : null;
}

function pendingCurrency(request: FundingRequest) {
  return 'p_currency' in request.args ? request.args.p_currency : request.name === 'record_organization_funding' ? 'source currency' : '';
}

export function ProjectFundingWorkspace({ userId, organization, platform, orgs, projectId = null }: { userId: string; organization: string | null; platform: boolean; orgs: Org[]; projectId?: string | null }) {
  const [org, setOrg] = useState(organization || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState(projectId || '');
  const [currency, setCurrency] = useState('PKR');
  const [status, setStatus] = useState<FundingStatus | null>(null);
  const [assurance, setAssurance] = useState<FundingAssurance | null>(null);
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [reconciliation, setReconciliation] = useState<PayableReconciliation | null>(null);
  const [history, setHistory] = useState<FundingHistory['rows']>([]);
  const [sources, setSources] = useState<FundingSource[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<FundingRequest | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [loadedContext, setLoadedContext] = useState('');
  const [fundingConfirmation, setFundingConfirmation] = useState<FundingConfirmation | null>(null);
  const [operationalConfirmation, setOperationalConfirmation] = useState<OperationalConfirmation | null>(null);
  const sending = useRef(false);
  const loadGeneration = useRef(0);
  const contextKey = `${org}|${project}|${currency.trim().toUpperCase()}`;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;

  const selected = useMemo(() => projects.find(item => item.id === project) || null, [projects, project]);
  const contextReady = Boolean(project && loadedContext === contextKey && status);
  const mutationBlocked = acting || loading || Boolean(pending) || storageBlocked || !contextReady;

  useEffect(() => {
    try {
      setPending(readFundingRequest(userId));
      setStorageBlocked(false);
    } catch {
      setStorageBlocked(true);
      setError('Pending funding request could not be read. Restore browser storage before submitting funding.');
    }
  }, [userId]);

  useEffect(() => {
    setOrg(organization || '');
    setProject(projectId || '');
    setStatus(null);
    setAssurance(null);
    setClosure(null);
    setReconciliation(null);
    setHistory([]);
    setSources([]);
    setSource('');
    setLoadedContext('');
    setFundingConfirmation(null);
    setOperationalConfirmation(null);
  }, [organization, projectId]);

  useEffect(() => {
    let live = true;
    if (!org) {
      setProjects([]);
      return;
    }
    setError('');
    let query = db!.from('survey_projects').select('id,organization_id,title,status,compensation_currency').eq('organization_id', org);
    if (projectId) query = query.eq('id', projectId);
    void query.order('created_at', { ascending: false }).limit(500).then(({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      else {
        const rows = (data || []) as Project[];
        setProjects(rows);
        setProject(old => projectId || (rows.some(item => item.id === old) ? old : (rows[0]?.id || '')));
      }
    });
    return () => { live = false; };
  }, [org, projectId]);

  useEffect(() => {
    if (selected?.compensation_currency) setCurrency(selected.compensation_currency);
  }, [selected?.id, selected?.compensation_currency]);

  useEffect(() => {
    setFundingConfirmation(null);
    setOperationalConfirmation(null);
  }, [contextKey]);

  async function load() {
    const generation = ++loadGeneration.current;
    const requestedContext = contextKey;
    if (!project) {
      setStatus(null);
      setAssurance(null);
      setClosure(null);
      setReconciliation(null);
      setHistory([]);
      setSources([]);
      setSource('');
      setLoadedContext('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setStatus(null);
    setAssurance(null);
    setClosure(null);
    setReconciliation(null);
    setHistory([]);
    setSources([]);
    setSource('');
    setLoadedContext('');

    try {
      const [nextStatus, nextAssurance, nextClosure, nextReconciliation, nextHistory] = await Promise.all([
        rpc('project_funding_status', { p_project: project, p_currency: currency }) as unknown as Promise<FundingStatus>,
        rpc('project_funding_assurance', { p_project: project, p_currency: currency }) as unknown as Promise<FundingAssurance>,
        rpc('project_closure_status', { p_project: project }) as unknown as Promise<ClosureStatus>,
        rpc('project_payable_finance_reconciliation', { p_project: project, p_currency: currency }) as unknown as Promise<PayableReconciliation>,
        rpc('project_funding_history', { p_project: project, p_currency: currency, p_before: null, p_limit: 50 }) as unknown as Promise<FundingHistory>,
      ]);
      if (generation !== loadGeneration.current || contextRef.current !== requestedContext) return;

      setStatus(nextStatus);
      setAssurance(nextAssurance);
      setClosure(nextClosure);
      setReconciliation(nextReconciliation);
      setHistory(nextHistory.rows || []);
      setLoadedContext(requestedContext);

      if (org) {
        const result = await db!.from('finance_funding_sources').select('*').eq('organization_id', org).eq('currency', currency).order('created_at', { ascending: false }).limit(100);
        if (generation !== loadGeneration.current || contextRef.current !== requestedContext) return;
        if (result.error) throw result.error;
        const rows = (result.data || []) as FundingSource[];
        setSources(rows);
        setSource(old => rows.some(item => item.id === old) ? old : (rows[0]?.id || ''));
      }
    } catch (cause) {
      if (generation !== loadGeneration.current || contextRef.current !== requestedContext) return;
      setError((cause as Error).message);
    } finally {
      if (generation === loadGeneration.current && contextRef.current === requestedContext) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [org, project, currency]);

  async function act(fn: () => Promise<unknown>, success: string) {
    setActing(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(success);
      await load();
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setActing(false);
    }
  }

  async function executeFunding(request: FundingRequest, form?: HTMLFormElement) {
    if (sending.current) return;
    sending.current = true;
    setActing(true);
    setError('');
    setMessage('');
    try {
      retainFundingRequest(request);
      setPending({ ...request, uncertain: true });
      const result = await executeFundingRequest(request, operation => {
        switch (operation.name) {
          case 'record_organization_funding': return rpc(operation.name, operation.args);
          case 'reserve_project_funding': return rpc(operation.name, operation.args);
          case 'release_project_funding': return rpc(operation.name, operation.args);
        }
      }, async operation => {
        const { data, error } = await db!.from('finance_journals').select('id,created_by,journal_type')
          .eq('idempotency_key', operation.args.p_idempotency_key!)
          .eq('organization_id', operation.organization)
          .eq('created_by', userId)
          .maybeSingle();
        if (error) throw error;
        const expected = {
          record_organization_funding: 'organization_funding_received',
          reserve_project_funding: 'project_funding_reserved',
          release_project_funding: 'project_funding_released',
        }[operation.name];
        if (data && data.journal_type !== expected) throw Error('Journal identity conflict');
        return Boolean(data);
      });
      if (result.state === 'uncertain') {
        setError(result.message);
        return;
      }
      clearFundingRequest(userId);
      setPending(null);
      if (result.state === 'rejected') {
        setError(result.message);
        return;
      }
      form?.reset();
      setMessage(result.message);
      await load();
    } catch {
      setStorageBlocked(true);
      setError('Unable to protect or confirm this funding request. Keep this page open and retry after browser storage and connectivity are available.');
    } finally {
      sending.current = false;
      setActing(false);
    }
  }

  function submitFunding(event: FormEvent<HTMLFormElement>, name: FundingRequest['name']) {
    event.preventDefault();
    if (pending || sending.current || !contextReady) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const base = { organization: org, userId, uncertain: false };
    const common = { p_amount: Number(data.get('amount')), p_idempotency_key: crypto.randomUUID() };
    const request: FundingRequest = name === 'record_organization_funding'
      ? { ...base, name, args: { ...common, p_source: source, p_memo: String(data.get('memo') || '').trim() } }
      : { ...base, name, args: { ...common, p_project: project, p_currency: currency.trim().toUpperCase(), p_reason: String(data.get('reason') || '').trim() } };

    const description = name === 'record_organization_funding'
      ? `Organization: ${org}. Amount: ${money(common.p_amount, currency)}. Funding source: ${source}. This records verified funding in the immutable finance journal.`
      : `Project: ${selected?.title || project}. Currency: ${currency}. Amount: ${money(common.p_amount, currency)}. ${name === 'reserve_project_funding' ? 'Available organization funding will be reserved for this project.' : 'Unused project reservation will be returned to organization availability.'}`;
    setFundingConfirmation({
      contextKey,
      request,
      form,
      title: name === 'record_organization_funding' ? 'Record verified organization funding?' : name === 'reserve_project_funding' ? 'Reserve project funding?' : 'Release project funding?',
      description,
      confirmLabel: name === 'record_organization_funding' ? 'Record verified funding' : name === 'reserve_project_funding' ? 'Reserve funding' : 'Release reservation',
      danger: name === 'release_project_funding',
    });
  }

  async function confirmFunding() {
    const snapshot = fundingConfirmation;
    if (!snapshot) return;
    if (snapshot.contextKey !== contextRef.current) {
      setFundingConfirmation(null);
      setError('The project funding context changed. Review the current project and submit the operation again.');
      return;
    }
    setFundingConfirmation(null);
    await executeFunding(snapshot.request, snapshot.form);
  }

  const reserve = (event: FormEvent<HTMLFormElement>) => submitFunding(event, 'reserve_project_funding');
  const release = (event: FormEvent<HTMLFormElement>) => submitFunding(event, 'release_project_funding');
  const recordFunding = (event: FormEvent<HTMLFormElement>) => submitFunding(event, 'record_organization_funding');

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const success = await act(async () => {
        const id = await rpc('create_finance_funding_source', {
          p_organization: org,
          p_source_type: String(data.get('type')),
          p_name: String(data.get('name')),
          p_external_reference: String(data.get('reference') || '') || null,
          p_currency: currency,
          p_note: String(data.get('note') || ''),
        });
        setSource(id as string);
      }, 'Funding source registered.');
      if (success) form.reset();
    } finally {
      sending.current = false;
    }
  }

  function requestOperationalConfirmation(next: OperationalConfirmation) {
    if (!contextReady) return;
    setOperationalConfirmation(next);
  }

  async function confirmOperationalAction() {
    const snapshot = operationalConfirmation;
    if (!snapshot || sending.current) return;
    if (snapshot.contextKey !== contextRef.current) {
      setOperationalConfirmation(null);
      setError('The project funding context changed. Review the current project before continuing.');
      return;
    }
    sending.current = true;
    setOperationalConfirmation(null);
    try {
      if (snapshot.kind === 'reconcile') {
        await act(() => rpc('reconcile_project_payable_finance', { p_project: snapshot.project, p_currency: snapshot.currency, p_limit: 100 }), 'Historical payable events reconciled into project finance.');
      } else if (snapshot.kind === 'sweep') {
        await act(() => rpc('sweep_expired_project_funding_commitments', { p_project: snapshot.project, p_limit: 100 }), 'Expired paid-work commitments released.');
      } else {
        await act(() => rpc('advance_project_closure', { p_project: snapshot.project, p_state: snapshot.state, p_note: `Project closure: ${human(snapshot.state)} confirmation`, p_version: 0 }), 'Project closure state advanced.');
      }
    } finally {
      sending.current = false;
    }
  }

  const operationalDialog = operationalConfirmation ? (() => {
    if (operationalConfirmation.kind === 'reconcile') return { title: 'Reconcile historical payable events?', description: `Project: ${selected?.title || operationalConfirmation.project}. Currency: ${operationalConfirmation.currency}. This records missing payable-to-finance bridge entries using existing server rules.`, confirmLabel: 'Reconcile events', danger: false };
    if (operationalConfirmation.kind === 'sweep') return { title: 'Release expired paid-work commitments?', description: `Project: ${selected?.title || operationalConfirmation.project}. Only commitments the server identifies as expired are eligible for release.`, confirmLabel: 'Release expired commitments', danger: false };
    return { title: `${human(operationalConfirmation.state)}?`, description: `Project: ${selected?.title || operationalConfirmation.project}. Project closure transitions are controlled and server-validated.`, confirmLabel: human(operationalConfirmation.state), danger: operationalConfirmation.state === 'fully_closed' };
  })() : null;

  const pendingProjectId = pending ? pendingProject(pending) : null;
  const pendingCurrencyLabel = pending ? pendingCurrency(pending) : '';

  return <section className={styles.workspace}>
    <SectionHeader
      eyebrow="PROJECT FINANCE"
      title="Project funding & reservation"
      description="Available, reserved, committed and spent values come from immutable finance postings. There is no editable balance field."
      actions={status ? <StatusBadge tone={statusTone(status.project_status)}>{human(status.project_status)}</StatusBadge> : undefined}
    />

    {error && <Alert title="Project finance needs attention" tone="danger">{error}</Alert>}
    {message && <Alert title="Project finance updated" tone="success">{message}</Alert>}
    {storageBlocked && <Alert title="Browser storage is required for safe funding requests" tone="danger">Funding operations remain disabled until the pending request store can be read and written safely.</Alert>}
    {pending && <Alert
      title="Funding outcome not yet confirmed"
      tone="warning"
      action={<Button variant="primary" disabled={acting} onClick={() => void executeFunding(pending)}>Retry same request</Button>}
    >
      <div className={styles.pendingDetails}>
        <span>Operation: {human(pending.name)}</span>
        <span>Amount: {pending.args.p_amount}</span>
        {pendingProjectId && <span>Project ID: {pendingProjectId}</span>}
        {pendingCurrencyLabel && <span>Currency: {pendingCurrencyLabel}</span>}
        <span>{'p_memo' in pending.args ? pending.args.p_memo : pending.args.p_reason}</span>
      </div>
      The original request ID and payload are retained across navigation and reload. Do not create a replacement operation.
    </Alert>}

    <Card className={styles.contextCard}>
      <SectionHeader eyebrow="FINANCE CONTEXT" title="Project and currency" description="Metrics and financial actions stay disabled until this exact context has been verified." />
      <div className={styles.contextGrid}>
        {platform && !projectId && <Field label="Organization"><select className="fl-control" value={org} disabled={acting || Boolean(pending)} onChange={event => { setOrg(event.target.value); setProject(''); }}><option value="">Choose organization</option>{orgs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
        {projectId
          ? <Field label="Project"><input className="fl-control" value={selected?.title || 'Loading project…'} readOnly aria-readonly="true" /></Field>
          : <Field label="Project"><select className="fl-control" value={project} disabled={!org || acting || Boolean(pending)} onChange={event => setProject(event.target.value)}><option value="">Choose project</option>{projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>}
        <Field label="Currency"><input className="fl-control" value={currency} disabled={acting || Boolean(pending)} maxLength={3} pattern="[A-Z]{3}" onChange={event => setCurrency(event.target.value.toUpperCase())} /></Field>
      </div>
      {projects.length >= 500 && <p className={styles.helper}>The project selector is currently limited to the latest 500 projects for this organization.</p>}
      {loading && <p className={styles.helper} role="status">Loading verified project finance context…</p>}
    </Card>

    {status && contextReady && <section className={styles.section}>
      <SectionHeader eyebrow="FUNDING POSITION" title="Current ledger position" description="Values shown below belong to the verified project, organization and currency context above." />
      <div className={styles.metricGrid}>
        <MetricCard label="Organization available" value={money(status.organization_available, currency)} />
        <MetricCard label="Project reserved" value={money(status.project_reserved, currency)} />
        <MetricCard label="Committed" value={money(status.project_committed, currency)} />
        <MetricCard label="Spent" value={money(status.project_spent, currency)} />
      </div>
      <Alert title={`Project funding total: ${money(status.project_funding_total, currency)}`} tone="info">Approved payable events move reservation into committed funding; recorded settlements move commitment into spent.</Alert>
    </section>}

    {assurance && contextReady && <Card className={styles.sectionCard}>
      <SectionHeader
        eyebrow="PAID WORK FUNDING ASSURANCE"
        title={assurance.paid_offer_gate ? 'Paid offers covered' : 'Paid offers blocked'}
        description="Published paid opportunities are checked atomically against reserved project funding before they can open."
        actions={<StatusBadge tone={assurance.shortfall > 0 ? 'warning' : 'success'}>{assurance.shortfall > 0 ? 'Shortfall' : 'Covered'}</StatusBadge>}
      />
      <div className={styles.metricGrid}>
        <MetricCard label="Pending offers" value={money(assurance.pending_offer_commitment, currency)} />
        <MetricCard label="Active assignments" value={money(assurance.active_assignment_commitment, currency)} />
        <MetricCard label="Coverage available" value={money(assurance.coverage_available, currency)} />
        <MetricCard label="Shortfall" value={money(assurance.shortfall, currency)} />
      </div>
      <p className={styles.helper}>Pending and active commitments remain protected until an opportunity expires, an assignment is cancelled, or the payable lifecycle settles them.</p>
      {status?.can_manage && <FormActions><Button disabled={mutationBlocked} onClick={() => requestOperationalConfirmation({ contextKey, kind: 'sweep', project })}>Release expired commitments</Button></FormActions>}
    </Card>}

    {status?.can_manage && contextReady && <section className={styles.section}>
      <SectionHeader eyebrow="FUNDING OPERATIONS" title="Reserve or release project funding" description="These are direct authorized ledger operations, not funding approval requests." />
      <div className={styles.operationGrid}>
        <Card className={styles.operationCard}>
          <SectionHeader title="Reserve project funding" description="Move verified organization availability into this project." />
          <form className={styles.formStack} onSubmit={reserve}>
            <Field label="Amount"><input className="fl-control" name="amount" type="number" min="0.0001" step="0.0001" required /></Field>
            <Field label="Reason"><textarea className="fl-control fl-textarea" name="reason" minLength={3} maxLength={1000} required /></Field>
            <FormActions><Button variant="primary" disabled={mutationBlocked}>Review reservation</Button></FormActions>
          </form>
        </Card>
        <Card className={styles.operationCard}>
          <SectionHeader title="Release unused reservation" description="Return unused project reservation to organization availability." />
          <form className={styles.formStack} onSubmit={release}>
            <Field label="Amount"><input className="fl-control" name="amount" type="number" min="0.0001" step="0.0001" required /></Field>
            <Field label="Reason"><textarea className="fl-control fl-textarea" name="reason" minLength={3} maxLength={1000} required /></Field>
            <FormActions><Button disabled={mutationBlocked || Number(status.project_reserved) <= 0}>Review release</Button></FormActions>
          </form>
        </Card>
      </div>
    </section>}

    {reconciliation && contextReady && <Card className={styles.sectionCard}>
      <SectionHeader
        eyebrow="PAYABLE RECONCILIATION"
        title="Payable → finance bridge"
        description="Worker entitlement stays in Workforce payables. This verifies that monetary payable events are represented once in aggregate project finance."
        actions={<StatusBadge tone={reconciliation.matched ? 'success' : 'warning'}>{reconciliation.matched ? 'Matched' : 'Attention'}</StatusBadge>}
      />
      <div className={styles.metricGrid}>
        <MetricCard label="Approved entitlement" value={money(reconciliation.approved_entitlement, currency)} />
        <MetricCard label="Recorded payments" value={money(reconciliation.recorded_payments, currency)} />
        <MetricCard label="Expected committed" value={money(reconciliation.expected_committed, currency)} />
        <MetricCard label="Unbridged events" value={reconciliation.unbridged_events} />
      </div>
      <p className={styles.helper}>Finance committed {money(reconciliation.finance_committed, currency)} · Finance spent {money(reconciliation.finance_spent, currency)} · Linked {reconciliation.linked_events}/{reconciliation.monetary_events} monetary events.</p>
      {reconciliation.can_reconcile && reconciliation.unbridged_events > 0 && <FormActions><Button disabled={mutationBlocked} onClick={() => requestOperationalConfirmation({ contextKey, kind: 'reconcile', project, currency })}>Reconcile historical payable events</Button></FormActions>}
    </Card>}

    {closure && contextReady && <Card className={styles.sectionCard}>
      <SectionHeader
        eyebrow="PROJECT FINANCE CLOSURE"
        title={human(closure.state)}
        description="Collection, operational completion, financial reconciliation and final closure remain separate controlled transitions."
        actions={<StatusBadge tone={statusTone(closure.state)}>{human(closure.state)}</StatusBadge>}
      />
      <div className={styles.metricGrid}>
        <MetricCard label="Active assignments" value={closure.active_assignments} />
        <MetricCard label="Pending commitments" value={closure.pending_commitments} />
        <MetricCard label="Unbridged events" value={closure.unbridged_events} />
        <MetricCard label="Finance reconciled" value={closure.financially_reconciled ? 'Yes' : 'No'} />
      </div>
      {status?.can_manage && <FormActions>
        {closure.state === 'open' && <Button disabled={mutationBlocked} onClick={() => requestOperationalConfirmation({ contextKey, kind: 'closure', project, state: 'collection_closed' })}>Close collection</Button>}
        {closure.state === 'collection_closed' && <Button disabled={mutationBlocked || closure.active_assignments > 0} onClick={() => requestOperationalConfirmation({ contextKey, kind: 'closure', project, state: 'operational_completed' })}>Mark operationally complete</Button>}
        {closure.state === 'operational_completed' && <Button disabled={mutationBlocked || !closure.financially_reconciled} onClick={() => requestOperationalConfirmation({ contextKey, kind: 'closure', project, state: 'financially_reconciled' })}>Confirm financial reconciliation</Button>}
        {closure.state === 'financially_reconciled' && <Button variant="primary" disabled={mutationBlocked} onClick={() => requestOperationalConfirmation({ contextKey, kind: 'closure', project, state: 'fully_closed' })}>Fully close project</Button>}
      </FormActions>}
    </Card>}

    {platform && status?.can_record_external && org && contextReady && <Card className={styles.sectionCard}>
      <SectionHeader eyebrow="VERIFIED FUNDING INTAKE" title="Organization funding source" description="Only FieldLance finance authority can establish or credit an external/opening funding source. NGO Admins can reserve verified available funds but cannot manufacture a balance." />
      <div className={styles.intakeGrid}>
        <form className={styles.formStack} onSubmit={createSource}>
          <SectionHeader title="Register funding source" description="Failed source creation preserves the form so entered evidence is not lost." />
          <Field label="Source type"><select className="fl-control" name="type" defaultValue="grant"><option value="opening_balance">Opening balance</option><option value="grant">Grant</option><option value="donation">Donation</option><option value="contribution">Contribution</option><option value="other">Other</option></select></Field>
          <Field label="Source name"><input className="fl-control" name="name" minLength={2} maxLength={160} required /></Field>
          <Field label="External reference"><input className="fl-control" name="reference" maxLength={200} /></Field>
          <Field label="Note"><textarea className="fl-control fl-textarea" name="note" maxLength={1000} /></Field>
          <FormActions><Button disabled={mutationBlocked}>Register source</Button></FormActions>
        </form>
        <form className={styles.formStack} onSubmit={recordFunding}>
          <SectionHeader title="Record verified funding" description="This credits the selected verified source through the existing idempotent journal operation." />
          <Field label="Funding source"><select className="fl-control" value={source} onChange={event => setSource(event.target.value)} required><option value="">Choose source</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name} · {human(item.source_type)}</option>)}</select></Field>
          <Field label="Verified amount"><input className="fl-control" name="amount" type="number" min="0.0001" step="0.0001" required /></Field>
          <Field label="Receipt / verification memo"><textarea className="fl-control fl-textarea" name="memo" minLength={3} maxLength={1000} required /></Field>
          <FormActions><Button variant="primary" disabled={mutationBlocked || !source}>Review verified funding</Button></FormActions>
        </form>
      </div>
    </Card>}

    {contextReady && <Card className={styles.historyCard}>
      <SectionHeader eyebrow="FUNDING HISTORY" title="Latest funding & payable movements" description="Latest 50 movements for this project and currency. This view is not a complete ledger export." actions={<span className={styles.historyCount}>{history.length} entries</span>} />
      <div className={styles.desktopTable}>
        <DataTable caption="Latest 50 project funding and payable movements">
          <thead><tr><th>Date</th><th>Movement</th><th>Amount</th><th>Memo</th></tr></thead>
          <tbody>{history.map(row => <tr key={row.id}><td>{new Date(row.posted_at).toLocaleString()}</td><td>{human(row.journal_type)}</td><td>{money(row.amount, currency)}</td><td>{row.memo}</td></tr>)}</tbody>
        </DataTable>
      </div>
      <div className={styles.mobileCards}>{history.map(row => <MobileRecordCard key={row.id} title={human(row.journal_type)} meta={new Date(row.posted_at).toLocaleString()} rows={[{ label: 'Amount', value: money(row.amount, currency) }, { label: 'Memo', value: row.memo }]} />)}</div>
      {!history.length && !loading && <p className={styles.emptyState}>No project funding movements for this currency yet.</p>}
    </Card>}

    <ConfirmDialog
      open={Boolean(fundingConfirmation)}
      title={fundingConfirmation?.title || 'Confirm funding operation'}
      description={fundingConfirmation?.description}
      confirmLabel={fundingConfirmation?.confirmLabel}
      danger={fundingConfirmation?.danger}
      busy={acting}
      onCancel={() => setFundingConfirmation(null)}
      onConfirm={confirmFunding}
    />
    <ConfirmDialog
      open={Boolean(operationalConfirmation)}
      title={operationalDialog?.title || 'Confirm project finance action'}
      description={operationalDialog?.description}
      confirmLabel={operationalDialog?.confirmLabel}
      danger={operationalDialog?.danger}
      busy={acting}
      onCancel={() => setOperationalConfirmation(null)}
      onConfirm={confirmOperationalAction}
    />
  </section>;
}
