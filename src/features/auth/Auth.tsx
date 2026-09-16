import {PoemBrand} from "../../components/ui/PoemBrand";
import {rememberFieldOwner} from '../surveys/offlineSurveyStore';
import {APP_VERSION} from '../../app/version';
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  Building2,
  CheckCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "../../lib/supabase/client";
import { Field } from "../../shared/ui/FormFields";
import {
  readWorkspaceEntryIntent,
  rememberWorkspaceEntryIntent,
  type WorkspaceEntryIntent,
} from "./entryIntent";

const entryCopy: Record<WorkspaceEntryIntent, { label: string; heading: string; button: string }> = {
  volunteer: {
    label: "Volunteer",
    heading: "Sign in to your volunteer workspace",
    button: "Sign in as volunteer",
  },
  ngo: {
    label: "Partner NGO",
    heading: "Sign in as a Partner NGO",
    button: "Sign in as Partner NGO",
  },
  poem: {
    label: "POEM staff",
    heading: "Sign in to POEM administration",
    button: "Sign in as POEM staff",
  },
};

export function Auth({
  session,
  recovery,
  error: initialError,
  done,
}: {
  session: Session | null;
  recovery: boolean;
  error: string;
  done: () => void;
}) {
  const [mode, setMode] = useState(recovery ? "reset" : "login"),
    [entry, setEntry] = useState<WorkspaceEntryIntent>(() => readWorkspaceEntryIntent() || "volunteer"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(initialError);
  useEffect(() => {
    if (recovery) setMode("reset");
  }, [recovery]);

  function chooseEntry(next: WorkspaceEntryIntent) {
    setEntry(next);
    setError("");
    setMessage("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email") || ""),
      password = String(f.get("password") || "");
    try {
      if (mode === "login") {
        // Store the intended destination before Supabase emits SIGNED_IN; the app may
        // switch from Auth to Workspace as soon as that event fires.
        rememberWorkspaceEntryIntent(entry);
        const r = await db!.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        rememberFieldOwner(r.data.user.id);window.dispatchEvent(new Event("poem:field-unlocked"));
      }
      if (mode === "signup") {
        const signupEntry = entry === "poem" ? "volunteer" : entry;
        rememberWorkspaceEntryIntent(signupEntry);
        const r = await db!.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: String(f.get("full_name")) },
            emailRedirectTo: location.origin + "/auth/callback",
          },
        });
        if (r.error) throw r.error;
        setMessage(
          signupEntry === "ngo"
            ? "Representative account created. Confirm your email, then sign in as Partner NGO to continue the application."
            : "Account created. Check your email to confirm your address, then sign in.",
        );
      }
      if (mode === "forgot") {
        const r = await db!.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/reset",
        });
        if (r.error) throw r.error;
        setMessage(
          "If this email is registered, a reset link will arrive shortly.",
        );
      }
      if (mode === "reset") {
        if (!session)
          throw Error("Open the latest reset link from your email.");
        if (password !== f.get("confirm"))
          throw Error("Passwords do not match.");
        const r = await db!.auth.updateUser({ password });
        if (r.error) throw r.error;
        done();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const signupEntry = entry === "poem" ? "volunteer" : entry;
  const heading = mode === "signup"
    ? signupEntry === "ngo" ? "Create an NGO representative account" : "Join the volunteer network"
    : mode === "forgot"
      ? "Reset your password"
      : mode === "reset"
        ? "Choose a new password"
        : entryCopy[entry].heading;

  return (
    <div className="auth-shell">
      <section className="auth-story">
        <PoemBrand />
        <span className="eyebrow">PEOPLE. PURPOSE. IMPACT.</span>
        <h1>
          Local people.
          <br />
          Lasting possibilities.
        </h1>
        <p>
          Bring your skills, experience and commitment to a network that puts
          communities first.
        </p>
        <div className="auth-points">
          {entry === "ngo" ? <>
            <span><Building2 />Your approved NGO workspace</span>
            <span><CheckCircle />Self-service Partner NGO application</span>
            <span><ShieldCheck />POEM-reviewed organization access</span>
          </> : <>
            <span><UserRound />Your own volunteer profile</span>
            <span><CheckCircle />POEM-verified work history</span>
            <span><ShieldCheck />Application-scoped NGO recruitment</span>
          </>}
        </div>
        <small>POEM Network · POEM {APP_VERSION}</small>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <div className="mobile-auth-brand"><PoemBrand /></div>
          <span className="eyebrow">WELCOME TO POEM</span>
          {!recovery && mode !== "forgot" && (
            <div className="auth-entry-tabs" role="group" aria-label="Choose POEM workspace">
              {(Object.keys(entryCopy) as WorkspaceEntryIntent[]).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={entry === value ? "active" : ""}
                  aria-pressed={entry === value}
                  onClick={() => chooseEntry(value)}
                >
                  {entryCopy[value].label}
                </button>
              ))}
            </div>
          )}
          <h2>{heading}</h2>
          <p>
            {mode === "signup"
              ? signupEntry === "ngo"
                ? "Create your personal representative account first. After sign-in, complete the Partner NGO application for POEM approval."
                : "Create your personal POEM account. You can complete your CV-style volunteer profile after signing in."
              : mode === "login" && entry === "ngo"
                ? "Use your personal POEM credentials. Approved representatives go straight to an NGO workspace; new representatives continue the Partner NGO application."
                : mode === "login" && entry === "poem"
                  ? "Use the POEM account that has been granted platform staff access."
                  : "Use your POEM account to continue."}
          </p>
          {error && <div role="alert" className="notice error">{error}</div>}
          {message && <div role="status" className="notice success">{message}</div>}
          <form onSubmit={submit}>
            {mode === "signup" && (
              <Field label="Full name">
                <input name="full_name" required minLength={2} maxLength={200} autoComplete="name" />
              </Field>
            )}
            {mode !== "reset" && (
              <Field label="Email address">
                <input name="email" type="email" required autoComplete="email" />
              </Field>
            )}
            {mode !== "forgot" && (
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 12}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                {mode !== "login" && <small>At least 12 characters.</small>}
              </Field>
            )}
            {mode === "reset" && (
              <Field label="Confirm password">
                <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
              </Field>
            )}
            <button className="primary wide" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? signupEntry === "ngo" ? "Create representative account" : "Create volunteer account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "reset"
                      ? "Update password"
                      : entryCopy[entry].button}
              <ArrowRight size={16} />
            </button>
          </form>
          {mode === "login" ? (
            <>
              <button className="link" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>
                Forgot password?
              </button>
              {entry !== "poem" && (
                <div className="auth-bottom">
                  New to POEM?{" "}
                  <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>
                    {entry === "ngo" ? "Create representative account" : "Create volunteer account"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <button className="link" onClick={() => { setMode("login"); setError(""); setMessage(""); if (recovery) done(); }}>
              Back to sign in
            </button>
          )}
          <p className="fine">
            One personal POEM account can open different authorized workspaces. Choosing Partner NGO changes the destination after sign-in; it does not create a shared organization password. NGO access is activated only through an approved organization membership.
          </p>
        </div>
      </section>
    </div>
  );
}
