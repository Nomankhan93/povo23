import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  BellRing,
  CheckCheck,
  Clock3,
  Megaphone,
  MessageSquareText,
  Settings2,
} from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";

type Row = Database["public"]["Tables"]["notifications"]["Row"];
type Preference = Database["public"]["Tables"]["notification_preferences"]["Row"];
type Broadcast = Database["public"]["Tables"]["notification_broadcasts"]["Row"];
type CenterMode = "personal" | "organization" | "project" | "staff";
type Filter = "all" | "unread" | "task" | "recruitment" | "finance" | "broadcast" | "archived";
type CenterPayload = { items: Row[]; total: number; unread: number; offset: number; limit: number };

// This center does not send external email, push, SMS or WhatsApp messages; provider delivery remains deferred.

const defaultPreferences: Omit<Preference, "user_id" | "updated_at"> = {
  email_enabled: false,
  push_enabled: false,
  broadcasts_enabled: true,
  recruitment_enabled: true,
  assignments_enabled: true,
  tasks_enabled: true,
  surveys_enabled: true,
  finance_enabled: true,
  organization_enabled: true,
  cases_enabled: true,
};

const filters: Array<[Filter, string]> = [
  ["all", "All"],
  ["unread", "Unread"],
  ["task", "Tasks"],
  ["recruitment", "Recruitment"],
  ["finance", "Finance"],
  ["broadcast", "Broadcasts"],
  ["archived", "Archived"],
];

