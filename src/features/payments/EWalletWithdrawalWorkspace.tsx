import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type Wallet={
  id:string;provider:'jazzcash'|'easypaisa';account_title:string;account_masked:string;
  status:'pending'|'verified'|'rejected'|'suspended';verification_mode:'mock';is_default:boolean;
  verified_at:string|null;version:number;created_at:string;updated_at:string;
};
type WalletList={rows:Wallet[];count:number;max_wallets:number;providers:string[];provider_mode:'mock'};
type Summary={currency:string;approved:string;paid:string;gross_balance:string;pending_withdrawals:string;available:string;verified_wallets:number;pin_configured:boolean;provider_mode:'mock'};
type Security={pin_configured:boolean;crypto_ready:boolean};
type Withdrawal={
  id:string;provider:'jazzcash'|'easypaisa';account_title_snapshot:string;account_masked_snapshot:string;
  currency:string;amount:string;status:'requested'|'processing'|'succeeded'|'failed'|'reversed'|'cancelled';
  provider_mode:'mock';provider_reference:string;failure_code:string|null;failure_message:string|null;
  requested_at:string;processing_at:string|null;settled_at:string|null;failed_at:string|null;reversed_at:string|null;cancelled_at:string|null;
  version:number;allocation_count:number;
};
type WithdrawalList={rows:Withdrawal[];count:number;provider_mode:'mock'};

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const providerLabel=(provider:string)=>provider==='jazzcash'?'JazzCash':'Easypaisa';
const money=(value:string|number)=>new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));

