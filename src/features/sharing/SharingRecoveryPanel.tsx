import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
type T = Database["public"]["Tables"];
/** Small maintenance panel; full canonical match/merge workbench is a later release. */
export function SharingRecoveryPanel() {
  const [projects,setProjects]=useState<T["survey_projects"]["Row"][]>([]);
  const [identities,setIdentities]=useState<T["canonical_persons"]["Row"][]>([]);
  const [sources,setSources]=useState<T["registry_persons"]["Row"][]>([]);
  const [selected,setSelected]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let live=true;void (async()=>{
    const [p,c]=await Promise.all([db!.from("survey_projects").select("*").order("title").limit(500),db!.from("canonical_persons").select("*").eq("review_required",true).neq("identity_status","merged").order("updated_at").limit(100)]);
    if(!live)return;if(p.error||c.error){setMessage(p.error?.message||c.error?.message||"");return;}setProjects(p.data||[]);setIdentities(c.data||[]);
  })().catch(e=>{if(live)setMessage(e.message)});return()=>{live=false}},[revision]);
  useEffect(()=>{let live=true;setSources([]);if(!selected)return;void(async()=>{
    const links=await db!.from("canonical_person_links").select("project_person_id").eq("canonical_person_id",selected).limit(500);
    if(links.error)throw links.error;const ids=(links.data||[]).map(l=>l.project_person_id);if(!ids.length)return;
    const people=await db!.from("registry_persons").select("*").in("id",ids).order("registry_no");if(people.error)throw people.error;if(live)setSources(people.data||[]);
  })().catch(e=>{if(live)setMessage(e.message)});return()=>{live=false}},[selected,revision]);
  async function act(task:()=>Promise<unknown>){setBusy(true);setMessage("");try{await task();setMessage("Saved. Existing sharing approvals are not automatically renewed.");setRevision(v=>v+1);setSelected("");}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  function discovery(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void act(()=>rpc("set_project_sharing_discovery",{p_project:String(f.get("project")),p_enabled:f.get("enabled")==="yes",p_reason:String(f.get("reason"))}));}
  function reconcile(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),source=sources.find(s=>s.id===f.get("source")),canonical=identities.find(c=>c.id===selected);if(!source||!canonical)return;void act(()=>rpc("reconcile_canonical_identity",{p_person:source.id,p_source_version:source.version,p_canonical_version:canonical.version,p_reason:String(f.get("reason"))}));}
  return <section className="panel detail"><h2>Sharing correctness controls</h2>
    <p role="status">{message}</p>
    <details><summary>Project source discovery policy</summary><p>Disabled by default. Enabling reveals the source NGO name for an already linked beneficiary so another NGO can request access. Needs and assistance details still require both approvals. This setting controls new requests; revoke existing grants separately if required.</p>
    <form onSubmit={discovery}><label className="field">Project (up to 500)<select name="project" required>{projects.map(p=><option key={p.id} value={p.id}>{p.title} · discovery {p.sharing_discoverable?"enabled":"disabled"}</option>)}</select></label>
    <label className="field">Discovery<select name="enabled"><option value="no">Disabled</option><option value="yes">NGO name only; request required</option></select></label><label className="field">Policy reason<textarea name="reason" required minLength={5}/></label><button disabled={busy||!projects.length}>Save discovery policy</button></form></details>
    <details><summary>Canonical identity correction review ({identities.length}, up to 100)</summary><p>Select an authoritative project record after reviewing the linked sources. This updates the master display identity; it does not verify a person's documents or resolve disputed links. Resolve a disputed merge before using this action.</p>
    <label className="field">Identity<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select identity</option>{identities.map(c=><option key={c.id} value={c.id}>{c.display_name} · POEM-BEN-{c.beneficiary_no}</option>)}</select></label>
    {selected&&<form onSubmit={reconcile}><label className="field">Authoritative source<select name="source" required>{sources.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.birth_date||"DOB unknown"} · {s.project_id} · revision {s.version}</option>)}</select></label><label className="field">Review reason<textarea name="reason" required minLength={5}/></label><button disabled={busy||!sources.length}>Use reviewed source identity</button></form>}</details>
  </section>;
}
