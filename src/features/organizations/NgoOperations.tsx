import {AreaSelector} from "../geography/AreaSelector";
import {addOperatingArea,areaCaption,selectableArea,operatingKinds} from "../geography/areaSelection";
import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { geographyPath, type Geo } from "../geography/model";
export function OperationsForm({
  orgId,
  geographies,
  editable,
}: {
  orgId: string;
  geographies: Geo[];
  editable: boolean;
}) {
  const [candidate,setCandidate]=useState<string|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [programs, setPrograms] = useState(""),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setLoaded(false);
    setError("");
    Promise.all([
      db!
        .from("organization_areas")
        .select("geography_id")
        .eq("organization_id", orgId),
      db!
        .from("organization_programs")
        .select("name")
        .eq("organization_id", orgId)
        .order("name"),
      db!
        .from("organizations")
        .select("operations_version")
        .eq("id", orgId)
        .single(),
    ])
      .then(([a, p, o]) => {
        if (!alive) return;
        for (const r of [a, p, o]) if (r.error) throw r.error;
        setSelected(a.data!.map((x) => x.geography_id));
        setPrograms(p.data!.map((x) => x.name).join("\n"));
        setVersion(o.data!.operations_version);
        setLoaded(true);
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
  }, [orgId, reload]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("save_ngo_operations", {
        p_org: orgId,
        p_areas: selected,
        p_programs: programs
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean),
        p_version: version,
      });
      setMessage("Operating areas and programs saved.");
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const canAdd=Boolean(candidate&&selectableArea(candidate,geographies)&&operatingKinds.includes(geographies.find(g=>g.id===candidate)?.kind||'')&&!selected.includes(candidate)&&selected.length<100);
  return (
    <section className="operations">
      <h3>Structured NGO operations</h3>
      {error && (
        <p role="alert" className="notice error">
          {error}{" "}
          <button onClick={() => setReload((n) => n + 1)}>
            Reload operations
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {busy ? (
        <p>Loading…</p>
      ) : editable ? (
        <form onSubmit={save}>
          <AreaSelector rows={geographies} value={candidate} onChange={setCandidate} title="Operating areas" disabled={!loaded||busy}/>
          <p>Choose District or a narrower area, then add it. You can keep areas from different provinces. Save operations to commit changes.</p>
          <button type="button" className="secondary" disabled={!canAdd||!loaded||busy} onClick={()=>setSelected(old=>addOperatingArea(old,candidate,geographies))}>{candidate&&selected.includes(candidate)?'Area already added':'Add area'}</button>
          <p role="status">{selected.length} / 100 areas selected</p>
          <ul className="selected-operating-areas">{selected.map(id=><li key={id}><span>{areaCaption(id,geographies)}{!selectableArea(id,geographies)&&' (inactive or unavailable — retained)'}</span><button type="button" className="secondary" disabled={!loaded||busy} aria-label={'Remove '+areaCaption(id,geographies)} onClick={()=>setSelected(old=>old.filter(g=>g!==id))}>Remove</button></li>)}</ul>
          {!selected.length&&<p>No operating areas selected.</p>}
          <label className="field">
            Programs (one per line)
            <textarea
              value={programs}
              onChange={(e) => setPrograms(e.target.value)}
              maxLength={5050}
            />
          </label>
          <button className="secondary" disabled={busy || !version || !loaded}>
            Save operations
          </button>
        </form>
      ) : (
        <>
          <p>
            {selected
              .map((id) =>
                geographyPath(id, geographies)
                  .map((n) => n.name)
                  .join(" / "),
              )
              .join("; ") || "No structured areas assigned"}
          </p>
          <p className="preserve-lines">
            {programs || "No structured programs assigned"}
          </p>
        </>
      )}
    </section>
  );
}
export function NgoOperations(props: {
  orgId: string;
  geographies: Geo[];
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="operations">
      <button
        className="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open
          ? "Close operating areas / programs"
          : "Operating areas / programs"}
      </button>
      {open && <OperationsForm {...props} />}
    </div>
  );
}