function human(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function broadcastOptions(mode: CenterMode) {
  if (mode === "staff") return [
    ["field_workers", "All active Field Workers"],
    ["organization_admins", "Organization admins"],
    ["fieldlance_staff", "FieldLance Staff"],
    ["all_active", "All active accounts"],
  ] as const;
  if (mode === "organization") return [["organization_members", "Organization members"]] as const;
  if (mode === "project") return [["project_team", "Project team"]] as const;
  return [] as const;
}

function actionPages(mode: CenterMode) {
  if (mode === "staff") return ["", "Task Center", "NGO applications", "Verification", "Workforce marketplace", "Survey projects", "Beneficiary cases", "Withdrawal operations", "Notifications"];
  if (mode === "organization") return ["", "Task Center", "Workforce marketplace", "Survey projects", "Beneficiary cases", "Assistance ledger", "Workforce payables", "Notifications"];
  if (mode === "project") return ["", "Project workspace", "Task Center", "Recruitment", "Survey projects", "Beneficiary cases", "Notifications"];
  return [""];
}

export function Notifications({
  rows,
  refresh,
  onNavigate,
  mode,
  organizationId,
  projectId,
  canBroadcast,
}: {
  rows: Row[];
  refresh: () => Promise<void>;
  onNavigate: (page: string) => void;
  mode: CenterMode;
  organizationId?: string | null;
  projectId?: string | null;
  canBroadcast: boolean;
}) {
  const [items, setItems] = useState<Row[]>(rows),
    [filter, setFilter] = useState<Filter>("all"),
    [offset, setOffset] = useState(0),
    [unread, setUnread] = useState(rows.filter((row) => !row.read_at && !row.archived_at).length),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preferences, setPreferences] = useState(defaultPreferences),
    [preferencesOpen, setPreferencesOpen] = useState(false),
    [broadcastOpen, setBroadcastOpen] = useState(false),
    [broadcasts, setBroadcasts] = useState<Broadcast[]>([]),
    [broadcastTitle, setBroadcastTitle] = useState(""),
    [broadcastBody, setBroadcastBody] = useState(""),
    [broadcastAudience, setBroadcastAudience] = useState(""),
    [broadcastPriority, setBroadcastPriority] = useState("normal"),
    [broadcastAction, setBroadcastAction] = useState("");

  const urgent = useMemo(() => items.filter((row) => row.priority === "urgent" && !row.archived_at).length, [items]);
  const recent = useMemo(() => items.filter((row) => Date.now() - new Date(row.created_at).getTime() <= 7 * 86400000).length, [items]);
  const hasMore = items.length >= 50 && items.length % 50 === 0;

  async function load(nextFilter = filter, nextOffset = 0, append = false) {
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = await rpc("notification_center", { p_filter: nextFilter, p_offset: nextOffset, p_limit: 50 }) as unknown as CenterPayload;
      setItems((current) => append ? [...current, ...payload.items] : payload.items);
      setUnread(payload.unread);
      setOffset(nextOffset);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function loadPreferences() {
    if (!db) return;
    const response = await db.from("notification_preferences").select("*").maybeSingle();
    if (response.error) { setError(response.error.message); return; }
    if (response.data) {
      const { user_id: _user, updated_at: _updated, ...saved } = response.data;
      setPreferences(saved);
    }
  }

  async function loadBroadcasts() {
    if (!db || !canBroadcast) return;
    const response = await db.from("notification_broadcasts").select("*").order("created_at", { ascending: false }).limit(8);
    if (response.error) { setError(response.error.message); return; }
    setBroadcasts(response.data || []);
  }

  useEffect(() => { void load(filter, 0, false); }, [filter]);
  useEffect(() => {
    const options = broadcastOptions(mode);
    setBroadcastAudience(options.length ? options[0][0] : "");
    void loadPreferences(); void loadBroadcasts();
  }, [canBroadcast, mode, organizationId, projectId]);

  async function markRead(row: Row) {
    setBusy(true); setError("");
    try {
      await rpc("mark_notification_read", { p_id: row.id });
      await Promise.all([load(filter, 0, false), refresh()]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function markAllRead() {
    setBusy(true); setError("");
    try {
      const count = await rpc("mark_all_notifications_read", {});
      setNotice(`${count} notification${count === 1 ? "" : "s"} marked read.`);
      await Promise.all([load(filter, 0, false), refresh()]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function archive(row: Row, archived: boolean) {
    setBusy(true); setError("");
    try {
      await rpc("archive_notification", { p_id: row.id, p_archived: archived });
      setNotice(archived ? "Notification archived." : "Notification restored.");
      await Promise.all([load(filter, 0, false), refresh()]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function savePreferences() {
    setBusy(true); setError("");
    try {
      await rpc("save_notification_preferences", {
        p_email: preferences.email_enabled,
        p_push: preferences.push_enabled,
        p_broadcasts: preferences.broadcasts_enabled,
        p_recruitment: preferences.recruitment_enabled,
        p_assignments: preferences.assignments_enabled,
        p_tasks: preferences.tasks_enabled,
        p_surveys: preferences.surveys_enabled,
        p_finance: preferences.finance_enabled,
        p_organization: preferences.organization_enabled,
        p_cases: preferences.cases_enabled,
      });
      setNotice("Notification preferences saved.");
      setPreferencesOpen(false);
      await loadPreferences();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function publishBroadcast() {
    if (!broadcastTitle.trim() || !broadcastBody.trim() || !broadcastAudience) return;
    setBusy(true); setError("");
    try {
      await rpc("publish_notification_broadcast", {
        p_title: broadcastTitle.trim(), p_body: broadcastBody.trim(), p_audience: broadcastAudience,
        p_organization: mode === "organization" ? organizationId || null : null,
        p_project: mode === "project" ? projectId || null : null,
        p_priority: broadcastPriority,
        p_action_page: broadcastAction || null,
        p_action_label: broadcastAction ? "Open" : null,
      });
      setBroadcastTitle(""); setBroadcastBody(""); setBroadcastAction(""); setBroadcastPriority("normal"); setBroadcastOpen(false);
      setNotice("Broadcast published to authorized recipients.");
      await loadBroadcasts();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function openAction(row: Row) {
    if (!row.action_page) return;
    if (!row.read_at) void markRead(row);
    onNavigate(row.action_page);
  }

  return (
    <section className="notification-center">
      <div className="notification-center-hero">
        <div>
          <span className="eyebrow">COMMUNICATION CENTER</span>
          <h2>Updates that lead to action</h2>
          <p>Track operational updates, open the linked workflow, manage delivery preferences and publish authorized broadcasts.</p>
        </div>
        <div className="notification-center-actions">
          <button className="secondary" disabled={busy || unread === 0} onClick={() => void markAllRead()}><CheckCheck size={16}/>Mark all read</button>
          <button className="secondary" onClick={() => setPreferencesOpen((value) => !value)}><Settings2 size={16}/>Preferences</button>
          {canBroadcast && <button className="primary" onClick={() => setBroadcastOpen((value) => !value)}><Megaphone size={16}/>Broadcast</button>}
        </div>
      </div>

      <div className="notification-center-metrics">
        <div><BellRing size={18}/><span>Unread</span><strong>{unread}</strong></div>
        <div><Clock3 size={18}/><span>Last 7 days</span><strong>{recent}</strong></div>
        <div><MessageSquareText size={18}/><span>Urgent visible</span><strong>{urgent}</strong></div>
      </div>

      {error && <p role="alert" className="notice error">{error}</p>}
      {notice && <p role="status" className="notice success">{notice}</p>}

      {preferencesOpen && <div className="notification-preferences panel">
        <div className="panel-title"><div><span className="eyebrow">IN-APP PREFERENCES</span><h3>Announcement preferences</h3></div></div>
        <p className="fine">Choose whether to receive optional in-app announcements. In-app transactional updates stay available.</p>
        <div className="notification-preference-grid">
          {([['broadcasts_enabled','Broadcast announcements']] as Array<[keyof typeof preferences,string]>).map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(preferences[key])} onChange={(e)=>setPreferences({...preferences,[key]:e.target.checked})}/><span><strong>{label}</strong><small>Receive optional in-app announcements.</small></span></label>)}
        </div>
        <div className="actions"><button className="primary" disabled={busy} onClick={() => void savePreferences()}>Save preferences</button><button className="secondary" onClick={()=>setPreferencesOpen(false)}>Cancel</button></div>
      </div>}

      {broadcastOpen && canBroadcast && <div className="notification-broadcast panel">
        <div className="panel-title"><div><span className="eyebrow">AUTHORIZED BROADCAST</span><h3>Publish an operational announcement</h3></div></div>
        <div className="form-grid">
          <label className="field">Audience<select value={broadcastAudience} onChange={(e)=>setBroadcastAudience(e.target.value)}>{broadcastOptions(mode).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          <label className="field">Priority<select value={broadcastPriority} onChange={(e)=>setBroadcastPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          <label className="field">Action link<select value={broadcastAction} onChange={(e)=>setBroadcastAction(e.target.value)}>{actionPages(mode).map((page)=><option key={page || 'none'} value={page}>{page || 'No action link'}</option>)}</select></label>
          <label className="field span-2">Title<input value={broadcastTitle} maxLength={160} onChange={(e)=>setBroadcastTitle(e.target.value)} placeholder="Short operational announcement"/></label>
          <label className="field span-2">Message<textarea value={broadcastBody} maxLength={4000} onChange={(e)=>setBroadcastBody(e.target.value)} placeholder="What does this audience need to know or do?"/></label>
        </div>
        <div className="actions"><button className="primary" disabled={busy || !broadcastTitle.trim() || !broadcastBody.trim()} onClick={() => void publishBroadcast()}>Publish broadcast</button><button className="secondary" onClick={()=>setBroadcastOpen(false)}>Cancel</button></div>
        {!!broadcasts.length && <div className="notification-broadcast-history"><strong>Recent broadcasts</strong>{broadcasts.map((item)=><div key={item.id}><span>{item.title}</span><small>{human(item.audience_type)} · {item.recipient_count} recipients · {new Date(item.created_at).toLocaleString()}</small></div>)}</div>}
      </div>}

      <div className="notification-center-tabs" role="tablist" aria-label="Notification filters">
        {filters.map(([value,label])=><button type="button" role="tab" aria-selected={filter===value} className={filter===value ? 'active' : ''} key={value} onClick={()=>setFilter(value)}>{label}{value==='unread' && unread>0 ? <span>{unread}</span> : null}</button>)}
      </div>

      <div className="notification-list" aria-busy={busy}>
        {items.map((row)=><article className={`notification-card ${!row.read_at ? 'unread' : ''} priority-${row.priority}`} key={row.id}>
          <div className="notification-card-top"><div className="notification-tags"><span className="notification-category">{human(row.category)}</span>{row.priority!=='normal'&&<span className={`notification-priority ${row.priority}`}>{human(row.priority)}</span>}{!row.read_at&&<span className="notification-unread-dot">Unread</span>}</div><small>{new Date(row.created_at).toLocaleString()}</small></div>
          <h3>{row.title}</h3><p>{row.body}</p>
          <div className="notification-card-actions">
            {row.action_page && <button className="primary" onClick={()=>openAction(row)}>{row.action_label || 'Open'}<ArrowRight size={14}/></button>}
            {!row.read_at && <button className="secondary" disabled={busy} onClick={()=>void markRead(row)}>Mark read</button>}
            <button className="secondary" disabled={busy} onClick={()=>void archive(row,!row.archived_at)}><Archive size={14}/>{row.archived_at ? 'Restore' : 'Archive'}</button>
          </div>
        </article>)}
        {!items.length && <div className="notification-empty"><BellRing size={28}/><strong>No updates in this view</strong><p>New operational notifications will appear here when an authorized workflow needs your attention.</p></div>}
      </div>

      {hasMore && <div className="notification-load-more"><button className="secondary" disabled={busy} onClick={()=>void load(filter,offset+50,true)}>Load more</button></div>}
    </section>
  );
}
