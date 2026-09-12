import { useState, type FormEvent } from "react";
import { rpc } from "../../lib/supabase/client";
import { activeNode, Geo, geographyPath, levels } from "./model";
export function GeographyManager({
  rows,
  refresh,
}: {
  rows: Geo[];
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Geo | null>(null),
    [kind, setKind] = useState("province"),
    [parent, setParent] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("");
  const rank = (k: string) => (k === "ward" ? 5 : levels.indexOf(k));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const el = e.currentTarget,
      f = new FormData(el);
    try {
      await rpc("save_geography", {
        p_id: editing?.id || null,
        p_parent: parent || null,
        p_kind: kind,
        p_name: String(f.get("name")),
        p_code: String(f.get("code")),
        p_source: String(f.get("source")),
        p_active: f.get("active") === "on",
      });
      setEditing(null);
      el.reset();
      setKind("province");
      setParent("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel detail">
      <h2>Geography master data</h2>
      <p>
        Use approved administrative names and unique codes. Record the
        source/reference. Existing nodes cannot be moved to another parent or
        level.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <form key={editing?.id || "new"} onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            Level
            <select
              disabled={!!editing}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setParent("");
              }}
            >
              {[...levels, "ward"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Parent
            <select
              disabled={!!editing || kind === "province"}
              required={kind !== "province"}
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">
                {kind === "province" ? "No parent" : "Select parent"}
              </option>
              {rows
                .filter((g) => rank(g.kind) === rank(kind) - 1)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {geographyPath(g.id, rows)
                      .map((n) => n.name)
                      .join(" / ")}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Area name
            <input
              name="name"
              defaultValue={editing?.name}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label className="field">
            Unique code
            <input
              name="code"
              defaultValue={editing?.code}
              required
              maxLength={80}
            />
          </label>
          <label className="field">
            Source / administrative reference
            <input
              name="source"
              defaultValue={editing?.source_note}
              maxLength={1000}
            />
          </label>
          <label className="checklabel">
            <input
              type="checkbox"
              name="active"
              defaultChecked={editing?.active ?? true}
            />
            Active
          </label>
        </div>
        <div className="actions">
          {editing && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditing(null);
                setKind("province");
                setParent("");
              }}
            >
              Cancel edit
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Update area" : "Add area"}
          </button>
        </div>
      </form>
      <input
        className="area-search"
        aria-label="Search areas"
        placeholder="Search area or code…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Area / hierarchy</th>
              <th>Level</th>
              <th>Code</th>
              <th>Status</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((g) =>
                (g.name + " " + g.code)
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((g) => (
                <tr key={g.id}>
                  <td>
                    {geographyPath(g.id, rows)
                      .map((n) => n.name)
                      .join(" / ")}
                  </td>
                  <td>{g.kind}</td>
                  <td>{g.code}</td>
                  <td>
                    {activeNode(g, rows) ? "Active" : "Inactive hierarchy"}
                  </td>
                  <td>
                    <button
                      className="link"
                      onClick={() => {
                        setEditing(g);
                        setKind(g.kind);
                        setParent(g.parent_id || "");
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
