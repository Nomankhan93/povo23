import {useCallback,useEffect,useMemo,useState,type ReactNode} from "react";
import {ArrowRight,CircleDollarSign,Clock3,CreditCard,ReceiptText,RefreshCw,WalletCards} from "lucide-react";
import {EmptyState} from "../../components/ui/WorkflowOverview";
import {db,rpc} from "../../lib/supabase/client";
import type {Database} from "../../lib/supabase/database.types";
import {PayablesWorkspace} from "../payables/PayablesWorkspace";
import {FinanceJourney} from "./FinanceJourney";

type Assignment=Database["public"]["Tables"]["work_assignments"]["Row"];
type Summary={currency:string;approved:string;paid:string;gross_balance:string;pending_withdrawals:string;available:string;verified_wallets:number;pin_configured:boolean;provider_mode:"mock"};
type Withdrawal={id:string;amount:string;status:string;provider:string;requested_at:string;settlement_reference:string|null};
type WithdrawalList={rows:Withdrawal[];count:number};
type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const money=(value:string|number|null|undefined)=>new Intl.NumberFormat("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
const human=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,(m)=>m.toUpperCase());

export function EarningsWorkspace({userId,onNavigate}:{userId:string;onNavigate:(page:string)=>void}){
  const [summary,setSummary]=useState<Summary|null>(null);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [withdrawals,setWithdrawals]=useState<Withdrawal[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);

  useEffect(()=>{let live=true;setLoading(true);setError("");void Promise.all([
    call("my_withdrawal_summary",{p_currency:"PKR"}),
    db!.from("work_assignments").select("*").eq("user_id",userId).eq("work_mode","paid").order("created_at",{ascending:false}).limit(6),
    call("my_e_wallet_withdrawals",{p_before:null,p_limit:5}),
  ]).then(([summaryResult,assignmentResult,withdrawalResult])=>{
    if(!live)return;
    if(assignmentResult.error)throw assignmentResult.error;
    setSummary(summaryResult as Summary);
    setAssignments(assignmentResult.data||[]);
    setWithdrawals((withdrawalResult as WithdrawalList).rows||[]);
  }).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[revision,userId]);

  const activeContracts=useMemo(()=>assignments.filter(a=>a.status==="active").length,[assignments]);
  const completedContracts=useMemo(()=>assignments.filter(a=>a.status==="completed").length,[assignments]);
  const stage=Number(summary?.pending_withdrawals||0)>0?"withdrawal":Number(summary?.available||0)>0?"available":Number(summary?.approved||0)>0?"approved":Number(summary?.paid||0)>0?"settled":"earned";
  const nextAction=Number(summary?.pending_withdrawals||0)>0
    ? {title:"Withdrawal is being processed",copy:`PKR ${money(summary?.pending_withdrawals)} is reserved while FieldLance Finance completes provider processing.`,button:"View withdrawal",page:"E-Wallets & withdrawals"}
    : Number(summary?.available||0)>=100
      ? {title:"Approved earnings are ready to withdraw",copy:`PKR ${money(summary?.available)} is currently available. Withdraw only to an eligible verified JazzCash or Easypaisa wallet.`,button:"Request withdrawal",page:"E-Wallets & withdrawals"}
      : (summary?.verified_wallets||0)===0
        ? {title:"Set up a payout wallet",copy:"Link and verify a JazzCash or Easypaisa wallet now so approved earnings can be withdrawn when they become available.",button:"Set up wallet",page:"E-Wallets & withdrawals"}
        : {title:"Keep completing verified paid work",copy:"Approved payable units will appear here automatically. Claims, disputes and approvals remain governed by the existing payable workflow.",button:"Browse opportunities",page:"Available Opportunities"};

  return <section className="earnings-workspace">
    <header className="finance-hero">
      <div><span className="eyebrow">FIELD WORKER FINANCE</span><h2>Earnings</h2><p>Track paid contracts, approved entitlement, withdrawable balance and payout progress without mixing accounting records with provider settlement.</p></div>
      <div className="actions"><button className="secondary" disabled={loading} onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className="primary" onClick={()=>onNavigate("E-Wallets & withdrawals")}><WalletCards size={15}/> Wallet & withdrawals</button></div>
    </header>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <FinanceJourney stage={stage}/>
    <div className="finance-metric-grid">
      <FinanceMetric icon={<CircleDollarSign size={18}/>} label="Approved earnings" value={`PKR ${money(summary?.approved)}`} detail="Server-approved entitlement"/>
      <FinanceMetric icon={<WalletCards size={18}/>} label="Available" value={`PKR ${money(summary?.available)}`} detail="Approved, unpaid and not reserved"/>
      <FinanceMetric icon={<Clock3 size={18}/>} label="Pending withdrawal" value={`PKR ${money(summary?.pending_withdrawals)}`} detail="Reserved for processing"/>
      <FinanceMetric icon={<ReceiptText size={18}/>} label="Paid out" value={`PKR ${money(summary?.paid)}`} detail="Recorded provider/accounting settlement"/>
    </div>
    <section className="finance-next-action"><div><span className="eyebrow">NEXT ACTION</span><h3>{nextAction.title}</h3><p>{nextAction.copy}</p></div><button className="primary" onClick={()=>onNavigate(nextAction.page)}>{nextAction.button}<ArrowRight size={15}/></button></section>

    <div className="finance-two-column">
      <section className="finance-card"><div className="finance-card-heading"><div><span className="eyebrow">PAID CONTRACTS</span><h3>Recent assignments</h3></div><span className="finance-count">{activeContracts} active · {completedContracts} completed</span></div>
        {!assignments.length&&<EmptyState>No paid assignments yet. Paid contracts appear after you accept a formal paid assignment offer.</EmptyState>}
        <div className="finance-list">{assignments.slice(0,4).map(a=><article key={a.id}><div><strong>{a.project_title}</strong><p>{a.organization_name} · {a.currency} {money(a.rate)} / {human(a.compensation_type)}</p></div><span className={`finance-state ${a.status}`}>{human(a.status)}</span></article>)}</div>
        <div className="finance-card-actions"><button className="secondary" onClick={()=>onNavigate("My Assigned Surveys")}>Assigned surveys</button></div>
      </section>
      <section className="finance-card"><div className="finance-card-heading"><div><span className="eyebrow">PAYOUT ACTIVITY</span><h3>Recent withdrawals</h3></div><span className="finance-count">{summary?.verified_wallets||0} verified wallet{summary?.verified_wallets===1?"":"s"}</span></div>
        {!withdrawals.length&&<EmptyState>No withdrawal requests yet. Approved earnings stay available until you request a payout.</EmptyState>}
        <div className="finance-list">{withdrawals.map(w=><article key={w.id}><div><strong>PKR {money(w.amount)} · {human(w.provider)}</strong><p>{new Date(w.requested_at).toLocaleString()}{w.settlement_reference?` · ${w.settlement_reference}`:""}</p></div><span className={`finance-state ${w.status}`}>{human(w.status)}</span></article>)}</div>
        <div className="finance-card-actions"><button className="secondary" onClick={()=>onNavigate("E-Wallets & withdrawals")}>Open wallet history</button></div>
      </section>
    </div>

    <section className="finance-ledger-section"><div className="finance-section-heading"><div><span className="eyebrow">EARNINGS LEDGER</span><h3>Claims & payable detail</h3><p>Use the existing payable ledger for work claims, disputes and immutable unit-level accounting. Withdrawal settlement is handled separately in Wallet & withdrawals.</p></div></div><PayablesWorkspace userId={userId} organization={null} embedded/></section>
  </section>;
}

function FinanceMetric({icon,label,value,detail}:{icon:ReactNode;label:string;value:string;detail:string}){
  return <article className="finance-metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}
