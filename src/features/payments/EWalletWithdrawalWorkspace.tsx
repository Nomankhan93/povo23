import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type Wallet={
  id:string;provider:'jazzcash'|'easypaisa';account_title:string;account_masked:string;
  status:'pending'|'verified'|'rejected'|'suspended';verification_mode:'mock';is_default:boolean;
  verified_at:string|null;withdrawal_eligible_at:string|null;withdrawal_eligible:boolean;
  version:number;created_at:string;updated_at:string;
};
type WalletList={rows:Wallet[];count:number;max_wallets:number;providers:string[];provider_mode:'mock';activation_hold_hours:number};
type Summary={currency:string;approved:string;paid:string;gross_balance:string;pending_withdrawals:string;available:string;verified_wallets:number;pin_configured:boolean;provider_mode:'mock'};
type Security={pin_configured:boolean;crypto_ready:boolean;failed_attempts:number;attempts_remaining:number;locked_until:string|null;changed_at:string|null;last_failed_at?:string|null;last_success_at?:string|null};
type PinResult={ok:boolean;code:string;attempts_remaining:number;locked_until:string|null;changed_at?:string};
type Withdrawal={
  id:string;provider:'jazzcash'|'easypaisa';account_title_snapshot:string;account_masked_snapshot:string;
  currency:string;amount:string;status:'requested'|'approved'|'processing'|'succeeded'|'failed'|'reversed'|'cancelled';
  provider_mode:'mock'|'manual';provider_reference:string;settlement_reference:string|null;reversal_reference:string|null;failure_code:string|null;failure_message:string|null;
  requested_at:string;approved_at:string|null;processing_at:string|null;settled_at:string|null;failed_at:string|null;reversed_at:string|null;cancelled_at:string|null;
  version:number;allocation_count:number;
};
type WithdrawalList={rows:Withdrawal[];count:number;settlement_modes:string[]};

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const providerLabel=(provider:string)=>provider==='jazzcash'?'JazzCash':'Easypaisa';
const money=(value:string|number)=>new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
const when=(value:string|null)=>value?new Date(value).toLocaleString():'';

