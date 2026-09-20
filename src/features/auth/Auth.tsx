import {FieldLanceBrand} from "../../components/ui/FieldLanceBrand";
import {rememberFieldOwner} from '../surveys/offlineSurveyStore';
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  Building2,
  CheckCircle,
  Eye,
  EyeOff,
  Info,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "../../lib/supabase/client";
import { Field } from "../../shared/ui/FormFields";
type WorkspaceEntryIntent = "volunteer" | "ngo";

type EntryCopy = {
  label: string;
  destination: string;
  storyHeading: string;
  storyBody: string;
};

const entryCopy: Record<WorkspaceEntryIntent, EntryCopy> = {
  volunteer: {
    label: "Field Worker",
    destination: "Continue to your Field Worker workspace.",
    storyHeading: "Find field work. Build experience. Earn.",
    storyBody: "Discover surveys, outreach, assessments, monitoring and data-collection assignments. Build verified experience while contributing to real community impact.",
  },
  ngo: {
    label: "Organization",
    destination: "Continue to your organization workspace or organization application.",
    storyHeading: "Build reliable field teams.",
    storyBody: "Connect with verified workers and volunteers for surveys, outreach, assessments, monitoring, data collection and other field assignments — all in one accountable workspace.",
  },

};

function PasswordInput({
  id,
  name,
  label,
  minLength,
  autoComplete,
  visible,
  onToggle,
  helper,
}: {
  id: string;
  name: string;
  label: string;
  minLength: number;
  autoComplete: string;
  visible: boolean;
  onToggle: () => void;
  helper?: string;
}) {
  return (
    <div className="field auth-password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {helper && <small>{helper}</small>}
    </div>
  );
}

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
    [entry, setEntry] = useState<WorkspaceEntryIntent>("volunteer"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(initialError),
    [showPassword, setShowPassword] = useState(false),
    [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (recovery) setMode("reset");
  }, [recovery]);

  function clearFeedback() {
    setError("");
    setMessage("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function chooseEntry(next: WorkspaceEntryIntent) {
    setEntry(next);
    clearFeedback();
  }

  function switchMode(next: "login" | "signup" | "forgot") {
    setMode(next);
    clearFeedback();
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
        const r = await db!.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        rememberFieldOwner(r.data.user.id);
        window.dispatchEvent(new Event("poem:field-unlocked"));
      }
      if (mode === "signup") {
        const signupEntry = entry;
        const r = await db!.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: String(f.get("full_name")), onboarding_intent: signupEntry === "ngo" ? "organization" : "worker" },
            emailRedirectTo: location.origin + "/auth/callback",
          },
        });
        if (r.error) throw r.error;
        setMessage(
          signupEntry === "ngo"
            ? "Account created. Confirm your email, then sign in to continue your organization application."
            : "Account created. Check your email to confirm your address, then sign in.",
        );
      }
      if (mode === "forgot") {
        const r = await db!.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/reset",
        });
        if (r.error) throw r.error;
        setMessage("If this email is registered, a reset link will arrive shortly.");
      }
      if (mode === "reset") {
        if (!session) throw Error("Open the latest reset link from your email.");
        if (password !== f.get("confirm")) throw Error("Passwords do not match.");
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

  const signupEntry = entry;
  const heading = mode === "signup"
    ? "Create your FieldLance account"
    : mode === "forgot"
      ? "Reset your password"
      : mode === "reset"
        ? "Choose a new password"
        : "Sign in to FieldLance";

  const description = mode === "signup"
    ? signupEntry === "ngo"
      ? "Create your FieldLance account, then continue the organization application after sign-in."
      : "Build your field worker profile and start accessing available opportunities."
    : mode === "forgot"
      ? "Enter your account email and we will send a secure reset link if it is registered."
      : mode === "reset"
        ? "Use at least 12 characters for your new password."
        : "Sign in to access your authorized workspaces.";

  const storyPoints = entry === "ngo"
    ? [
        [Building2, "Recruit and manage field teams"],
        [CheckCircle, "Run approved projects and opportunities"],
        [ShieldCheck, "FieldLance-governed organization access"],
      ] as const
    : [
          [UserRound, "Build your professional field worker profile"],
          [CheckCircle, "Keep FieldLance-verified work history"],
          [ShieldCheck, "Apply through scoped organization recruitment"],
        ] as const;

  return (
    <div className="auth-shell auth-shell-premium">
      <section className="auth-story" aria-label="FieldLance account benefits">
        <FieldLanceBrand variant="wordmark" />
        <div className="auth-story-main">
          <span className="eyebrow">FIELD OPPORTUNITIES • REAL EARNINGS • REAL IMPACT</span>
          <h1>{entryCopy[entry].storyHeading}</h1>
          <p>{entryCopy[entry].storyBody}</p>
          <div className="auth-points">
            {storyPoints.map(([Icon, text]) => (
              <span key={text}><Icon />{text}</span>
            ))}
          </div>
        </div>
        <small className="auth-story-footer">© {new Date().getFullYear()} FieldLance</small>
      </section>

      <section className="auth-form">
        <div className="auth-card">
          <div className="mobile-auth-brand"><FieldLanceBrand variant="compact" /></div>
          <span className="eyebrow">WELCOME TO FieldLance</span>

          {!recovery && mode === "signup" && (
            <div className="auth-entry-tabs" role="tablist" aria-label="Choose FieldLance workspace">
              {(Object.keys(entryCopy) as WorkspaceEntryIntent[]).map((value) => (
                <button
                  type="button"
                  role="tab"
                  key={value}
                  className={entry === value ? "active" : ""}
                  aria-selected={entry === value}
                  onClick={() => chooseEntry(value)}
                >
                  {entryCopy[value].label}
                </button>
              ))}
            </div>
          )}

          <h2>{heading}</h2>
          <p className="auth-description">{description}</p>

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
              <PasswordInput
                id="auth-password"
                name="password"
                label="Password"
                minLength={mode === "login" ? 1 : 12}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                helper={mode !== "login" ? "Use at least 12 characters." : undefined}
              />
            )}

            {mode === "reset" && (
              <PasswordInput
                id="auth-confirm-password"
                name="confirm"
                label="Confirm password"
                minLength={12}
                autoComplete="new-password"
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
              />
            )}

            {mode === "login" && (
              <div className="auth-inline-action">
                <button type="button" className="link" onClick={() => switchMode("forgot")}>
                  Forgot password?
                </button>
              </div>
            )}

            <button className="primary wide auth-primary-action" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "reset"
                      ? "Update password"
                      : "Sign in"}
              <ArrowRight size={16} />
            </button>
          </form>

          {mode === "login" ? (
            (
              <div className="auth-bottom">
                <span>{entry === "ngo" ? "Representing an organization?" : "New to FieldLance?"}</span>{" "}
                <button type="button" onClick={() => switchMode("signup")}>
                  Create an account
                </button>
              </div>
            )
          ) : (
            <button
              type="button"
              className="link auth-back-link"
              onClick={() => {
                switchMode("login");
                if (recovery) done();
              }}
            >
              Back to sign in
            </button>
          )}

          <div className="auth-account-note">
            <Info size={16} aria-hidden="true" />
            <span>One FieldLance account can access multiple authorized workspaces.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
