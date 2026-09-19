import { SharingRecoveryPanel } from "./SharingRecoveryPanel";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database, Json } from "../../lib/supabase/database.types";
import { Badge, human } from "../../shared/ui/FormFields";

type Tables = Database["public"]["Tables"];
type Request = Tables["data_access_requests"]["Row"];
type Grant = Tables["data_access_grants"]["Row"];
type Person = Tables["registry_persons"]["Row"];
type Org = Tables["organizations"]["Row"];
type Source = {
  organization_id: string;
  organization_name: string;
  active_request: string | null;
};
type RequestContext = {
  request_id: string;
  requesting_organization_id: string;
  source_organization_id: string;
  requesting_record: null | { id: string; registry_no: number; full_name: string; birth_date: string | null; project_id: string; project_title: string };
  source_records: { id: string; registry_no: number; full_name: string; birth_date: string | null; project_id: string; project_title: string }[];
};
type Summary = {
  grant_id: string;
  source_organization_id: string;
  expires_at: string;
  fields: string[];
  identity: Record<string, Json | undefined>;
  assistance: Record<string, Json | undefined>[];
  needs: Record<string, Json | undefined>[];
};

const fieldOptions = [
  ["basic_identity_summary", "Basic identity summary"],
  ["assistance_categories", "Assistance categories"],
  ["assistance_dates", "Assistance dates"],
  ["program_names", "Program names"],
  ["next_eligibility_date", "Next eligibility date"],
  ["needs_summary", "Needs summary"],
] as const;
const defaultFields = ["assistance_categories", "assistance_dates", "needs_summary"];
const label = (key: string) => fieldOptions.find(([value]) => value === key)?.[1] || human(key);
const text = (f: FormData, key: string) => String(f.get(key) || "").trim();
const isoEnd = (date: string) => new Date(`${date}T23:59:59.000Z`).toISOString();
const inThirtyDays = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
};
const ben = (n: number) => `FL-BEN-${String(n).padStart(8, "0")}`;

