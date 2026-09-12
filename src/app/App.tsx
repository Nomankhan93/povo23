import type { Session } from "@supabase/supabase-js";
import { HeartHandshake } from "lucide-react";
import { useEffect, useState } from "react";
import { Auth } from "../features/auth/Auth";
import { configured, db } from "../lib/supabase/client";
import { Workspace } from "./AppShell";
export function App() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [recovery, setRecovery] = useState(location.pathname === "/reset"),
    [error, setError] = useState("");
  useEffect(() => {
    if (!db) {
      setReady(true);
      return;
    }
    let alive = true;
    db.auth
      .getSession()
      .then(({ data, error }) => {
        if (alive) {
          setSession(data.session);
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
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (!configured)
    return (
      <div className="setup">
        <HeartHandshake size={42} />
        <h1>Connect your POEM workspace</h1>
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
  if (!ready)
    return (
      <div className="setup" role="status">
        Opening POEM…
      </div>
    );
  return session && !recovery ? (
    <Workspace session={session} />
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
