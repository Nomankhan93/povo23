import {useCallback,useEffect,useState} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type WalletRow={id:string;user_id:string;user_name:string;provider:'jazzcash'|'easypaisa';account_title:string;account_masked:string;status:string;withdrawal_eligible_at:string|null;withdrawal_eligible:boolean;created_at:string;version:number};
type WithdrawalRow={id:string;user_id:string;user_name:string;provider:'jazzcash'|'easypaisa';account_masked_snapshot:string;amount:string;currency:string;status:string;provider_reference:string;requested_at:string;processing_at:string|null;settled_at:string|null;failed_at:string|null;reversed_at:string|null;version:number};
type Queue={wallets:WalletRow[];withdrawals:WithdrawalRow[];provider_mode:'mock';activation_hold_hours:number};
type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const label=(v:string)=>v==='jazzcash'?'JazzCash':'Easypaisa';

export function MockEWalletSandbox(){
 const [data,setData]=useState<Queue>({wallets:[],withdrawals:[],provider_mode:'mock',activation_hold_hours:24}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);
 useEffect(()=>{let live=true;setLoading(true);setError('');void call('admin_mock_e_wallet_queue',{}).then(r=>{if(live)setData(r as Queue)}).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[revision]);
 async function run(task:()=>Promise<unknown>,message:string){setBusy(true);setError('');setNotice('');try{await task();setNotice(message);refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(loading&&!data.wallets.length&&!data.withdrawals.length)return <p role="status">Loading mock e-wallet sandbox…</p>;
 return <section className="ewallet-workspace">
  <div className="panel-title"><div><span className="eyebrow">POEM ADMIN · DEVELOPMENT ONLY</span><h2>Mock E-Wallet Sandbox</h2></div><Badge value="mock only"/></div>
  <div className="notice warning"><strong>No live money movement:</strong> these controls simulate JazzCash/Easypaisa ownership checks, the {data.activation_hold_hours}-hour activation hold and provider callbacks for development testing. End users cannot invoke provider outcomes.</div>
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
  <div className="actions"><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh sandbox</button></div>
  <section className="panel detail"><h3>Wallet verification & activation queue</h3>{!data.wallets.length&&<EmptyState>No pending/rejected wallets or wallets inside the activation hold.</EmptyState>}
   <div className="ewallet-grid">{data.wallets.map(w=><article className="document-row ewallet-card" key={w.id}><div className="panel-title"><div><strong>{w.user_name||w.user_id}</strong><p>{label(w.provider)} · {w.account_masked} · {w.account_title}</p></div><Badge value={w.status}/></div>{w.status==='verified'&&!w.withdrawal_eligible&&w.withdrawal_eligible_at&&<p>Security hold until {new Date(w.withdrawal_eligible_at).toLocaleString()}.</p>}<div className="actions">{['pending','rejected'].includes(w.status)&&<><button className="secondary" disabled={busy} onClick={()=>void run(()=>call('simulate_mock_e_wallet_verification',{p_wallet:w.id,p_outcome:'verified',p_event_key:crypto.randomUUID()}),'Mock wallet verified and activation hold started.')}>Simulate verified</button><button className="secondary" disabled={busy} onClick={()=>void run(()=>call('simulate_mock_e_wallet_verification',{p_wallet:w.id,p_outcome:'rejected',p_event_key:crypto.randomUUID()}),'Mock wallet rejected.')}>Simulate rejected</button></>}{w.status==='verified'&&!w.withdrawal_eligible&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('simulate_mock_e_wallet_activation',{p_wallet:w.id,p_event_key:crypto.randomUUID()}),'Mock activation hold bypassed for development testing.')}>Activate now (mock)</button>}</div></article>)}</div>
  </section>
  <section className="panel detail"><h3>Withdrawal callback queue</h3>{!data.withdrawals.length&&<EmptyState>No mock withdrawals awaiting provider action.</EmptyState>}
   {data.withdrawals.map(w=><article className="document-row" key={w.id}><div className="panel-title"><div><strong>{w.currency} {Number(w.amount).toLocaleString('en-PK',{minimumFractionDigits:2})} · {label(w.provider)} {w.account_masked_snapshot}</strong><p>{w.user_name||w.user_id} · {w.provider_reference}</p></div><Badge value={w.status}/></div><div className="actions">{w.status==='requested'&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('simulate_mock_e_wallet_provider',{p_withdrawal:w.id,p_outcome:'processing',p_event_key:crypto.randomUUID()}),'Mock withdrawal marked processing.')}>Processing</button>}{['requested','processing'].includes(w.status)&&<><button className="secondary" disabled={busy} onClick={()=>void run(()=>call('simulate_mock_e_wallet_provider',{p_withdrawal:w.id,p_outcome:'succeeded',p_event_key:crypto.randomUUID()}),'Mock withdrawal succeeded.')}>Success</button><button className="secondary" disabled={busy} onClick={()=>void run(()=>call('simulate_mock_e_wallet_provider',{p_withdrawal:w.id,p_outcome:'failed',p_event_key:crypto.randomUUID()}),'Mock withdrawal failed.')}>Failure</button></>}{w.status==='succeeded'&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('simulate_mock_e_wallet_provider',{p_withdrawal:w.id,p_outcome:'reversed',p_event_key:crypto.randomUUID()}),'Mock withdrawal reversed.')}>Reverse</button>}</div></article>)}
  </section>
 </section>;
}
