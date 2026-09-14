import { useEffect, useState, type FormEvent } from "react";
import { rpc } from "../../../lib/supabase/client";
import { CanonicalDetail } from "./CanonicalDetail";
import { beneficiary,identityLabel,type Page,type SearchRow } from "./model";
import "./canonical.css";
export function CanonicalWorkbench(){
 const [filter,setFilter]=useState({query:"",state:"active"}),[cursors,setCursors]=useState<number[]>([0]),[rows,setRows]=useState<SearchRow[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[selected,setSelected]=useState(""),[revision,setRevision]=useState(0);
 const after=cursors[cursors.length-1];
 useEffect(()=>{let live=true;setBusy(true);setError("");setRows([]);void rpc("search_canonical_registry",{p_query:filter.query,p_state:filter.state,p_after:after,p_limit:25}).then(r=>{if(!live)return;const data=r as unknown as Page<SearchRow>;setRows(data.rows);setMore(data.has_more)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setBusy(false)});return()=>{live=false}},[filter,after,revision]);
 function search(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setFilter({query:String(f.get("query")||"").trim(),state:String(f.get("state"))});setCursors([0]);setSelected("")}
 return <div className="canonical-workbench"><section className="panel detail"><h1>Canonical registry</h1><p>POEM operator workspace for master identities, project source records and reviewed matches. Access and review actions are audited.</p>
 <form className="canonical-search" onSubmit={search}><label className="field">Name, beneficiary number or canonical UUID<input name="query" maxLength={200} placeholder="POEM-BEN-00000001 or name"/></label><label className="field">View<select name="state" defaultValue="active"><option value="active">Current identities</option><option value="review_required">Review required</option><option value="merged">Merged records</option><option value="all">All identities</option></select></label><button disabled={busy}>Search</button></form>
 {error&&<p role="alert" className="error-text">{error}</p>}{busy&&<p role="status">Loading identities…</p>}{!busy&&!error&&!rows.length&&<p>No matching identities. Try a name or switch to All identities.</p>}
 <div className="canonical-results">{rows.map(c=><button className="secondary canonical-result" key={c.id} aria-pressed={selected===c.id} onClick={()=>setSelected(c.id)}><strong>{c.display_name}</strong><span>{beneficiary(c.beneficiary_no)} · {c.birth_date||"DOB unknown"}</span><span>{identityLabel(c)} · {c.linked_records} source records</span></button>)}</div>
 <div className="document-actions"><button className="secondary" disabled={busy||cursors.length===1} onClick={()=>setCursors(c=>c.slice(0,-1))}>Previous</button><span>Page {cursors.length}</span><button className="secondary" disabled={busy||!more||!rows.length} onClick={()=>setCursors(c=>[...c,rows[rows.length-1].beneficiary_no])}>Next</button><button className="secondary" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh results</button></div></section>
 {selected&&<CanonicalDetail key={selected} id={selected} open={setSelected} changed={()=>setRevision(v=>v+1)}/>}</div>;
}