export function EWalletWithdrawalWorkspace(){
  const [wallets,setWallets]=useState<WalletList>({rows:[],count:0,max_wallets:2,providers:['jazzcash','easypaisa'],provider_mode:'mock'});
  const [summary,setSummary]=useState<Summary|null>(null);
  const [security,setSecurity]=useState<Security|null>(null);
  const [withdrawals,setWithdrawals]=useState<Withdrawal[]>([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const [provider,setProvider]=useState<'jazzcash'|'easypaisa'>('jazzcash');
  const [selectedWallet,setSelectedWallet]=useState('');

  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{let live=true;setLoading(true);setError('');void Promise.all([
    call('my_e_wallets',{}),call('my_withdrawal_summary',{p_currency:'PKR'}),call('my_withdrawal_security',{}),call('my_e_wallet_withdrawals',{p_before:null,p_limit:50}),
  ]).then(([walletResult,summaryResult,securityResult,withdrawalResult])=>{
    if(!live)return;
    const nextWallets=walletResult as WalletList;
    setWallets(nextWallets);
    setSummary(summaryResult as Summary);
    setSecurity(securityResult as Security);
    setWithdrawals((withdrawalResult as WithdrawalList).rows||[]);
    setSelectedWallet(current=>current&&nextWallets.rows.some(w=>w.id===current&&w.status==='verified')?current:(nextWallets.rows.find(w=>w.status==='verified'&&w.is_default)||nextWallets.rows.find(w=>w.status==='verified'))?.id||'');
  }).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[revision]);

  async function run(task:()=>Promise<unknown>,message:string){
    setBusy(true);setError('');setNotice('');
    try{const result=await task();setNotice(message);refresh();return result}catch(e){setError((e as Error).message);return null}finally{setBusy(false)}
  }

  function linkWallet(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);
    void run(()=>call('save_my_e_wallet',{p_provider:provider,p_account_title:String(form.get('account_title')||''),p_account_number:String(form.get('account_number')||'')}),'E-wallet saved for mock ownership verification.');
  }
  function configurePin(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const element=event.currentTarget,form=new FormData(element),next=String(form.get('new_pin')||''),confirm=String(form.get('confirm_pin')||'');
    if(next!==confirm){setError('New transaction PIN and confirmation do not match.');return}
    void run(()=>call('configure_withdrawal_pin',{p_current:String(form.get('current_pin')||'')||null,p_new:next}),'Transaction PIN updated.').then(result=>{if(result!==null)element.reset()});
  }
  function requestWithdrawal(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const element=event.currentTarget,form=new FormData(element),amount=Number(form.get('amount'));
    if(!selectedWallet){setError('Choose a verified JazzCash or Easypaisa wallet.');return}
    void run(()=>call('request_e_wallet_withdrawal',{p_wallet:selectedWallet,p_amount:amount,p_pin:String(form.get('pin')||''),p_request:crypto.randomUUID()}),'Mock withdrawal request created. No live provider API was called.').then(result=>{if(result!==null)element.reset()});
  }

  const verified=useMemo(()=>wallets.rows.filter(w=>w.status==='verified'),[wallets.rows]);
  const canAddJazzCash=!wallets.rows.some(w=>w.provider==='jazzcash'&&w.status!=='rejected');
  const canAddEasypaisa=!wallets.rows.some(w=>w.provider==='easypaisa'&&w.status!=='rejected');

  useEffect(()=>{
    if(provider==='jazzcash'&&!canAddJazzCash&&canAddEasypaisa)setProvider('easypaisa');
    else if(provider==='easypaisa'&&!canAddEasypaisa&&canAddJazzCash)setProvider('jazzcash');
  },[provider,canAddJazzCash,canAddEasypaisa]);

  if(loading&&!summary)return <p role="status">Loading e-wallets and withdrawal balance…</p>;
  return <section className="ewallet-workspace">
    <div className="panel-title"><div><span className="eyebrow">PAYOUT METHODS</span><h2>JazzCash & Easypaisa</h2></div><Badge value="mock sandbox"/></div>
    <div className="notice warning"><strong>Development sandbox:</strong> JazzCash/Easypaisa verification and provider settlement are simulated by the POEM Admin sandbox. No live provider API is called and no real money is transferred.</div>
    {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
    <div className="actions"><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh balance</button></div>

    {summary&&<section className="panel detail"><h3>Withdrawal balance</h3><div className="stats ewallet-stats">
      <article className="stat"><div>Approved earnings</div><b>PKR {money(summary.approved)}</b></article>
      <article className="stat"><div>Already paid</div><b>PKR {money(summary.paid)}</b></article>
      <article className="stat"><div>Pending withdrawals</div><b>PKR {money(summary.pending_withdrawals)}</b></article>
      <article className="stat"><div>Available</div><b>PKR {money(summary.available)}</b></article>
    </div><p>Only approved, unpaid PKR payable units are withdrawable. A pending request reserves its exact payable allocations so the same earnings cannot be withdrawn twice.</p></section>}

    <section className="panel detail"><div className="panel-title"><div><span className="eyebrow">BOUND E-WALLETS</span><h3>My e-wallets ({wallets.count}/{wallets.max_wallets})</h3></div></div>
      {!wallets.rows.length&&<EmptyState>No e-wallet linked yet. Add JazzCash or Easypaisa below.</EmptyState>}
      <div className="ewallet-grid">{wallets.rows.map(wallet=><article className="document-row ewallet-card" key={wallet.id}>
        <div className="panel-title"><div><strong>{providerLabel(wallet.provider)}</strong><p>{wallet.account_masked} · {wallet.account_title}</p></div><Badge value={wallet.status}/></div>
        <p>{wallet.is_default?'Default payout wallet · ':''}{wallet.status==='verified'?'Mock ownership check passed by POEM Admin.':'Awaiting or failed mock ownership verification.'}</p>
        <div className="actions">
          {wallet.status==='verified'&&!wallet.is_default&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('set_default_e_wallet',{p_wallet:wallet.id}),'Default e-wallet updated.')}>Make default</button>}
          {wallet.status!=='suspended'&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('unlink_my_e_wallet',{p_wallet:wallet.id}),'E-wallet unlinked.')}>Unlink</button>}
        </div>
      </article>)}</div>
      {(canAddJazzCash||canAddEasypaisa)&&<form onSubmit={linkWallet}><fieldset disabled={busy}><legend>Link e-wallet</legend><div className="form-grid">
        <label className="field">E-wallet type<select value={provider} onChange={e=>setProvider(e.target.value as 'jazzcash'|'easypaisa')}><option value="jazzcash" disabled={!canAddJazzCash}>JazzCash</option><option value="easypaisa" disabled={!canAddEasypaisa}>Easypaisa</option></select></label>
        <label className="field">Full name of payee<input name="account_title" required minLength={2} maxLength={120} autoComplete="name"/></label>
        <label className="field">Wallet mobile number<input name="account_number" required inputMode="tel" placeholder="03XXXXXXXXX" autoComplete="tel"/></label>
      </div><p>The account title should match your POEM account name. Mock verification checks only that name match; it does not prove ownership of the live wallet number.</p><button className="primary">Save e-wallet</button></fieldset></form>}
    </section>

    <section className="panel detail"><h3>Transaction PIN</h3><p>A 6-digit transaction PIN protects withdrawal requests. The PIN is hashed server-side with the database cryptographic extension and is never returned to the browser.</p>
      {security&&!security.crypto_ready&&<p className="notice error">Secure PIN hashing is unavailable in this database. Do not enable withdrawals until the database cryptographic extension is available.</p>}
      <form onSubmit={configurePin}><fieldset disabled={busy||!security?.crypto_ready}><div className="form-grid">
        {security?.pin_configured&&<label className="field">Current PIN<input name="current_pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="current-password"/></label>}
        <label className="field">{security?.pin_configured?'New PIN':'Set transaction PIN'}<input name="new_pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="new-password"/></label>
        <label className="field">Confirm PIN<input name="confirm_pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="new-password"/></label>
      </div><button className="secondary">{security?.pin_configured?'Change PIN':'Set transaction PIN'}</button></fieldset></form>
    </section>

    <section className="panel detail"><h3>Request withdrawal</h3>
      <form onSubmit={requestWithdrawal}><fieldset disabled={busy||!security?.pin_configured||!verified.length||Number(summary?.available||0)<100}><div className="form-grid">
        <label className="field">Withdraw to<select value={selectedWallet} onChange={e=>setSelectedWallet(e.target.value)} required><option value="">Choose verified wallet</option>{verified.map(w=><option value={w.id} key={w.id}>{providerLabel(w.provider)} · {w.account_masked}{w.is_default?' · Default':''}</option>)}</select></label>
        <label className="field">Amount (PKR)<input name="amount" type="number" min="100" step="0.01" max={summary?.available||undefined} required placeholder="100.00"/></label>
        <label className="field">Transaction PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="current-password"/></label>
      </div><button className="primary">Request withdrawal</button></fieldset></form>
      {!verified.length&&<p className="notice">Verify at least one JazzCash or Easypaisa wallet before requesting a withdrawal.</p>}
    </section>

    <section className="panel detail"><h3>Withdrawal history</h3>{!withdrawals.length&&<EmptyState>No withdrawal requests yet.</EmptyState>}
      {withdrawals.map(w=><article className="document-row" key={w.id}><div className="panel-title"><div><strong>PKR {money(w.amount)} · {providerLabel(w.provider)} {w.account_masked_snapshot}</strong><p>{new Date(w.requested_at).toLocaleString()} · {w.allocation_count} payable allocation{w.allocation_count===1?'':'s'}</p></div><Badge value={w.status}/></div>
        <p>Provider reference: {w.provider_reference}</p>{w.failure_message&&<p className="notice error">{w.failure_message}</p>}
        <div className="actions">{w.status==='requested'&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('cancel_my_e_wallet_withdrawal',{p_withdrawal:w.id,p_version:w.version}),'Withdrawal cancelled and reserved earnings released.')}>Cancel request</button>}</div>
        {['requested','processing'].includes(w.status)&&<p className="notice">POEM Admin's mock provider sandbox controls this test settlement. You cannot mark your own withdrawal successful.</p>}
      </article>)}
    </section>
  </section>;
}
