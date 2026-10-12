import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Button,ConfirmDialog,StatusBadge} from '../../components/ui/FieldLanceUI';
import {
  attentionSurveyCopies,inspectAttentionSurvey,recoverAttentionSurvey,retryAttentionSurvey,discardAttentionSurvey,
  surveyQueueSummary,
  syncSurveyQueue,
  type SurveyQueueSummary,
} from './offlineSurveyStore';
import styles from './SurveySyncStatus.module.css';

const empty:SurveyQueueSummary={pending:0,attention:0,total:0};

export function SurveySyncStatus({userId}:{userId:string}){
  const [summary,setSummary]=useState<SurveyQueueSummary>(empty),[online,setOnline]=useState(navigator.onLine),[syncing,setSyncing]=useState(false),[error,setError]=useState('');
  const [copies,setCopies]=useState<Awaited<ReturnType<typeof attentionSurveyCopies>>>([]),[preview,setPreview]=useState<Record<string,string>>({}),[notice,setNotice]=useState(''),[discardId,setDiscardId]=useState<string|null>(null);
  const syncingRef=useRef(false);

  const refresh=useCallback(async()=>{
    try{setSummary(await surveyQueueSummary(userId));setCopies(await attentionSurveyCopies(userId));setError('');}
    catch(e){setError((e as Error).message);}
  },[userId]);

  const sync=useCallback(async(force=false)=>{
    if(!navigator.onLine||syncingRef.current)return;
    syncingRef.current=true;setSyncing(true);
    try{setSummary(await syncSurveyQueue(userId,force));setError('');}
    catch(e){setError((e as Error).message);}
    finally{syncingRef.current=false;setSyncing(false);}
  },[userId]);

  useEffect(()=>{
    setCopies([]);setPreview({});setNotice('');setDiscardId(null);void refresh();
    const queue=()=>void refresh();
    const onOnline=()=>{setOnline(true);void sync();};
    const onOffline=()=>setOnline(false);
    window.addEventListener('poem:survey-queue-change',queue);window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);
    const timer=window.setInterval(()=>{if(navigator.onLine)void sync();},30000);
    if(navigator.onLine)void sync();
    return()=>{window.removeEventListener('poem:survey-queue-change',queue);window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);window.clearInterval(timer);};
  },[refresh,sync]);

  const label=!online?summary.total?`Offline · ${summary.total} on device`:'Offline':summary.attention?`${summary.attention} survey${summary.attention===1?'':'s'} need attention`:summary.pending?`${summary.pending} waiting to sync`:'Survey sync ready';
  const tone=!online?'warning':summary.attention?'danger':summary.pending?'warning':'success';

  return <>
    <details className={`survey-sync ${styles.syncPanel}`}>
      <summary aria-label={syncing?'Syncing surveys…':label}><span className="sync-full">{syncing?'Syncing surveys…':label}</span><span className="sync-compact" aria-hidden="true">{!online?'Offline'+(summary.total?' · '+summary.total:''):summary.attention?'Attention · '+summary.attention:syncing?'Syncing…':summary.pending?'Pending · '+summary.pending:'Synced'}</span></summary>
      <div className={styles.syncBody}>
        <div className={styles.syncHeading}><div><strong>{online?'Field sync':'Working offline'}</strong><p>{summary.pending} queued · {summary.attention} need attention. Survey payloads in the device queue are encrypted.</p></div><div className={styles.syncActions}><StatusBadge tone={tone}>{!online?'Offline':summary.attention?'Attention':summary.pending?'Pending':'Synced'}</StatusBadge><Button type="button" disabled={!online||syncing||!summary.pending} onClick={()=>void sync(true)}>{syncing?'Syncing…':'Sync now'}</Button></div></div>
        {error&&<Alert tone="danger" title="Survey sync needs attention">{error}</Alert>}
        {notice&&<Alert tone="success" title="Recovery copy prepared">{notice}</Alert>}
        <div className={styles.copyList}>{copies.map(copy=><article key={copy.id} className={styles.copyCard}>
          <div className={styles.copyHeading}><div><strong>Project {copy.projectId}</strong><p>{copy.responseId?`Response ${copy.responseId}`:'New survey'} · {new Date(copy.createdAt).toLocaleString()}</p></div><StatusBadge tone="danger">Needs attention</StatusBadge></div>
          <p>{copy.error}</p>
          {copy.recoveredAt&&<Alert tone="info" title="Recovered for editing">Review the saved draft; original retry is disabled.</Alert>}
          <div className={styles.copyActions}><Button type="button" disabled={syncing} onClick={()=>{void inspectAttentionSurvey(userId,copy.id).then(args=>setPreview(p=>({...p,[copy.id]:JSON.stringify(args,null,2)}))).catch(e=>setError(e.message));}}>View saved answers</Button><Button type="button" disabled={syncing||Boolean(copy.recoveredAt)} onClick={()=>{void retryAttentionSurvey(userId,copy.id).then(refresh).catch(e=>setError(e.message));}}>Retry original request</Button>{copy.failureKind==='rejected'&&!copy.recoveredAt&&<Button type="button" disabled={syncing} onClick={()=>{void recoverAttentionSurvey(userId,copy.id).then(result=>setNotice(`Recovery draft saved. Close any open survey form, then open project ${result.projectId} and ${result.responseId?`response ${result.responseId}`:'Start survey'}. Review the recovered answers against the current record before saving. The failed copy remains here.`)).then(refresh).catch(e=>setError(e.message));}}>Recover for editing</Button>}<Button type="button" variant="danger" disabled={syncing} onClick={()=>setDiscardId(copy.id)}>Discard this copy</Button></div>
          {preview[copy.id]&&<pre className={styles.preview}>{preview[copy.id]}</pre>}
        </article>)}</div>
        <p className={styles.invariant}>Pending saves retain their original request ID. Only confirmed rejections can be recovered for editing. Recovery never overwrites an existing draft.</p>
      </div>
    </details>
    <ConfirmDialog open={Boolean(discardId)} title="Discard failed device copy?" description="Permanently discard this failed encrypted device copy only after checking that its answers have been recovered or are no longer needed." confirmLabel="Discard device copy" danger busy={syncing} onCancel={()=>setDiscardId(null)} onConfirm={async()=>{const id=discardId;if(!id)return;await discardAttentionSurvey(userId,id);setDiscardId(null);setPreview(p=>{const next={...p};delete next[id];return next;});await refresh();}}/>
  </>;
}
