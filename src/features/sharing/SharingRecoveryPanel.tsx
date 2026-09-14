import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
type T = Database["public"]["Tables"];
/** Project discovery controls; identity operations live in the registry domain. */
export function SharingRecoveryPanel() {
  const [projects,setProjects]=useState<T["survey_projects"]["Row"][]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let live=true;void db!.from("survey_projects").select("*").order("title").limit(500).then(result=>{if(!live)return;if(result.error)setMessage(result.error.message);else setProjects(result.data||[])});return()=>{live=false}},[revision]);
  async function act(task:()=>Promise<unknown>){setBusy(true);setMessage("");try{await task();setMessage("Saved. Existing sharing approvals are not automatically renewed.");setRevision(v=>v+1);}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  function discovery(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void act(()=>rpc("set_project_sharing_discovery",{p_project:String(f.get("project")),p_enabled:f.get("enabled")==="yes",p_reason:String(f.get("reason"))}));}
  return <section className="panel detail"><h2>Project discovery policy</h2>
    <p role="status">{message}</p>
    <details><summary>Project source discovery policy</summary><p>Disabled by default. Enabling reveals the source NGO name for an already linked beneficiary so another NGO can request access. Needs and assistance details still require both approvals. This setting controls new requests; revoke existing grants separately if required.</p>
    <form onSubmit={discovery}><label className="field">Project (up to 500)<select name="project" required>{projects.map(p=><option key={p.id} value={p.id}>{p.title} · discovery {p.sharing_discoverable?"enabled":"disabled"}</option>)}</select></label>
    <label className="field">Discovery<select name="enabled"><option value="no">Disabled</option><option value="yes">NGO name only; request required</option></select></label><label className="field">Policy reason<textarea name="reason" required minLength={5}/></label><button disabled={busy||!projects.length}>Save discovery policy</button></form></details>
    <p>Canonical source correction and match review are now in the Canonical registry workspace.</p>
  </section>;
}
