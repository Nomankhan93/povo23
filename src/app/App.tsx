import type { Session } from "@supabase/supabase-js";
import { HeartHandshake } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Auth } from "../features/auth/Auth";
import { configured, db } from "../lib/supabase/client";
import {flushActiveDraft} from "../features/surveys/activeDraft";
const OfflineFieldWorkspace=lazy(()=>import("../features/surveys/OfflineFieldWorkspace").then(m=>({default:m.OfflineFieldWorkspace})));
import {offlineOwner,rememberFieldOwner,lockFieldDevice} from "../features/surveys/offlineSurveyStore";
import { Workspace } from "./AppShell";
export function App() {
  const [connection,setConnection]=useState(navigator.onLine);
  const [field,setField]=useState(!navigator.onLine),[cachedOwner,setCachedOwner]=useState(offlineOwner());
  useEffect(()=>{const online=()=>setConnection(true),offline=()=>{setConnection(false);setCachedOwner(offlineOwner())},locked=()=>{setCachedOwner(offlineOwner());if(!offlineOwner())setField(false)};window.addEventListener("online",online);window.addEventListener("offline",offline);window.addEventListener("poem:field-unlocked",locked);window.addEventListener("storage",locked);window.addEventListener("poem:field-locked",locked);return()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline);window.removeEventListener("poem:field-unlocked",locked);window.removeEventListener("storage",locked);window.removeEventListener("poem:field-locked",locked)}},[]);
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [recovery, setRecovery] = useState(location.pathname === "/reset"),
    [error, setError] = useState("");
  useEffect(() => {
    if (!db) {
      setReady(true);
      return;
    }
    if(!connection&&offlineOwner()){setReady(true);return;}
    let alive = true;
    db.auth
      .getSession()
      .then(({ data, error }) => {
        if (alive) {
          setSession(data.session);
          if(data.session&&navigator.onLine&&localStorage.getItem("poem-field-locked")!=="yes"){rememberFieldOwner(data.session.user.id);setCachedOwner(data.session.user.id)}
          setReady(true);
          if (error) setError(error.message);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setReady(true);
        }
      });
    const { data } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if(event==="SIGNED_OUT"){lockFieldDevice();setCachedOwner(null);setField(false)}
      else if(s&&navigator.onLine&&localStorage.getItem("poem-field-locked")!=="yes"){rememberFieldOwner(s.user.id);setCachedOwner(s.user.id)}
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [connection]);
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
  if(field&&cachedOwner&&!recovery)return <Suspense fallback={<p>Opening downloaded field workspace…</p>}><OfflineFieldWorkspace key={cachedOwner} ownerId={cachedOwner} back={()=>setField(false)}/></Suspense>;
  if (!ready)
    return (
      <div className="setup" role="status">
        Opening FieldLance…
      </div>
    );
  return session && !recovery && localStorage.getItem("poem-field-locked")!=="yes" ? (
    <Workspace key={session.user.id} session={session} openField={()=>{void flushActiveDraft().then(()=>setField(true)).catch(e=>window.alert("Could not protect device draft: "+e.message))}} />
  ) : (
    <Auth
      session={session}
      recovery={recovery}
      error={error}
      done={() => {
        setRecovery(false);
        history.replaceState({}, "", "/");
      }}
    />
  );
}
export default App;
