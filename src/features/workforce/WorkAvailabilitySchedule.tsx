import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Clock3, Gauge, MapPin, Plus, Trash2 } from "lucide-react";
import { rpc } from "../../lib/supabase/client";
import { Badge, human } from "../../shared/ui/FormFields";

type Preference = {
  timezone: string;
  max_active_projects: number;
  max_days_per_week: number;
  preferred_shift: string;
  travel_willingness: string;
  configured: boolean;
};
type Rule = {
  id?: string;
  user_id?: string;
  weekday: number;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
};
type UnavailablePeriod = { id: string; starts_on: string; ends_on: string; reason: string; created_at?: string };
type AvailabilityProfile = {
  preferences: Preference;
  rules: Rule[];
  unavailable_periods: UnavailablePeriod[];
  current_commitments: number;
  capacity_pct: number;
};
type ScheduleAssignment = {
  id: string;
  survey_project_id: string;
  organization_id: string;
  project_title: string;
  organization_name: string;
  status: string;
  start_date: string;
  end_date: string;
  target_surveys: number;
  work_mode: string;
  compensation_type: string;
  currency: string;
  rate: number | null;
};
type ScheduleResult = {
  from: string;
  to: string;
  assignments: ScheduleAssignment[];
  unavailable_periods: UnavailablePeriod[];
  availability: AvailabilityProfile;
};

type View = "schedule" | "availability";

const weekdays = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
] as const;

