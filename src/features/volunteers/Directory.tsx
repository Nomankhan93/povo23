import { useEffect, useRef, useState, type FormEvent } from "react";
import { rpc } from "../../lib/supabase/client";
import { type Database } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { InviteVolunteer } from "../workforce/InviteVolunteer";
export type Profile = Database["public"]["Tables"]["volunteer_profiles"]["Row"];
export type DirectoryRow = Profile & {
  shortlist_status: string | null;
  shortlist_note: string | null;
  shortlist_version: number | null;
};
export type Result = {
  rows: DirectoryRow[];
  total: number;
  page: number;
  page_size: number;
};
export const human = (s: string) => s.replaceAll("_", " ");
export function Directory({
  organization,
  geographies,
  reviewQueue,
  onSelect,
  revision,
}: {
  organization: string | null;
  geographies: Geo[];
  reviewQueue: boolean;
  onSelect: (p: DirectoryRow | null) => void;
  revision: number;
}) {
  const [filters, setFilters] = useState({
    query: "",
    geography: "",
    skill: "",
    language: "",
    availability: "",
    status: reviewQueue ? "pending" : "",
    shortlist: "",
  });
  const [applied, setApplied] = useState(filters),
    [page, setPage] = useState(0),
    [data, setData] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<DirectoryRow | null>(null),
    [saving, setSaving] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    let alive = true;
    const id = ++request.current;
    setBusy(true);
    setError("");
    setData(null);
    setEditing(null);
    rpc("search_volunteers", {
      p_org: organization,
      p_query: applied.query,
      p_geography: applied.geography || null,
      p_skill: applied.skill,
      p_language: applied.language,
      p_availability: applied.availability,
      p_status: reviewQueue ? "pending" : applied.status,
      p_shortlist: applied.shortlist,
      p_page: page,
    })
      .then((result) => {
        if (alive && id === request.current)
          setData(result as unknown as Result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [organization, applied, page, reviewQueue, revision, refresh]);
  function apply(e: FormEvent) {
    e.preventDefault();
    onSelect(null);
    setPage(0);
    setApplied({ ...filters });
  }
  async function shortlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || !organization) return;
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      await rpc("save_shortlist", {
        p_org: organization,
        p_user: editing.user_id,
        p_status: String(f.get("status")),
        p_note: String(f.get("note")),
        p_version: editing.shortlist_version || 0,
      });
      setEditing(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel detail">
      <div className="panel-title">
        <h2>
          {reviewQueue ? "Pending profile reviews" : "Volunteer directory"}
        </h2>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            onSelect(null);
            setRefresh((n) => n + 1);
          }}
        >
          Refresh
        </button>
      </div>
      <p>
        {organization
          ? "Only volunteers currently sharing with this NGO appear here. Selection does not create a contract or assignment."
          : "Search the authorized FieldLance volunteer network."}
      </p>
      <form onSubmit={apply}>
        <div className="form-grid">
          {[
            ["query", "Name"],
            ["skill", "Skill contains"],
            ["language", "Language contains"],
          ].map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                maxLength={100}
                value={filters[key as keyof typeof filters]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <label className="field">
            Geography (includes descendants)
            <select
              value={filters.geography}
              onChange={(e) =>
                setFilters({ ...filters, geography: e.target.value })
              }
            >
              <option value="">All areas</option>
              {geographies.map((g) => (
                <option key={g.id} value={g.id}>
                  {geographyPath(g.id, geographies)
                    .map((a) => a.name)
                    .join(" / ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Availability
            <select
              value={filters.availability}
              onChange={(e) =>
                setFilters({ ...filters, availability: e.target.value })
              }
            >
              {["", "Part-time", "Full-time", "Weekends", "Unavailable"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s || "Any availability"}
                  </option>
                ),
              )}
            </select>
          </label>
          {!reviewQueue && (
            <label className="field">
              Verification
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                {[
                  "",
                  "draft",
                  "pending",
                  "verified",
                  "correction_required",
                  "suspended",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s === "verified" ? "Active profile" : human(s) || "All statuses"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {organization && (
            <label className="field">
              Shortlist
              <select
                value={filters.shortlist}
                onChange={(e) =>
                  setFilters({ ...filters, shortlist: e.target.value })
                }
              >
                {[
                  "",
                  "any",
                  "shortlisted",
                  "considering",
                  "selected",
                  "not_selected",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s === "any"
                      ? "Any shortlisted profile"
                      : human(s) || "All shared profiles"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() => {
              const empty = {
                query: "",
                geography: "",
                skill: "",
                language: "",
                availability: "",
                status: reviewQueue ? "pending" : "",
                shortlist: "",
              };
              setFilters(empty);
              setApplied(empty);
              setPage(0);
              onSelect(null);
            }}
          >
            Clear filters
          </button>
          <button className="primary" disabled={busy}>
            Apply filters
          </button>
        </div>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading volunteers…</p>}
      {data && (
        <>
          <p role="status">
            {data.total} matching profiles · page {page + 1} of{" "}
            {Math.max(1, Math.ceil(data.total / 50))}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Location</th>
                  <th>Skills / languages</th>
                  <th>Status</th>
                  {organization && <th>Selection</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => {
                  const d = p.details as Record<string, string>;
                  return (
                    <tr key={p.user_id}>
                      <td>
                        <strong>{d.full_name || "Unnamed volunteer"}</strong>
                        <p>{d.availability || "Not specified"}</p>
                      </td>
                      <td>
                        {geographyPath(p.geography_id, geographies)
                          .map((g) => g.name)
                          .join(" / ") ||
                          d.area ||
                          "—"}
                      </td>
                      <td>
                        {d.skills || "—"}
                        <p>{d.languages || "—"}</p>
                      </td>
                      <td>
                        <span className={"badge " + p.status}>
                          {p.status === "verified" ? "active" : human(p.status)}
                        </span>
                      </td>
                      {organization && (
                        <td>
                          {human(p.shortlist_status || "Not shortlisted")}
                        </td>
                      )}
                      <td>
                        <button className="link" onClick={() => onSelect(p)}>
                          View profile
                        </button>
                        {organization && (
                          <button
                            className="link"
                            onClick={() => setEditing(p)}
                          >
                            Manage shortlist
                          </button>
                        )}
                        {organization &&
                          p.shortlist_status &&
                          p.shortlist_status !== "not_selected" && (
                            <InviteVolunteer
                              organization={organization}
                              userId={p.user_id}
                              name={d.full_name || "Volunteer"}
                            />
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!data.rows.length && (
            <p className="empty">
              No matching profiles. Change filters or return to the first page.
            </p>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={page === 0 || busy}
              onClick={() => {
                onSelect(null);
                setPage((p) => p - 1);
              }}
            >
              Previous 50
            </button>
            <button
              className="secondary"
              disabled={(page + 1) * 50 >= data.total || busy}
              onClick={() => {
                onSelect(null);
                setPage((p) => p + 1);
              }}
            >
              Next 50
            </button>
          </div>
        </>
      )}
      {editing && (
        <form
          className="review"
          key={editing.user_id + String(editing.shortlist_version)}
          onSubmit={shortlist}
        >
          <h3>NGO shortlist decision</h3>
          <p>
            {(editing.details as Record<string, string>).full_name}. Notes are
            private to this NGO's authorized admins.
          </p>
          <label className="field">
            Status
            <select
              name="status"
              defaultValue={editing.shortlist_status || "shortlisted"}
            >
              {[
                "shortlisted",
                "considering",
                "selected",
                "not_selected",
                "remove",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Internal selection note
            <textarea
              name="note"
              defaultValue={editing.shortlist_note || ""}
              maxLength={2000}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save decision"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
