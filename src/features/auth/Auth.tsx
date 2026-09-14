import {PoemBrand} from "../../components/ui/PoemBrand";
import {rememberFieldOwner} from '../surveys/offlineSurveyStore';
import {APP_VERSION} from '../../app/version';
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  CheckCircle,
  HeartHandshake,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "../../lib/supabase/client";
import { Field } from "../../shared/ui/FormFields";
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
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(initialError);
  useEffect(() => {
    if (recovery) setMode("reset");
  }, [recovery]);
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
        const r = await db!.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        rememberFieldOwner(r.data.user.id);window.dispatchEvent(new Event("poem:field-unlocked"));
      }
      if (mode === "signup") {
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
          "Account created. Check your email to confirm your address, then sign in.",
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
          <span>
            <CheckCircle />
            Your own volunteer profile
          </span>
          <span>
            <ShieldCheck />
            POEM-reviewed information
          </span>
          <span>
            <Users />
            NGO access you control
          </span>
        </div>
        <small>Volunteer Network · POEM {APP_VERSION}</small>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <div className="mobile-auth-brand"><PoemBrand /></div>
          <span className="eyebrow">WELCOME TO POEM</span>
          <h2>
            {mode === "signup"
              ? "Join the volunteer network"
              : mode === "forgot"
                ? "Reset your password"
                : mode === "reset"
                  ? "Choose a new password"
                  : "Sign in to your workspace"}
          </h2>
          <p>
            {mode === "signup"
              ? "Create your account. You can complete your CV-style profile after signing in."
              : "Use your POEM account to continue."}
          </p>
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="notice success">
              {message}
            </div>
          )}
          <form onSubmit={submit}>
            {mode === "signup" && (
              <Field label="Full name">
                <input
                  name="full_name"
                  required
                  minLength={2}
                  maxLength={200}
                  autoComplete="name"
                />
              </Field>
            )}
            {mode !== "reset" && (
              <Field label="Email address">
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </Field>
            )}
            {mode !== "forgot" && (
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 12}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                {mode !== "login" && <small>At least 12 characters.</small>}
              </Field>
            )}
            {mode === "reset" && (
              <Field label="Confirm password">
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </Field>
            )}
            <button className="primary wide" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create volunteer account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "reset"
                      ? "Update password"
                      : "Sign in"}
              <ArrowRight size={16} />
            </button>
          </form>
          {mode === "login" ? (
            <>
              <button
                className="link"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setMessage("");
                }}
              >
                Forgot password?
              </button>
              <div className="auth-bottom">
                New to POEM?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setMessage("");
                  }}
                >
                  Create an account
                </button>
              </div>
            </>
          ) : (
            <button
              className="link"
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
                if (recovery) done();
              }}
            >
              Back to sign in
            </button>
          )}
          <p className="fine">
            Volunteer signup does not grant admin access. Your volunteer profile can be published directly;
            private documents and work-experience confirmations are reviewed separately.
          </p>
        </div>
      </section>
    </div>
  );
}