function defaultRules(): Rule[] {
  return weekdays.map(([weekday]) => ({
    weekday,
    is_available: weekday <= 5,
    start_time: weekday <= 5 ? "09:00" : null,
    end_time: weekday <= 5 ? "17:00" : null,
  }));
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function compensationLabel(a: ScheduleAssignment) {
  if (a.work_mode !== "paid") return "Volunteer / unpaid";
  return `${a.currency} ${Number(a.rate || 0).toLocaleString()} · ${human(a.compensation_type)}`;
}

export function WorkAvailabilitySchedule({ view }: { userId: string; view: View }) {
  const [profile, setProfile] = useState<AvailabilityProfile | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [rules, setRules] = useState<Rule[]>(defaultRules());
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [maxProjects, setMaxProjects] = useState(2);
  const [maxDays, setMaxDays] = useState(5);
  const [preferredShift, setPreferredShift] = useState("flexible");
  const [travel, setTravel] = useState("local");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    Promise.all([
      rpc("worker_availability_profile", {}),
      rpc("worker_schedule", { p_days: 60 }),
    ])
      .then(([profileResult, scheduleResult]) => {
        if (!live) return;
        const nextProfile = profileResult as unknown as AvailabilityProfile;
        const nextSchedule = scheduleResult as unknown as ScheduleResult;
        setProfile(nextProfile);
        setSchedule(nextSchedule);
        const p = nextProfile.preferences;
        setTimezone(p.timezone || "Asia/Karachi");
        setMaxProjects(Number(p.max_active_projects || 2));
        setMaxDays(Number(p.max_days_per_week || 5));
        setPreferredShift(p.preferred_shift || "flexible");
        setTravel(p.travel_willingness || "local");
        const byDay = new Map((nextProfile.rules || []).map((rule): [number, Rule] => [Number(rule.weekday), rule]));
        setRules(defaultRules().map((fallback) => byDay.get(fallback.weekday) || fallback));
      })
      .catch((e) => { if (live) setError((e as Error).message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [revision]);

  const activeRules = useMemo(() => rules.filter((rule) => rule.is_available), [rules]);

  async function saveAvailability(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("save_worker_availability", {
        p_timezone: timezone,
        p_max_active_projects: maxProjects,
        p_max_days_per_week: maxDays,
        p_preferred_shift: preferredShift,
        p_travel_willingness: travel,
        p_rules: rules.map((rule) => ({
          weekday: rule.weekday,
          is_available: rule.is_available,
          start_time: rule.is_available ? rule.start_time : null,
          end_time: rule.is_available ? rule.end_time : null,
        })),
      });
      setMessage("Availability and workload preferences saved.");
      setRevision((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function addUnavailable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("add_worker_unavailable_period", {
        p_start: String(f.get("start")),
        p_end: String(f.get("end")),
        p_reason: String(f.get("reason")),
      });
      form.reset();
      setMessage("Unavailable dates added to your schedule.");
      setRevision((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function removeUnavailable(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("remove_worker_unavailable_period", { p_id: id });
      setMessage("Unavailable period removed.");
      setRevision((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (busy && !profile) return <section className="panel detail"><p role="status">Loading work schedule…</p></section>;

  return (
    <section className="panel detail worker-schedule-workspace">
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}

      <div className="worker-schedule-summary">
        <article><span><CalendarDays size={18} /></span><div><small>Current commitments</small><strong>{profile?.current_commitments || 0}</strong><p>Offered or active assignments</p></div></article>
        <article><span><Gauge size={18} /></span><div><small>Capacity</small><strong>{profile?.capacity_pct || 0}%</strong><p>Against your parallel-project limit</p></div></article>
        <article><span><Clock3 size={18} /></span><div><small>Available weekdays</small><strong>{activeRules.length}</strong><p>Structured weekly schedule</p></div></article>
        <article><span><MapPin size={18} /></span><div><small>Travel preference</small><strong>{human(profile?.preferences.travel_willingness || "local")}</strong><p>{human(profile?.preferences.preferred_shift || "flexible")} shift preference</p></div></article>
      </div>

      {view === "schedule" ? (
        <>
          <div className="worker-schedule-heading">
            <div><span className="eyebrow">MY SCHEDULE</span><h2>Upcoming commitments</h2><p>Your own assignment details stay private. Organizations only receive a conflict/capacity signal when preparing an offer.</p></div>
            <Badge value={profile?.preferences.configured ? "configured" : "not configured"} />
          </div>
          <div className="worker-schedule-list">
            {(schedule?.assignments || []).map((assignment) => (
              <article key={assignment.id} className="worker-schedule-assignment">
                <div><span className="eyebrow">{assignment.organization_name}</span><h3>{assignment.project_title}</h3><p>{dateLabel(assignment.start_date)} – {dateLabel(assignment.end_date)} · {assignment.target_surveys} survey target</p><small>{compensationLabel(assignment)}</small></div>
                <Badge value={assignment.status} />
              </article>
            ))}
            {!schedule?.assignments.length && <div className="worker-schedule-empty"><CalendarDays size={22} /><div><strong>No offered or active assignments in the next 60 days.</strong><p>Your accepted work and pending formal offers will appear here.</p></div></div>}
          </div>
          <div className="worker-schedule-heading compact"><div><span className="eyebrow">BLOCKED DATES</span><h3>Unavailable periods</h3></div></div>
          <div className="worker-unavailable-list">
            {(schedule?.unavailable_periods || []).map((period) => <article key={period.id}><div><strong>{dateLabel(period.starts_on)} – {dateLabel(period.ends_on)}</strong><p>{period.reason}</p></div></article>)}
            {!schedule?.unavailable_periods.length && <p className="fine">No unavailable dates overlap this schedule window.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="worker-schedule-heading">
            <div><span className="eyebrow">WORK AVAILABILITY</span><h2>Set your working pattern</h2><p>This schedule helps prevent conflicting offers. Partner organizations never receive the names or details of your other projects.</p></div>
            <Badge value={profile?.preferences.configured ? "configured" : "setup needed"} />
          </div>
          <form onSubmit={saveAvailability} className="worker-availability-form">
            <div className="form-grid">
              <label className="field">Timezone<input value={timezone} maxLength={100} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Karachi" required /></label>
              <label className="field">Maximum parallel projects<input type="number" min={1} max={10} value={maxProjects} onChange={(e) => setMaxProjects(Number(e.target.value))} required /></label>
              <label className="field">Maximum workdays / week<input type="number" min={1} max={7} value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))} required /></label>
              <label className="field">Preferred shift<select value={preferredShift} onChange={(e) => setPreferredShift(e.target.value)}><option value="flexible">Flexible</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label>
              <label className="field">Travel willingness<select value={travel} onChange={(e) => setTravel(e.target.value)}><option value="none">No travel</option><option value="local">Local area</option><option value="district">Across district</option><option value="province">Across province</option><option value="national">National</option></select></label>
            </div>
            <div className="worker-week-grid">
              {rules.map((rule, index) => {
                const label = weekdays.find(([day]) => day === rule.weekday)?.[1] || `Day ${rule.weekday}`;
                return <article key={rule.weekday} className={rule.is_available ? "available" : "unavailable"}>
                  <label className="worker-day-toggle"><input type="checkbox" checked={rule.is_available} onChange={(e) => setRules((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, is_available: e.target.checked, start_time: e.target.checked ? item.start_time || "09:00" : null, end_time: e.target.checked ? item.end_time || "17:00" : null } : item))} /><strong>{label}</strong><span>{rule.is_available ? "Available" : "Off"}</span></label>
                  {rule.is_available && <div className="worker-day-times"><input aria-label={`${label} start time`} type="time" value={rule.start_time || "09:00"} onChange={(e) => setRules((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, start_time: e.target.value } : item))} /><span>to</span><input aria-label={`${label} end time`} type="time" value={rule.end_time || "17:00"} onChange={(e) => setRules((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, end_time: e.target.value } : item))} /></div>}
                </article>;
              })}
            </div>
            <div className="actions"><button className="primary" disabled={busy}>Save availability</button></div>
          </form>

          <section className="worker-unavailable-manager">
            <div className="worker-schedule-heading compact"><div><span className="eyebrow">DATES OFF</span><h3>Unavailable periods</h3><p>Use this for travel, exams, family commitments or any dates when you cannot accept field work.</p></div></div>
            <form onSubmit={addUnavailable} className="worker-unavailable-form">
              <label className="field">From<input name="start" type="date" required /></label>
              <label className="field">To<input name="end" type="date" required /></label>
              <label className="field grow">Reason<input name="reason" minLength={2} maxLength={500} required placeholder="e.g. University exams" /></label>
              <button className="secondary" disabled={busy}><Plus size={15} /> Add dates</button>
            </form>
            <div className="worker-unavailable-list">
              {(profile?.unavailable_periods || []).map((period) => <article key={period.id}><div><strong>{dateLabel(period.starts_on)} – {dateLabel(period.ends_on)}</strong><p>{period.reason}</p></div><button className="link danger" type="button" disabled={busy} onClick={() => void removeUnavailable(period.id)} aria-label={`Remove unavailable period ${period.starts_on} to ${period.ends_on}`}><Trash2 size={15} /> Remove</button></article>)}
              {!profile?.unavailable_periods.length && <p className="fine">No unavailable periods recorded.</p>}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
