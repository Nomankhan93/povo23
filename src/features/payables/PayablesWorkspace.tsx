import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { db, rpc } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';
import { EmptyState } from '../../components/ui/WorkflowOverview';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  FilterBar,
  FormActions,
  MetricCard,
  MobileRecordCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from '../../components/ui/FieldLanceUI';
import styles from './PayablesWorkspace.module.css';

type Tables = Database['public']['Tables'];
type Assignment = Tables['work_assignments']['Row'];
type Unit = Tables['work_payable_units']['Row'] & {
  approved_amount: string;
  paid_amount: string;
  balance: string;
  settlement_status: string;
};
type Entry = Tables['work_payable_events']['Row'];
type Statement = {
  rows: Unit[];
  count: number;
  can_manage: boolean;
  totals: { currency: string; estimated: string; approved: string; paid: string; balance: string };
};
type Command = Database['public']['Functions']['act_work_payable']['Args'];
type Confirmation = {
  contextKey: string;
  command: Command;
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);
const label = (value: string) => value.replaceAll('_', ' ');
const titleCase = (value: string) => label(value).replace(/\b\w/g, letter => letter.toUpperCase());

function formatDecimal(value: unknown, maxDecimals: number): string {
  if (value === null || value === undefined) return 'Unavailable';
  const raw = String(value).trim();
  const expression = new RegExp(`^-?\\d+(?:\\.\\d{1,${maxDecimals}})?$`);
  if (!expression.test(raw)) return 'Unavailable';
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

function money(value: unknown, currency: string): string {
  const formatted = formatDecimal(value, 2);
  return formatted === 'Unavailable' ? formatted : `${currency} ${formatted}`;
}

function statusTone(status: string) {
  if (status === 'settled') return 'success' as const;
  if (status === 'overpaid' || status === 'disputed') return 'warning' as const;
  if (status === 'rejected' || status === 'voided') return 'danger' as const;
  if (status === 'approved' || status === 'partially_paid') return 'info' as const;
  return 'neutral' as const;
}

function actionCopy(action: string, unit: Unit, selected: Assignment, amount: string) {
  const worker = selected.volunteer_name;
  const project = selected.project_title;
  const amountCopy = amount ? ` Amount: ${money(amount, unit.currency)}.` : '';
  const base = `${worker} · ${project} · ${titleCase(unit.source_kind)} on ${unit.work_date}.${amountCopy}`;
  switch (action) {
    case 'approve': return { title: 'Approve payable entitlement?', description: base, confirmLabel: 'Approve entitlement', danger: false };
    case 'dispute': return { title: 'Dispute this payable unit?', description: base, confirmLabel: 'Record dispute', danger: false };
    case 'resolve': return { title: 'Resolve this payable dispute?', description: base, confirmLabel: 'Resolve dispute', danger: false };
    case 'reject': return { title: 'Reject this payable unit?', description: base, confirmLabel: 'Reject payable', danger: true };
    case 'adjust': return { title: 'Adjust payable entitlement?', description: `${base} Signed adjustments are preserved; the server enforces the valid entitlement range.`, confirmLabel: 'Record adjustment', danger: false };
    case 'pay': return { title: 'Record this payment?', description: `${base} This records accounting evidence only; it does not transfer money.`, confirmLabel: 'Record payment', danger: false };
    case 'reverse_payment': return { title: 'Reverse this payment entry?', description: `${base} This corrects the accounting journal; it does not issue a bank refund.`, confirmLabel: 'Reverse payment entry', danger: true };
    default: return { title: 'Confirm accounting action?', description: base, confirmLabel: 'Confirm action', danger: false };
  }
}

export function PayablesWorkspace({ userId, organization, embedded = false }: { userId: string; organization: string | null; embedded?: boolean }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignment, setAssignment] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [events, setEvents] = useState<Entry[]>([]);
  const [listPage, setListPage] = useState(0);
  const [page, setPage] = useState(0);
  const [eventPage, setEventPage] = useState(0);
  const [search, setSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Command | null>(null);
  const [action, setAction] = useState('approve');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [amendments, setAmendments] = useState<Tables['work_contract_amendments']['Row'][]>([]);
  const [receipt, setReceipt] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const sending = useRef(false);

  const selected = assignments.find(item => item.id === assignment) || null;
  const currentContextKey = `${assignment}|${unit?.id || ''}|${unit?.version ?? ''}`;
  const disabled = busy || loading || Boolean(pending);

  useEffect(() => {
    let live = true;
    setAmendments([]);
    if (!assignment) return;
    void db!.from('work_contract_amendments').select('*').eq('assignment_id', assignment).order('effective_on', { ascending: false }).limit(100).then(({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      else setAmendments(data || []);
    });
    return () => { live = false; };
  }, [assignment, revision]);

  useEffect(() => {
    setReceipt('');
    setReceiptUrl('');
    setConfirmation(null);
  }, [assignment, unit?.id, unit?.version]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    let query = db!.from('work_assignments').select('*').eq('work_mode', 'paid').order('created_at', { ascending: false }).order('id').range(listPage * 50, listPage * 50 + 49);
    query = organization ? query.eq('organization_id', organization) : query.eq('user_id', userId);
    if (search.trim()) query = query.ilike('volunteer_name', `%${search.trim()}%`);
    if (projectSearch.trim()) query = query.ilike('project_title', `%${projectSearch.trim()}%`);
    void query.then(({ data, error }) => {
      if (!live) return;
      setLoading(false);
      if (error) setError(error.message);
      else setAssignments(data || []);
    });
    return () => { live = false; };
  }, [organization, userId, listPage, search, projectSearch, revision]);

  useEffect(() => {
    let live = true;
    if (!assignment) {
      setStatement(null);
      return;
    }
    setLoading(true);
    setStatement(null);
    void rpc('work_payable_statement', { p_assignment: assignment, p_page: page })
      .then(data => {
        if (!live) return;
        const next = data as unknown as Statement;
        setStatement(next);
        setUnit(old => old ? next.rows.find(row => row.id === old.id) || null : null);
      })
      .catch(cause => { if (live) setError((cause as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [assignment, page, revision]);

  useEffect(() => {
    let live = true;
    setEvents([]);
    if (!unit) return;
    void db!.from('work_payable_events').select('*').eq('unit_id', unit.id).order('created_at', { ascending: false }).order('id').range(eventPage * 50, eventPage * 50 + 49).then(({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      else setEvents(data || []);
    });
    return () => { live = false; };
  }, [unit?.id, eventPage, revision]);

  function refresh() {
    setRevision(value => value + 1);
  }

  function chooseAssignment(id: string) {
    setAssignment(id);
    setPage(0);
    setUnit(null);
    setEventPage(0);
    setNotice('');
  }

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await fn();
      setNotice(message);
      refresh();
      return result;
    } catch (cause) {
      setError((cause as Error).message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  async function execute(command: Command) {
    if (sending.current) return;
    sending.current = true;
    setPending(command);
    try {
      await run(() => rpc('act_work_payable', command), 'Accounting event recorded.');
      setPending(null);
      setReceipt('');
    } catch {
      // Keep the exact request for a safe retry.
    } finally {
      sending.current = false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unit || !selected) return;
    const form = new FormData(event.currentTarget);
    const amount = String(form.get('amount') || '').trim();
    if (amount && !/^-?\d{1,12}(\.\d{1,2})?$/.test(amount)) {
      setError('Use an amount with at most two decimal places.');
      return;
    }
    const command: Command = {
      p_unit: unit.id,
      p_action: action,
      p_amount: amount ? Number(amount) : null,
      p_note: String(form.get('note')),
      p_reference: action === 'pay' ? String(form.get('reference')) : null,
      p_date: action === 'pay' ? String(form.get('date')) : null,
      p_reverses: action === 'reverse_payment' ? String(form.get('reverses')) : null,
      p_version: unit.version,
      p_request: crypto.randomUUID(),
      p_receipt: action === 'pay' && receipt ? receipt : null,
    };
    const copy = actionCopy(action, unit, selected, amount);
    setConfirmation({ contextKey: currentContextKey, command, ...copy });
  }

  async function confirmAccounting() {
    const snapshot = confirmation;
    if (!snapshot) return;
    if (snapshot.contextKey !== currentContextKey) {
      setConfirmation(null);
      setError('The payable context changed. Review the current unit before submitting this action.');
      return;
    }
    setConfirmation(null);
    await execute(snapshot.command);
  }

  async function uploadReceipt(file: File) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setError('Choose a PDF, JPEG or PNG receipt up to 5 MiB.');
      return;
    }
    setReceipt('');
    try {
      await run(async () => {
        const id = await rpc('reserve_payable_receipt', { p_assignment: assignment, p_filename: file.name, p_mime: file.type, p_size: file.size });
        const { error } = await db!.storage.from('work-payable-receipts').upload(id, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        setReceipt(id);
      }, 'Private receipt uploaded. It will be attached only if you record the payment.');
    } catch {
      // No payment is created by uploading a receipt.
    }
  }

  async function viewReceipt(id: string) {
    try {
      await run(async () => {
        const path = await rpc('authorize_payable_receipt', { p_receipt: id });
        const { data, error } = await db!.storage.from('work-payable-receipts').createSignedUrl(path, 60, { download: true });
        if (error) throw error;
        setReceiptUrl(data.signedUrl);
      }, 'Receipt link ready for 60 seconds.');
    } catch {
      // Error is already surfaced by run().
    }
  }

  const assignmentMeta = useMemo(() => selected ? `${selected.organization_name} · ${selected.start_date} to ${selected.end_date}` : '', [selected]);

  return <section className={`${styles.workspace} ${embedded ? styles.embedded : ''}`}>
    {!embedded && <PageHeader
      eyebrow={organization ? 'ORGANIZATION FINANCE' : 'EARNINGS DETAIL'}
      title={organization ? 'Field Worker payables' : 'Claims & payables'}
      description={organization
        ? 'Review paid Field Worker contracts, approve eligible payable units and record accounting events without changing accepted work terms.'
        : 'Review paid contracts, submit eligible claims and inspect the immutable payable journal behind your earnings.'}
      actions={<Button disabled={disabled} onClick={refresh}>Refresh records</Button>}
    />}
    {embedded && <FormActions><Button disabled={disabled} onClick={refresh}>Refresh payable records</Button></FormActions>}

    <Alert title={organization ? 'Accounting record, not money transfer' : 'Entitlement ledger'} tone="info">
      {organization
        ? 'Amounts and balances are calculated by the server; currencies are never combined. Recording a payment documents settlement evidence; it does not transfer money.'
        : 'Payable approval and provider withdrawal settlement are separate. A Field Worker cannot approve or pay their own work.'}
    </Alert>
    {error && <Alert title="Payables need attention" tone="danger">{error}</Alert>}
    {notice && <Alert title="Payables updated" tone="success">{notice}</Alert>}
    {pending && <Alert
      title="Accounting outcome not yet confirmed"
      tone="warning"
      action={<div className={styles.inlineActions}>
        <Button variant="primary" disabled={busy} onClick={() => void execute(pending)}>Retry same request</Button>
        <Button disabled={busy} onClick={() => { setPending(null); refresh(); setNotice('Reloaded for review. Check the journal before creating another payment.'); }}>Review current state</Button>
      </div>}
    >The original request ID and exact details are retained. Retrying does not create a replacement request.</Alert>}

    <Card className={styles.assignmentCard}>
      <SectionHeader
        eyebrow="PAID ASSIGNMENTS"
        title="Choose a paid assignment"
        description="Assignment summary values are server-calculated across the full assignment. The list below is paged at up to 50 assignments."
      />
      <FilterBar actions={<span className={styles.pageLabel}>Page {listPage + 1} · up to 50 assignments</span>}>
        {organization && <Field label="Field Worker name"><input className="fl-control" value={search} onChange={event => { setSearch(event.target.value); setListPage(0); chooseAssignment(''); }} /></Field>}
        <Field label="Project title"><input className="fl-control" value={projectSearch} onChange={event => { setProjectSearch(event.target.value); setListPage(0); chooseAssignment(''); }} /></Field>
      </FilterBar>
      {loading && !assignments.length && <p className={styles.helper} role="status">Loading paid assignments…</p>}
      {!loading && !assignments.length && <EmptyState>No paid assignments available in this workspace. Accepted paid contracts are managed in Workforce marketplace.</EmptyState>}
      {assignments.length > 0 && <>
        <div className={styles.desktopTable}>
          <DataTable caption="Paid assignments">
            <thead><tr><th>Worker</th><th>Project</th><th>Compensation</th><th>Contract status</th><th>Action</th></tr></thead>
            <tbody>{assignments.map(row => <tr key={row.id}>
              <td><strong>{row.volunteer_name}</strong><small>{row.id.slice(0, 8)}</small></td>
              <td>{row.project_title}</td>
              <td>{money(row.rate, row.currency)} / {titleCase(row.compensation_type)}</td>
              <td><StatusBadge tone={row.status === 'active' ? 'success' : 'neutral'}>{titleCase(row.status)}</StatusBadge></td>
              <td><Button disabled={disabled} variant={row.id === assignment ? 'primary' : 'secondary'} aria-label={`Open payables for ${row.volunteer_name} on ${row.project_title}`} onClick={() => chooseAssignment(row.id)}>{row.id === assignment ? 'Selected' : 'Open payables'}</Button></td>
            </tr>)}</tbody>
          </DataTable>
        </div>
        <div className={styles.mobileCards}>
          {assignments.map(row => <MobileRecordCard
            key={row.id}
            title={row.volunteer_name}
            meta={row.project_title}
            status={<StatusBadge tone={row.status === 'active' ? 'success' : 'neutral'}>{titleCase(row.status)}</StatusBadge>}
            rows={[
              { label: 'Compensation', value: `${money(row.rate, row.currency)} / ${titleCase(row.compensation_type)}` },
              { label: 'Assignment', value: row.id.slice(0, 8) },
            ]}
            action={<Button disabled={disabled} variant={row.id === assignment ? 'primary' : 'secondary'} aria-label={`Open payables for ${row.volunteer_name} on ${row.project_title}`} onClick={() => chooseAssignment(row.id)}>{row.id === assignment ? 'Selected' : 'Open payables'}</Button>}
          />)}
        </div>
        <div className={styles.pagination} aria-label="Assignment pagination">
          <Button disabled={disabled || listPage === 0} onClick={() => { setListPage(value => value - 1); chooseAssignment(''); }}>Previous assignments</Button>
          <Button disabled={disabled || assignments.length < 50} onClick={() => { setListPage(value => value + 1); chooseAssignment(''); }}>Next assignments</Button>
        </div>
      </>}
    </Card>

    {selected && <Card className={styles.contractCard}>
      <SectionHeader eyebrow="SELECTED CONTRACT" title="Agreed contract" description={`${selected.project_title} · ${selected.volunteer_name}`} />
      <dl className={styles.factGrid}>
        <div><dt>Organization</dt><dd>{selected.organization_name}</dd></div>
        <div><dt>Compensation</dt><dd>{money(selected.rate, selected.currency)} / {titleCase(selected.compensation_type)}</dd></div>
        <div><dt>Contract period</dt><dd>{selected.start_date} to {selected.end_date}</dd></div>
        <div><dt>Accepted</dt><dd>{selected.responded_at ? new Date(selected.responded_at).toLocaleString() : 'Not yet accepted'}</dd></div>
      </dl>
      <p className={styles.helper}>{selected.terms_note || 'No additional terms recorded.'} {selected.completed_at && `Completed: ${new Date(selected.completed_at).toLocaleString()}`}</p>
      <p className={styles.helper}>Terms are preserved for each payable unit. {assignmentMeta}</p>
    </Card>}

    {statement && selected && <>
      <section className={styles.summarySection}>
        <SectionHeader eyebrow="SELECTED ASSIGNMENT SUMMARY" title="Server-calculated payable position" description="These totals cover the assignment, not only the currently visible page of payable units." />
        <div className={styles.metricGrid}>
          <MetricCard label="Pending estimate" value={money(statement.totals.estimated, statement.totals.currency)} />
          <MetricCard label="Net approved entitlement" value={money(statement.totals.approved, statement.totals.currency)} />
          <MetricCard label="Net recorded payments" value={money(statement.totals.paid, statement.totals.currency)} />
          <MetricCard label="Balance / recovery due" value={money(statement.totals.balance, statement.totals.currency)} detail="A negative balance represents overpayment/recovery, not an invalid amount." />
        </div>
      </section>

      <Card className={styles.amendmentCard}>
        <SectionHeader eyebrow="CONTRACT TERMS" title="Contract amendments" description="Future rate changes require Field Worker acceptance before the effective day. Existing payable snapshots keep their agreed rate. Latest 100 amendments are shown." />
        <div className={styles.stack}>
          {amendments.map(amendment => <article className={styles.recordRow} key={amendment.id}>
            <div><strong>{money(amendment.rate, selected.currency)} from {amendment.effective_on}</strong><p>{amendment.terms_note}</p></div>
            <div className={styles.recordActions}><StatusBadge tone={amendment.status === 'accepted' ? 'success' : amendment.status === 'declined' || amendment.status === 'cancelled' ? 'danger' : 'warning'}>{titleCase(amendment.status)}</StatusBadge>
              {amendment.status === 'offered' && <div className={styles.inlineActions}>{(selected.user_id === userId ? ['accepted', 'declined'] : statement.can_manage ? ['cancelled'] : []).map(nextStatus => <Button key={nextStatus} disabled={disabled} onClick={() => void run(() => rpc('respond_work_amendment', { p_amendment: amendment.id, p_status: nextStatus }), 'Amendment response recorded.').catch(() => {})}>{nextStatus === 'accepted' ? 'Accept terms' : nextStatus === 'declined' ? 'Decline terms' : 'Cancel offer'}</Button>)}</div>}
            </div>
          </article>)}
          {!amendments.length && <p className={styles.helper}>No contract amendments recorded.</p>}
        </div>
        {statement.can_manage && selected.status === 'active' && <form className={styles.formStack} onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(() => rpc('offer_work_amendment', { p_assignment: assignment, p_rate: Number(form.get('rate')), p_effective: String(form.get('effective')), p_note: String(form.get('terms')) }), 'Future rate offered to the Field Worker.').catch(() => {});
        }}>
          <div className={styles.formGrid}>
            <Field label={`Proposed rate (${selected.currency})`}><input className="fl-control" name="rate" inputMode="decimal" required pattern="[0-9]{1,12}(\.[0-9]{1,2})?" /></Field>
            <Field label="Future effective date"><input className="fl-control" name="effective" type="date" required min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} max={selected.end_date} /></Field>
          </div>
          <Field label="Proposed terms"><textarea className="fl-control fl-textarea" name="terms" required minLength={5} maxLength={2000} /></Field>
          <FormActions><Button disabled={disabled}>Offer amendment</Button></FormActions>
        </form>}
      </Card>

      {selected.compensation_type === 'daily_rate' && <Alert title="Attendance-backed daily rate" tone="info">Field Workers do not create manual day claims. An approved assignment attendance session creates or reuses the day payable unit automatically; financial approval remains separate.</Alert>}

      {selected.compensation_type === 'fixed_assignment' && <Card className={styles.claimCard}>
        <SectionHeader title="Claim fixed completion" description="The completion date remains bounded by the accepted contract period." />
        <form className={styles.formStack} onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(() => rpc('claim_work_payable', { p_assignment: assignment, p_day: String(form.get('day')), p_note: String(form.get('note')) }), 'Fixed completion claim recorded or existing claim recovered. NGO approval is still required.').catch(() => {});
        }}>
          <Field label="Completion date (UTC; capped at contract end)"><input className="fl-control" type="date" name="day" required key={selected.id} defaultValue={selected.completed_at ? (selected.completed_at.slice(0, 10) < selected.end_date ? selected.completed_at.slice(0, 10) : selected.end_date) : today()} min={selected.start_date} max={today() < selected.end_date ? today() : selected.end_date} /></Field>
          <Field label="Completion evidence note"><textarea className="fl-control fl-textarea" name="note" required minLength={5} maxLength={2000} /></Field>
          <FormActions><Button variant="primary" disabled={disabled}>Submit completion claim</Button></FormActions>
        </form>
      </Card>}

      {statement.can_manage && selected.compensation_type === 'per_verified_survey' && <Card className={styles.claimCard}>
        <SectionHeader title="Recover an earlier approved survey" description="New approvals create candidates automatically. Use the response ID only for an approval made before this upgrade." />
        <form className={styles.formStack} onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(async () => {
            const id = await rpc('reconcile_survey_payable', { p_response: String(form.get('response')) });
            if (!id) throw Error('No eligible accepted contract found. The survey must be independently approved and first received within the accepted contract dates.');
            return id;
          }, 'Survey payable reconciled.').catch(() => {});
        }}>
          <Field label="Survey response ID"><input className="fl-control" name="response" required pattern="[0-9a-fA-F-]{36}" disabled={disabled} /></Field>
          <FormActions><Button disabled={disabled}>Reconcile survey</Button></FormActions>
        </form>
      </Card>}

      <Card className={styles.unitsCard}>
        <SectionHeader eyebrow="PAYABLE UNITS" title="Work-level entitlement records" description={`${statement.count} units across this assignment · up to 50 units shown per page`} />
        <div className={styles.desktopTable}>
          <DataTable caption="Payable units">
            <thead><tr><th>Work</th><th>Status</th><th>Approved</th><th>Paid</th><th>Balance</th><th>Action</th></tr></thead>
            <tbody>{statement.rows.map(row => <tr key={row.id}>
              <td><strong>{titleCase(row.source_kind)}</strong><small>{row.work_date} · {row.id.slice(0, 8)}</small></td>
              <td><StatusBadge tone={statusTone(row.settlement_status)}>{titleCase(row.settlement_status)}</StatusBadge></td>
              <td>{money(row.approved_amount, row.currency)}</td>
              <td>{money(row.paid_amount, row.currency)}</td>
              <td>{money(row.balance, row.currency)}</td>
              <td><Button disabled={disabled} variant={row.id === unit?.id ? 'primary' : 'secondary'} aria-label={`Open ${titleCase(row.source_kind)} payable for ${row.work_date}`} onClick={() => { setUnit(row); setAction(statement.can_manage ? 'approve' : 'dispute'); setEventPage(0); }}>{row.id === unit?.id ? 'Selected' : 'Open unit'}</Button></td>
            </tr>)}</tbody>
          </DataTable>
        </div>
        <div className={styles.mobileCards}>
          {statement.rows.map(row => <MobileRecordCard
            key={row.id}
            title={`${titleCase(row.source_kind)} · ${row.work_date}`}
            status={<StatusBadge tone={statusTone(row.settlement_status)}>{titleCase(row.settlement_status)}</StatusBadge>}
            meta={row.id.slice(0, 8)}
            rows={[
              { label: 'Approved', value: money(row.approved_amount, row.currency) },
              { label: 'Paid', value: money(row.paid_amount, row.currency) },
              { label: 'Balance', value: money(row.balance, row.currency) },
            ]}
            action={<Button disabled={disabled} variant={row.id === unit?.id ? 'primary' : 'secondary'} aria-label={`Open ${titleCase(row.source_kind)} payable for ${row.work_date}`} onClick={() => { setUnit(row); setAction(statement.can_manage ? 'approve' : 'dispute'); setEventPage(0); }}>{row.id === unit?.id ? 'Selected' : 'Open unit'}</Button>}
          />)}
        </div>
        {!statement.rows.length && <EmptyState>No payable units on this page.</EmptyState>}
        <div className={styles.pagination} aria-label="Payable unit pagination">
          <Button disabled={disabled || page === 0} onClick={() => { setPage(value => value - 1); setUnit(null); }}>Previous units</Button>
          <span>Page {page + 1}</span>
          <Button disabled={disabled || (page + 1) * 50 >= statement.count} onClick={() => { setPage(value => value + 1); setUnit(null); }}>Next units</Button>
        </div>
      </Card>

      {unit && <Card className={styles.accountingCard}>
        <SectionHeader eyebrow="UNIT ACCOUNTING" title="Review and record an accounting action" description={`${titleCase(unit.source_kind)} · ${unit.work_date} · snapshot rate ${money(unit.rate, unit.currency)}`} />
        <dl className={styles.factGrid}>
          <div><dt>Worker</dt><dd>{selected.volunteer_name}</dd></div>
          <div><dt>Project</dt><dd>{selected.project_title}</dd></div>
          <div><dt>Settlement status</dt><dd><StatusBadge tone={statusTone(unit.settlement_status)}>{titleCase(unit.settlement_status)}</StatusBadge></dd></div>
          <div><dt>Balance</dt><dd>{money(unit.balance, unit.currency)}</dd></div>
        </dl>
        <p className={styles.helper}>{unit.note}</p>
        <details className={styles.snapshot}><summary>Contract snapshot</summary><pre>{JSON.stringify(unit.terms_snapshot, null, 2)}</pre></details>

        <form className={styles.formStack} onSubmit={submit}>
          <Field label="Action"><select className="fl-control" value={action} onChange={event => setAction(event.target.value)}>{(statement.can_manage ? ['approve', 'dispute', 'resolve', 'reject', 'adjust', 'pay', 'reverse_payment'] : ['dispute']).map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
          <p className={styles.helper}>The server checks eligibility, role, current version and balance for every action. Payable approval requires sufficient reserved project funding and bridges into finance atomically.</p>
          {(action === 'pay' || action === 'adjust') && <Field label={`Amount (${unit.currency})`} hint={action === 'adjust' ? 'Signed adjustments are allowed when the resulting entitlement remains within server-enforced bounds.' : undefined}><input className="fl-control" name="amount" inputMode="decimal" required placeholder={action === 'adjust' ? '-20.00' : '50.00'} /></Field>}
          {action === 'pay' && <>
            <Field label="Actual payment date"><input className="fl-control" name="date" type="date" required defaultValue={today()} min={unit.work_date} max={today()} /></Field>
            <Field label="Private receipt" hint="Optional PDF, JPEG or PNG up to 5 MiB"><input className="fl-control" type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadReceipt(file); }} /></Field>
            {receipt && <Alert title="Receipt uploaded" tone="success">It is private and will be attached only if the payment accounting action is confirmed.</Alert>}
            <Field label="Unique bank / cash voucher reference"><input className="fl-control" name="reference" required minLength={3} maxLength={160} /></Field>
          </>}
          {action === 'reverse_payment' && <Field label="Payment event ID"><input className="fl-control" name="reverses" required pattern="[0-9a-fA-F-]{36}" placeholder="Copy the payment event ID from the journal" /></Field>}
          <Field label="Reason / supporting evidence"><textarea className="fl-control fl-textarea" name="note" required minLength={5} maxLength={2000} /></Field>
          <FormActions><Button variant={action === 'reject' || action === 'reverse_payment' ? 'danger' : 'primary'} disabled={disabled}>Review {titleCase(action)}</Button></FormActions>
        </form>

        <div className={styles.journalSection}>
          <SectionHeader eyebrow="IMMUTABLE JOURNAL" title="Accounting history" description="Up to 50 events are shown per journal page. Payment reversal corrects an accounting entry; it does not issue a bank refund." />
          {receiptUrl && <Alert title="Receipt link ready" tone="success"><a href={receiptUrl} target="_blank" rel="noopener noreferrer">Download receipt (link expires after 60 seconds)</a></Alert>}
          <div className={styles.stack}>{events.map(entry => <article className={styles.recordRow} key={entry.id}>
            <div><strong>{titleCase(entry.kind)} · {money(entry.amount, unit.currency)}</strong><p>{entry.note}</p><small>{entry.reference && `Reference: ${entry.reference} · `}{entry.occurred_on || new Date(entry.created_at).toLocaleString()}</small><small>Event ID: {entry.id}{entry.reverses && ` · Reverses: ${entry.reverses}`}</small></div>
            {entry.receipt_id && <Button disabled={busy} aria-label={`Prepare receipt download for event ${entry.id}`} onClick={() => void viewReceipt(entry.receipt_id!)}>Prepare receipt download</Button>}
          </article>)}</div>
          {!events.length && <EmptyState>No journal entries on this page.</EmptyState>}
          <div className={styles.pagination} aria-label="Journal pagination">
            <Button disabled={eventPage === 0 || busy} onClick={() => setEventPage(value => value - 1)}>Earlier page</Button>
            <span>Journal page {eventPage + 1}</span>
            <Button disabled={events.length < 50 || busy} onClick={() => setEventPage(value => value + 1)}>More history</Button>
          </div>
        </div>
      </Card>}
    </>}

    <ConfirmDialog
      open={Boolean(confirmation)}
      title={confirmation?.title || 'Confirm accounting action'}
      description={confirmation?.description}
      confirmLabel={confirmation?.confirmLabel}
      danger={confirmation?.danger}
      busy={busy}
      onCancel={() => setConfirmation(null)}
      onConfirm={confirmAccounting}
    />
  </section>;
}