export function DataSharingWorkspace({
  organization,
  manage,
  orgs,
}: {
  organization: string | null;
  manage: boolean;
  orgs: Org[];
}) {
  const [requests, setRequests] = useState<Request[]>([]),
    [grants, setGrants] = useState<Grant[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [sources, setSources] = useState<Source[]>([]),
    [personId, setPersonId] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [summary, setSummary] = useState<Summary | null>(null),
    [contexts, setContexts] = useState<Record<string, RequestContext>>({});

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || id;
  const inbound = useMemo(
    () => requests.filter((r) => organization && r.source_organization_id === organization),
    [requests, organization],
  );
  const outbound = useMemo(
    () => requests.filter((r) => organization && r.requesting_organization_id === organization),
    [requests, organization],
  );
  const poemQueue = useMemo(
    () => requests.filter((r) => r.status === "pending_poem_approval"),
    [requests],
  );

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [requestRows, grantRows] = await Promise.all([
        db!.from("data_access_requests").select("*").order("created_at", { ascending: false }).limit(500),
        db!.from("data_access_grants").select("*").order("granted_at", { ascending: false }).limit(500),
      ]);
      if (requestRows.error) throw requestRows.error;
      if (grantRows.error) throw grantRows.error;
      setRequests(requestRows.data || []);
      setGrants(grantRows.data || []);
      if (organization) {
        const projects = await db!.from("survey_projects").select("id").eq("organization_id", organization).limit(500);
        if (projects.error) throw projects.error;
        const ids = (projects.data || []).map((p) => p.id);
        if (!ids.length) setPeople([]);
        else {
          const personRows = await db!.from("registry_persons").select("*").in("project_id", ids).order("registry_no").limit(1000);
          if (personRows.error) throw personRows.error;
          setPeople(personRows.data || []);
        }
      } else setPeople([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [organization, revision]);

  useEffect(() => {
    let live = true;
    setSources([]);
    if (!organization || !personId) return;
    rpc("data_sharing_sources", { p_person: personId })
      .then((rows) => {
        if (live) setSources(rows as unknown as Source[]);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [organization, personId, revision]);

  async function act(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setSummary(null);
      setContexts({});
      setMessage(success);
      setRevision((n) => n + 1);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form),
      fields = fieldOptions.map(([value]) => value).filter((value) => f.get(value) === "on");
    const source = text(f, "source"), expiry = text(f, "expiry");
    if (!personId || !source || !expiry) return setError("Beneficiary, source NGO and expiry are required.");
    if (await act(() => rpc("create_data_access_request", {
      p_person: personId,
      p_source_org: source,
      p_purpose: text(f, "purpose"),
      p_fields: fields,
      p_expires_at: isoEnd(expiry),
    }), "Data access request sent to the source NGO.")) {
      form.reset();
      setPersonId("");
      setSources([]);
    }
  }

  async function reviewSource(e: FormEvent<HTMLFormElement>, request: Request) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value === "reject" ? "reject" : "approve";
    const f = new FormData(e.currentTarget), fields = request.requested_fields.filter((value) => f.get(value) === "on");
    await act(() => rpc("review_data_access_request", {
      p_request: request.id,
      p_decision: decision,
      p_fields: decision === "approve" ? fields : [],
      p_note: text(f, "note"),
      p_version: request.version,
    }), decision === "approve" ? "Request approved by the source NGO and sent to FieldLance." : "Request rejected by the source NGO.");
  }

  async function reviewPoem(e: FormEvent<HTMLFormElement>, request: Request) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value === "reject" ? "reject" : "approve";
    const f = new FormData(e.currentTarget), allowed = request.source_approved_fields || [], fields = allowed.filter((value) => f.get(value) === "on"), expiry = text(f, "expiry");
    await act(() => rpc("authorize_data_access_request", {
      p_request: request.id,
      p_decision: decision,
      p_fields: decision === "approve" ? fields : [],
      p_expires_at: decision === "approve" ? isoEnd(expiry) : null,
      p_note: text(f, "note"),
      p_version: request.version,
    }), decision === "approve" ? "FieldLance authorized the time-limited sharing grant." : "FieldLance rejected the sharing request.");
  }


  async function loadContext(requestId: string) {
    setBusy(true);setError("");
    try {
      const value = await rpc("data_access_request_context", { p_request: requestId });
      setContexts((old) => ({ ...old, [requestId]: value as unknown as RequestContext }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function showSummary(grant: Grant) {
    setBusy(true);setError("");setMessage("");
    try {
      const value = await rpc("get_shared_beneficiary_summary", { p_grant: grant.id });
      setSummary(value as unknown as Summary);
      setMessage("Shared summary loaded. This access was logged.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function revoke(e: FormEvent<HTMLFormElement>, grant: Grant) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(() => rpc("revoke_data_access_grant", { p_grant: grant.id, p_reason: text(f, "reason"), p_version: grant.version }), "Sharing grant revoked immediately.");
  }

  return <>
    {manage && <SharingRecoveryPanel />}
    {error && <div className="notice error" role="alert">{error}<button onClick={load}>Reload</button></div>}
    {message && <div className="notice success" role="status">{message}<button onClick={() => setMessage("")}>×</button></div>}

    {organization && <section className="panel detail">
      <h2>Request beneficiary coordination access</h2>
      <p>Choose one of your NGO's beneficiary records. FieldLance only reveals partner organizations linked to the same canonical identity. Raw surveys, documents, evidence and internal notes are never shared by this workflow.</p>
      <form onSubmit={create}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label className="field">Your beneficiary record
              <select value={personId} onChange={(e) => setPersonId(e.target.value)} required>
                <option value="">Select beneficiary</option>
                {people.map((p) => <option key={p.id} value={p.id}>{ben(p.registry_no)} · {p.full_name}</option>)}
              </select>
            </label>
            <label className="field">Source NGO
              <select name="source" required disabled={!personId}>
                <option value="">Select source NGO</option>
                {sources.map((s) => <option key={s.organization_id} value={s.organization_id} disabled={Boolean(s.active_request)}>{s.organization_name}{s.active_request ? " · request active" : ""}</option>)}
              </select>
            </label>
          </div>
          <label className="field">Purpose
            <textarea name="purpose" required minLength={10} maxLength={1000} placeholder="Example: Check recent education assistance before approving a new sponsorship." />
          </label>
          <div className="detail-fields">
            {fieldOptions.map(([value, title]) => <label key={value}><input type="checkbox" name={value} defaultChecked={defaultFields.includes(value)} /> {title}</label>)}
          </div>
          <label className="field">Requested access until
            <input name="expiry" type="date" required defaultValue={inThirtyDays()} />
          </label>
          <button className="primary">Send request</button>
        </fieldset>
      </form>
    </section>}

    {organization && <section className="panel detail">
      <h2>Requests your NGO must review</h2>
      <p>Approval only sends the request to FieldLance for final authorization. You may reduce the requested field scope.</p>
      {!inbound.length && <p>No requests for your NGO.</p>}
      {inbound.map((r) => <article className="document-row" key={r.id}>
        <div className="panel-title"><strong>{orgName(r.requesting_organization_id)}</strong><Badge value={r.status} /></div>
        <p>{r.purpose}</p><p>Requested until {new Date(r.requested_expires_at).toLocaleDateString()}</p>
        <p>Requested: {r.requested_fields.map(label).join(" · ")}</p>
        {!contexts[r.id] && <button className="secondary" disabled={busy} onClick={() => loadContext(r.id)}>Load my NGO beneficiary context</button>}
        {contexts[r.id]?.source_records.map((record) => <p key={record.id}><strong>{ben(record.registry_no)} · {record.full_name}</strong> · {record.birth_date || "Birth date unknown"} · {record.project_title}</p>)}
        {r.status === "pending_source_approval" && <form onSubmit={(e) => reviewSource(e, r)}>
          <fieldset disabled={busy}>
            <div className="detail-fields">{r.requested_fields.map((value) => <label key={value}><input type="checkbox" name={value} defaultChecked /> {label(value)}</label>)}</div>
            <label className="field">Source NGO review note<textarea name="note" required minLength={5} maxLength={1000} /></label>
            <div className="actions"><button className="primary" name="decision" value="approve">Approve selected fields</button><button className="secondary" name="decision" value="reject">Reject request</button></div>
          </fieldset>
        </form>}
        {r.source_note && <p><strong>Source note:</strong> {r.source_note}</p>}
        {r.poem_note && <p><strong>FieldLance note:</strong> {r.poem_note}</p>}
      </article>)}
    </section>}

    {manage && <section className="panel detail">
      <h2>FieldLance final authorization queue</h2>
      <p>FieldLance may only authorize a subset already approved by the source NGO, and may shorten the requested validity window.</p>
      {!poemQueue.length && <p>No requests awaiting FieldLance authorization.</p>}
      {poemQueue.map((r) => <article className="document-row" key={r.id}>
        <div className="panel-title"><strong>{orgName(r.requesting_organization_id)} → {orgName(r.source_organization_id)}</strong><Badge value={r.status} /></div>
        <p>{r.purpose}</p>
        {!contexts[r.id] && <button className="secondary" disabled={busy} onClick={() => loadContext(r.id)}>Load review context</button>}
        {contexts[r.id] && <div className="detail-fields"><div><small>Requesting record</small><p>{contexts[r.id].requesting_record ? `${ben(contexts[r.id].requesting_record!.registry_no)} · ${contexts[r.id].requesting_record!.full_name}` : "—"}</p></div><div><small>Source NGO records</small>{contexts[r.id].source_records.map((record) => <p key={record.id}>{ben(record.registry_no)} · {record.full_name} · {record.project_title}</p>)}</div></div>}
        <form onSubmit={(e) => reviewPoem(e, r)}>
          <fieldset disabled={busy}>
            <div className="detail-fields">{(r.source_approved_fields || []).map((value) => <label key={value}><input type="checkbox" name={value} defaultChecked /> {label(value)}</label>)}</div>
            <label className="field">Grant expiry<input name="expiry" type="date" required defaultValue={new Date(r.requested_expires_at).toISOString().slice(0,10)} /></label>
            <label className="field">FieldLance authorization note<textarea name="note" required minLength={5} maxLength={1000} /></label>
            <div className="actions"><button className="primary" name="decision" value="approve">Authorize selected fields</button><button className="secondary" name="decision" value="reject">Reject request</button></div>
          </fieldset>
        </form>
      </article>)}
    </section>}

    {organization && <section className="panel detail">
      <h2>Your outgoing requests and grants</h2>
      {!outbound.length && <p>No outgoing data access requests.</p>}
      {outbound.map((r) => {
        const grant=grants.find((g) => g.request_id===r.id);
        return <article className="document-row" key={r.id}>
          <div className="panel-title"><strong>{orgName(r.source_organization_id)}</strong><Badge value={r.status} /></div>
          <p>{r.purpose}</p><p>Requested: {r.requested_fields.map(label).join(" · ")}</p>
          {grant && <><p>Grant: {grant.status} · expires {new Date(grant.expires_at).toLocaleString()}</p>{grant.grantee_organization_id===organization && grant.status==="active" && new Date(grant.expires_at)>new Date() && <button className="secondary" disabled={busy} onClick={() => showSummary(grant)}>View approved summary</button>}</>}
        </article>;
      })}
    </section>}

    {(manage || organization) && <section className="panel detail">
      <h2>Active and historical grants</h2>
      {!grants.length && <p>No grants visible in this workspace.</p>}
      {grants.map((g) => <article className="document-row" key={g.id}>
        <div className="panel-title"><strong>{orgName(g.grantee_organization_id)} ← {orgName(g.source_organization_id)}</strong><Badge value={g.status === "active" && new Date(g.expires_at).getTime() <= Date.now() ? "expired" : g.status} /></div>
        <p>{g.revoke_reason}</p><p>{g.fields.map(label).join(" · ")}</p><p>Expires {new Date(g.expires_at).toLocaleString()}</p>
        {(manage || g.source_organization_id===organization) && g.status==="active" && <details><summary>Revoke access</summary><form onSubmit={(e)=>revoke(e,g)}><label className="field">Reason<textarea name="reason" required minLength={5} maxLength={1000}/></label><button className="secondary" disabled={busy}>Revoke immediately</button></form></details>}
      </article>)}
    </section>}

    {summary && <section className="panel detail" aria-label="Shared beneficiary summary">
      <h2>Approved beneficiary coordination summary</h2>
      <p>Source: {orgName(summary.source_organization_id)} · access expires {new Date(summary.expires_at).toLocaleString()}</p>
      {Object.keys(summary.identity || {}).length>0 && <><h3>Identity</h3><pre className="survey-json">{JSON.stringify(summary.identity,null,2)}</pre></>}
      <h3>Assistance</h3>{!summary.assistance.length?<p>No recorded assistance in the approved scope.</p>:summary.assistance.map((a,i)=><pre className="survey-json" key={i}>{JSON.stringify(a,null,2)}</pre>)}
      <h3>Needs</h3>{!summary.needs.length?<p>No needs in the approved scope.</p>:summary.needs.map((n,i)=><pre className="survey-json" key={i}>{JSON.stringify(n,null,2)}</pre>)}
    </section>}
  </>;
}
