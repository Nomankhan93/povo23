import {PoemBrand} from "../../components/ui/PoemBrand";
import {rememberFieldOwner} from '../surveys/offlineSurveyStore';
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  BriefcaseBusiness,
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
import {
  readWorkspaceEntryIntent,
  rememberWorkspaceEntryIntent,
  type WorkspaceEntryIntent,
} from "./entryIntent";

type EntryCopy = {
  label: string;
  destination: string;
  storyHeading: string;
  storyBody: string;
};

const entryCopy: Record<WorkspaceEntryIntent, EntryCopy> = {
  volunteer: {
    label: "Volunteer",
    destination: "Continue to your Volunteer workspace.",
    storyHeading: "Build experience that matters.",
    storyBody: "Discover meaningful field opportunities, build a verified work history and grow your professional profile through real community work.",
  },
  ngo: {
    label: "Partner NGO",
    destination: "Continue to your Partner NGO workspace or application.",
    storyHeading: "Find trusted people for meaningful work.",
    storyBody: "Recruit volunteers, coordinate field delivery and manage organization work through one accountable operational workspace.",
  },
  poem: {
    label: "POEM staff",
    destination: "Continue to POEM Administration.",
    storyHeading: "Operate the network with clarity.",
    storyBody: "Review partners, govern access and monitor field operations across the POEM network from one trusted platform.",
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
    [entry, setEntry] = useState<WorkspaceEntryIntent>(() => readWorkspaceEntryIntent() || "volunteer"),
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
    if (mode === "signup" && next === "poem") setMode("login");
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
        // Store the intended destination before Supabase emits SIGNED_IN; the app may
        // switch from Auth to Workspace as soon as that event fires.
        rememberWorkspaceEntryIntent(entry);
        const r = await db!.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        rememberFieldOwner(r.data.user.id);
        window.dispatchEvent(new Event("poem:field-unlocked"));
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
            ? "Account created. Confirm your email, then sign in as Partner NGO to continue your organization application."
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

  const signupEntry = entry === "poem" ? "volunteer" : entry;
  const heading = mode === "signup"
    ? "Create your POEM account"
    : mode === "forgot"
      ? "Reset your password"
      : mode === "reset"
        ? "Choose a new password"
        : "Sign in to POEM";

  const description = mode === "signup"
    ? signupEntry === "ngo"
      ? "Create your personal POEM account, then continue the Partner NGO application after sign-in."
      : "Build your volunteer profile and start accessing available opportunities."
    : mode === "forgot"
      ? "Enter your account email and we will send a secure reset link if it is registered."
      : mode === "reset"
        ? "Use at least 12 characters for your new password."
        : entryCopy[entry].destination;

  const storyPoints = entry === "ngo"
    ? [
        [Building2, "Recruit and manage field teams"],
        [CheckCircle, "Run approved projects and opportunities"],
        [ShieldCheck, "POEM-governed organization access"],
      ] as const
    : entry === "poem"
      ? [
          [BriefcaseBusiness, "Operate partner and programme workflows"],
          [CheckCircle, "Review verification and governance queues"],
          [ShieldCheck, "Protect accountable access across the network"],
        ] as const
      : [
          [UserRound, "Build your professional volunteer profile"],
          [CheckCircle, "Keep POEM-verified work history"],
          [ShieldCheck, "Apply through scoped NGO recruitment"],
        ] as const;

  return (
    <div className="auth-shell auth-shell-premium">
      <section className="auth-story" aria-label="POEM account benefits">
        <PoemBrand compact />
        <div className="auth-story-main">
          <span className="eyebrow">PEOPLE • PURPOSE • IMPACT</span>
          <h1>{entryCopy[entry].storyHeading}</h1>
          <p>{entryCopy[entry].storyBody}</p>
          <div className="auth-points">
            {storyPoints.map(([Icon, text]) => (
              <span key={text}><Icon />{text}</span>
            ))}
          </div>
        </div>
        <small className="auth-story-footer">© {new Date().getFullYear()} POEM</small>
      </section>

      <section className="auth-form">
        <div className="auth-card">
          <div className="mobile-auth-brand"><PoemBrand compact /></div>
          <span className="eyebrow">WELCOME TO POEM</span>

          {!recovery && mode !== "forgot" && (
            <div className="auth-entry-tabs" role="tablist" aria-label="Choose POEM workspace">
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
            entry !== "poem" && (
              <div className="auth-bottom">
                <span>{entry === "ngo" ? "Representing an NGO?" : "New to POEM?"}</span>{" "}
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
            <span>One POEM account can access multiple authorized workspaces.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
