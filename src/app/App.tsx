import type { Session } from "@supabase/supabase-js";
import { HeartHandshake } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Auth } from "../features/auth/Auth";
import { configured, db } from "../lib/supabase/client";
import {flushActiveDraft} from "../features/surveys/activeDraft";
const OfflineFieldWorkspace=lazy(()=>import("../features/surveys/OfflineFieldWorkspace").then(m=>({default:m.OfflineFieldWorkspace})));
import {offlineOwner,rememberFieldOwner,lockFieldDevice} from "../features/surveys/offlineSurveyStore";
import {CertificateVerification} from "../features/workforce/ReputationCertificates";
import { Workspace } from "./AppShell";
import {parseAppRoute} from "./routes";
import {canUseRecoveryForm,clearRecoveryUser,recoveryRedirectError,recoveryUserId,rememberRecoveryUser} from "../features/auth/recoverySession";
import { reportDiagnostic, userFacingError } from "../lib/observability";
export function App() {
  const [connection,setConnection]=useState(navigator.onLine);
  const [field,setField]=useState(!navigator.onLine),[cachedOwner,setCachedOwner]=useState(offlineOwner());
  useEffect(()=>{const online=()=>setConnection(true),offline=()=>{setConnection(false);setCachedOwner(offlineOwner())},locked=()=>{setCachedOwner(offlineOwner());if(!offlineOwner())setField(false)};window.addEventListener("online",online);window.addEventListener("offline",offline);window.addEventListener("poem:field-unlocked",locked);window.addEventListener("storage",locked);window.addEventListener("poem:field-locked",locked);return()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline);window.removeEventListener("poem:field-unlocked",locked);window.removeEventListener("storage",locked);window.removeEventListener("poem:field-locked",locked)}},[]);
  const initialRoute=parseAppRoute(), recoveryRequested=initialRoute.kind==="reset";
  const initialRedirectError=recoveryRequested||initialRoute.kind==="auth_callback"?recoveryRedirectError():"";
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [recoveryUser, setRecoveryUser] = useState<string | null>(()=>recoveryRequested?recoveryUserId():null),
    [error, setError] = useState(initialRedirectError);
  const authEventSeen=useRef(false);
  const recovery=canUseRecoveryForm(recoveryRequested,session?.user.id||null,recoveryUser);
  useEffect(()=>{
    const route=parseAppRoute();
    if(route.kind==="unknown")reportDiagnostic("routing",new Error("Unknown application route"),{operation:"parse_route",routeKind:"unknown",online:navigator.onLine});
    if(initialRedirectError)reportDiagnostic("auth",new Error(initialRedirectError),{operation:"auth_redirect",routeKind:route.kind,online:navigator.onLine});
  },[initialRedirectError]);
  useEffect(() => {
    if (!recoveryRequested) { clearRecoveryUser(); setRecoveryUser(null); }
    else if(initialRedirectError) history.replaceState({},"","/reset");
    if (!db) {
      setReady(true);
      return;
    }
    if(!connection&&offlineOwner()){setReady(true);return;}
    let alive = true;
    authEventSeen.current=false;
    const { data } = db.auth.onAuthStateChange((event, s) => {
      if(!alive)return;
      authEventSeen.current=true;
      const route=parseAppRoute();
      if(event==="PASSWORD_RECOVERY"&&s&&route.kind==="reset"){rememberRecoveryUser(s.user.id);setRecoveryUser(s.user.id);setError("");history.replaceState({},"","/reset")}
      if(route.kind==="auth_callback"&&(s||event==="INITIAL_SESSION")){history.replaceState({},"","/")}
      setSession(s);
      if(event==="SIGNED_OUT"){clearRecoveryUser();setRecoveryUser(null);lockFieldDevice();setCachedOwner(null);setField(false)}
      else if(s&&navigator.onLine&&localStorage.getItem("poem-field-locked")!=="yes"){rememberFieldOwner(s.user.id);setCachedOwner(s.user.id)}
      setReady(true);
    });
    db.auth
      .getSession()
      .then(({ data: current, error: sessionError }) => {
        if (!alive) return;
        if(!authEventSeen.current)setSession(current.session);
        if(current.session&&recoveryRequested&&recoveryUserId()===current.session.user.id)setRecoveryUser(current.session.user.id);
        if(current.session&&parseAppRoute().kind==="auth_callback")history.replaceState({},"","/");
        if(current.session&&navigator.onLine&&localStorage.getItem("poem-field-locked")!=="yes"){rememberFieldOwner(current.session.user.id);setCachedOwner(current.session.user.id)}
        setReady(true);
        if (sessionError) {
          reportDiagnostic("auth", sessionError, { operation: "restore_session", phase: "getSession", online: navigator.onLine });
          setError(userFacingError(sessionError, "Your session could not be restored. Check your connection and sign in again."));
        }
      })
      .catch((e) => {
        if (alive) {
          reportDiagnostic("auth", e, { operation: "restore_session", phase: "getSession_rejected", online: navigator.onLine });
          setError(userFacingError(e, "Your session could not be restored. Check your connection and sign in again."));
          setReady(true);
        }
      });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [connection,recoveryRequested,initialRedirectError]);
  if (!configured)
    return (
      <div className="setup">
        <HeartHandshake size={42} />
        <h1>Connect your FieldLance workspace</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and enter
          your Supabase URL and public key, then restart the development server.
        </p>
        <p>
          For local Supabase, run <code>npm run env:local</code> after starting
          Supabase.
        </p>
      </div>
    );
  const publicRoute=parseAppRoute(),legacyCertificate=new URLSearchParams(location.search).get('certificate');
  if(publicRoute.kind==='verify'||legacyCertificate)return <CertificateVerification initialCode={publicRoute.kind==='verify'?publicRoute.entityId||'':legacyCertificate||''}/>;
  if(!connection&&!cachedOwner&&!recoveryRequested)return <main className="panel"><h1>Field device locked</h1><p>Connect and sign in as the owner to reopen downloaded data. Device copies have not been deleted.</p></main>;
  if(field&&cachedOwner&&!recoveryRequested&&parseAppRoute().kind==="unknown")return <main className="panel"><h1>Page not found</h1><p>This address is invalid. Your downloaded data is unchanged.</p><a href="/app/field">Open downloaded field workspace</a></main>;
  if(field&&cachedOwner&&!recoveryRequested)return <Suspense fallback={<p>Opening downloaded field workspace…</p>}><OfflineFieldWorkspace key={cachedOwner} ownerId={cachedOwner} initialView={parseAppRoute().page==="My Attendance"||parseAppRoute().page==="My Timesheets"?"attendance":"surveys"} initialAssignmentId={parseAppRoute().entityKind==="assignment"?parseAppRoute().entityId:null} initialSessionId={parseAppRoute().entityKind==="attendance_session"?parseAppRoute().entityId:null} back={()=>setField(false)}/></Suspense>;
  if (!ready)
    return (
      <div className="setup" role="status">
        Opening FieldLance…
      </div>
    );
  return session && !recoveryRequested && localStorage.getItem("poem-field-locked")!=="yes" ? (
    <Workspace key={session.user.id} session={session} openField={()=>{void flushActiveDraft().then(()=>setField(true)).catch(e=>{reportDiagnostic("offline",e,{operation:"protect_active_draft",phase:"open_field",online:navigator.onLine});window.alert("FieldLance could not protect the current device draft. Please retry before opening Offline field.")})}} />
  ) : (
    <Auth
      session={session}
      recovery={recovery}
      recoveryRequested={recoveryRequested}
      error={error || (recoveryRequested&&!recovery&&ready ? "This password reset link is invalid or has expired. Request a new reset link." : "")}
      done={() => {
        clearRecoveryUser();
        setRecoveryUser(null);
        history.replaceState({}, "", "/");
      }}
    />
  );
}
export default App;