export function EWalletWithdrawalWorkspace(){
  const [wallets,setWallets]=useState<WalletList>({rows:[],count:0,max_wallets:2,providers:['jazzcash','easypaisa'],provider_mode:'mock',activation_hold_hours:24});
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
    setSelectedWallet(current=>current&&nextWallets.rows.some(w=>w.id===current&&w.withdrawal_eligible)?current:(nextWallets.rows.find(w=>w.withdrawal_eligible&&w.is_default)||nextWallets.rows.find(w=>w.withdrawal_eligible))?.id||'');
  }).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[revision]);

  async function run(task:()=>Promise<unknown>,message:string){
    setBusy(true);setError('');setNotice('');
    try{const result=await task();setNotice(message);refresh();return result}catch(e){setError((e as Error).message);return null}finally{setBusy(false)}
  }

  function linkWallet(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const element=event.currentTarget,form=new FormData(element);
    void run(()=>call('save_my_e_wallet',{p_provider:provider,p_account_title:String(form.get('account_title')||''),p_account_number:String(form.get('account_number')||'')}),'E-wallet saved for mock ownership verification.').then(result=>{if(result!==null)element.reset()});
  }
  function configurePin(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const element=event.currentTarget,form=new FormData(element),next=String(form.get('new_pin')||''),confirm=String(form.get('confirm_pin')||'');
    if(next!==confirm){setError('New transaction PIN and confirmation do not match.');return}
    void run(async()=>{
      const result=await call('configure_withdrawal_pin_secure',{p_current:String(form.get('current_pin')||'')||null,p_new:next}) as PinResult;
      if(!result.ok){
        if(result.code==='pin_locked')throw Error(`Transaction PIN is temporarily locked${result.locked_until?` until ${when(result.locked_until)}`:''}.`);
        throw Error(`Current transaction PIN is incorrect. ${result.attempts_remaining} attempt${result.attempts_remaining===1?'':'s'} remaining.`);
      }
      return result;
    },security?.pin_configured?'Transaction PIN changed.':'Transaction PIN configured.').then(result=>{if(result!==null)element.reset()});
  }
  function requestWithdrawal(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const element=event.currentTarget,form=new FormData(element),amount=Number(form.get('amount'));
    if(!selectedWallet){setError('Choose a withdrawal-eligible JazzCash or Easypaisa wallet.');return}
    void run(async()=>{
      const result=await call('request_e_wallet_withdrawal',{p_wallet:selectedWallet,p_amount:amount,p_pin:String(form.get('pin')||''),p_request:crypto.randomUUID()});
      if(result===null){
        const state=await call('my_withdrawal_security',{}) as Security;setSecurity(state);
        if(state.locked_until)throw Error(`Transaction PIN is temporarily locked until ${when(state.locked_until)}.`);
        throw Error(`Transaction PIN is incorrect. ${state.attempts_remaining} attempt${state.attempts_remaining===1?'':'s'} remaining.`);
      }
      return result;
    },'Withdrawal request created and approved earnings reserved for processing.').then(result=>{if(result!==null)element.reset()});
  }

  const verified=useMemo(()=>wallets.rows.filter(w=>w.status==='verified'),[wallets.rows]);
  const eligible=useMemo(()=>verified.filter(w=>w.withdrawal_eligible),[verified]);
  const canAddJazzCash=!wallets.rows.some(w=>w.provider==='jazzcash'&&w.status!=='rejected');
  const canAddEasypaisa=!wallets.rows.some(w=>w.provider==='easypaisa'&&w.status!=='rejected');
  const pinLocked=Boolean(security?.locked_until&&new Date(security.locked_until).getTime()>Date.now());

  useEffect(()=>{
    if(provider==='jazzcash'&&!canAddJazzCash&&canAddEasypaisa)setProvider('easypaisa');
    else if(provider==='easypaisa'&&!canAddEasypaisa&&canAddJazzCash)setProvider('jazzcash');
  },[provider,canAddJazzCash,canAddEasypaisa]);

  if(loading&&!summary)return <p role="status">Loading e-wallets and withdrawal balance…</p>;
  return <section className="ewallet-workspace">
    <div className="panel-title"><div><span className="eyebrow">PAYOUT METHODS</span><h2>JazzCash & Easypaisa</h2></div><Badge value="manual + mock"/></div>
    <div className="notice"><strong>Current provider mode:</strong> wallet ownership verification is still simulated until live provider APIs are connected. FieldLance Finance can process approved withdrawals manually through JazzCash/Easypaisa and record the external transaction reference, while the mock sandbox remains available for development testing.</div>
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
        <p>{wallet.is_default?'Default payout wallet · ':''}{wallet.status==='verified'?'Mock ownership check passed by FieldLance Admin.':'Awaiting or failed mock ownership verification.'}</p>
        {wallet.status==='verified'&&!wallet.withdrawal_eligible&&wallet.withdrawal_eligible_at&&<p className="notice">Security hold active. Withdrawal eligibility begins after {when(wallet.withdrawal_eligible_at)}. The mock admin sandbox can bypass this hold only for development testing.</p>}
        {wallet.withdrawal_eligible&&<p className="notice success">Eligible for withdrawal.</p>}
        <div className="actions">
          {wallet.status==='verified'&&!wallet.is_default&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('set_default_e_wallet',{p_wallet:wallet.id}),'Default e-wallet updated.')}>Make default</button>}
          {wallet.status!=='suspended'&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('unlink_my_e_wallet',{p_wallet:wallet.id}),'E-wallet unlinked.')}>Unlink</button>}
        </div>
      </article>)}</div>
      {(canAddJazzCash||canAddEasypaisa)&&<form onSubmit={linkWallet}><fieldset disabled={busy}><legend>Link e-wallet</legend><div className="form-grid">
        <label className="field">E-wallet type<select value={provider} onChange={e=>setProvider(e.target.value as 'jazzcash'|'easypaisa')}><option value="jazzcash" disabled={!canAddJazzCash}>JazzCash</option><option value="easypaisa" disabled={!canAddEasypaisa}>Easypaisa</option></select></label>
        <label className="field">Full name of payee<input name="account_title" required minLength={2} maxLength={120} autoComplete="name"/></label>
        <label className="field">Wallet mobile number<input name="account_number" required inputMode="tel" placeholder="03XXXXXXXXX" autoComplete="tel"/></label>
      </div><p>The account title should match your FieldLance account name. Mock verification checks only that name match; it does not prove ownership of the live wallet number. A verified wallet enters a {wallets.activation_hold_hours}-hour withdrawal security hold.</p><button className="primary">Save e-wallet</button></fieldset></form>}
    </section>

    <section className="panel detail"><h3>Transaction PIN</h3><p>A 6-digit transaction PIN protects withdrawal requests. The PIN is hashed server-side and never returned to the browser. Five failed checks temporarily lock PIN-protected actions for 15 minutes.</p>
      {security&&!security.crypto_ready&&<p className="notice error">Secure PIN hashing is unavailable in this database. Do not enable withdrawals until the database cryptographic extension is available.</p>}
      {pinLocked&&<p className="notice error">Transaction PIN is temporarily locked until {when(security?.locked_until||null)}.</p>}
      {security?.pin_configured&&!pinLocked&&security.failed_attempts>0&&<p className="notice">{security.attempts_remaining} PIN attempt{security.attempts_remaining===1?'':'s'} remaining before temporary lock.</p>}
      <form onSubmit={configurePin}><fieldset disabled={busy||!security?.crypto_ready||pinLocked}><div className="form-grid">
        {security?.pin_configured&&<label className="field">Current PIN<input name="current_pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="current-password"/></label>}
        <label className="field">{security?.pin_configured?'New PIN':'Set transaction PIN'}<input name="new_pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="new-password"/></label>
        <label className="field">Confirm PIN<input name="confirm_pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="new-password"/></label>
      </div><button className="secondary">{security?.pin_configured?'Change PIN':'Set transaction PIN'}</button></fieldset></form>
    </section>

    <section className="panel detail"><h3>Request withdrawal</h3>
      <form onSubmit={requestWithdrawal}><fieldset disabled={busy||!security?.pin_configured||pinLocked||!eligible.length||Number(summary?.available||0)<100}><div className="form-grid">
        <label className="field">Withdraw to<select value={selectedWallet} onChange={e=>setSelectedWallet(e.target.value)} required><option value="">Choose eligible verified wallet</option>{eligible.map(w=><option value={w.id} key={w.id}>{providerLabel(w.provider)} · {w.account_masked}{w.is_default?' · Default':''}</option>)}</select></label>
        <label className="field">Amount (PKR)<input name="amount" type="number" min="100" step="0.01" max={summary?.available||undefined} required placeholder="100.00"/></label>
        <label className="field">Transaction PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="current-password"/></label>
      </div><button className="primary">Request withdrawal</button></fieldset></form>
      {!verified.length&&<p className="notice">Verify at least one JazzCash or Easypaisa wallet before requesting a withdrawal.</p>}
      {!!verified.length&&!eligible.length&&<p className="notice">Your verified wallet is still inside the security activation hold. It becomes selectable after the hold ends.</p>}
    </section>

    <section className="panel detail"><h3>Withdrawal history</h3>{!withdrawals.length&&<EmptyState>No withdrawal requests yet.</EmptyState>}
      {withdrawals.map(w=><article className="document-row" key={w.id}><div className="panel-title"><div><strong>PKR {money(w.amount)} · {providerLabel(w.provider)} {w.account_masked_snapshot}</strong><p>{new Date(w.requested_at).toLocaleString()} · {w.allocation_count} payable allocation{w.allocation_count===1?'':'s'}</p></div><Badge value={w.status}/></div>
        <p>FieldLance reference: {w.provider_reference} · Processing mode: {w.provider_mode==='manual'?'Manual provider settlement':'Mock sandbox'}.</p>{w.settlement_reference&&<p>Provider settlement reference: <strong>{w.settlement_reference}</strong></p>}{w.reversal_reference&&<p>Provider reversal reference: <strong>{w.reversal_reference}</strong></p>}{w.failure_message&&<p className="notice error">{w.failure_message}</p>}
        <div className="actions">{w.status==='requested'&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>call('cancel_my_e_wallet_withdrawal',{p_withdrawal:w.id,p_version:w.version}),'Withdrawal cancelled and reserved earnings released.')}>Cancel request</button>}</div>
        {['requested','approved','processing'].includes(w.status)&&<p className="notice">FieldLance Finance/Admin controls approval and provider settlement. You cannot mark your own withdrawal paid.</p>}
      </article>)}
    </section>
  </section>;
}
