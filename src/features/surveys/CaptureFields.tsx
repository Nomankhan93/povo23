import { useEffect, useState } from "react";
import type { Json } from "../../lib/supabase/database.types";
import { db, rpc } from "../../lib/supabase/client";
import { Button, Field, StatusBadge } from "../../components/ui/FieldLanceUI";
import type { Question } from "./model";
import { stageAttachment, type LocalAttachment } from "./fieldAttachments";
import { fieldRecords } from "./offlineSurveyStore";
import styles from "./CaptureFields.module.css";

export function AttachmentView({ id }: { id: string }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  useEffect(() => {
    if (!link) return;
    const timer = window.setTimeout(() => setLink(""), 55000);
    return () => window.clearTimeout(timer);
  }, [link]);
  async function view() {
    setBusy(true);
    setError("");
    try {
      const path = await rpc("authorize_survey_capture_view", { p_id: id });
      const r = await db!.storage.from("survey-capture").createSignedUrl(path, 60);
      if (r.error) throw r.error;
      setLink(r.data.signedUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className={styles.attachmentView}>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void view()}>
        Prepare private attachment link
      </Button>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer">
          Open attachment (expires in 60 seconds)
        </a>
      )}
      {error && <span className={styles.error} role="alert">{error}</span>}
    </span>
  );
}

export function CaptureField({
  q,
  value,
  onChange,
  projectId,
  consent,
  onBusy,
  ownerId,
}: {
  ownerId: string;
  q: Question;
  value: Json | undefined;
  onChange: (v: Json) => void;
  projectId: string;
  consent: Json;
  onBusy: (v: boolean) => void;
}) {
  const [savedFiles, setSavedFiles] = useState<LocalAttachment[]>([]);
  useEffect(() => {
    if (q.type !== "photo" && q.type !== "document") return;
    let live = true;
    const load = () => {
      void fieldRecords<LocalAttachment>(ownerId, "attachment")
        .then((rows) => {
          if (live) setSavedFiles(rows.map((r) => r.value).filter((f) => f.project === projectId && f.question === q.id));
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    load();
    window.addEventListener("poem:survey-queue-change", load);
    return () => {
      live = false;
      window.removeEventListener("poem:survey-queue-change", load);
    };
  }, [ownerId, projectId, q.id, q.type]);
  const [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [authority, setAuthority] = useState("");

  async function upload(file: File) {
    setError("");
    setWorking(true);
    onBusy(true);
    try {
      const id = await stageAttachment(
        ownerId,
        projectId,
        q.id,
        file,
        { ...(consent as Record<string, Json>), capture_authority: authority },
        q.type === "photo",
      );
      onChange(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
      onBusy(false);
    }
  }

  function gps() {
    setError("");
    setWorking(true);
    onBusy(true);
    const done = () => {
      setWorking(false);
      onBusy(false);
    };
    if (!navigator.geolocation) {
      setError("Location unavailable. Enter a reason below.");
      done();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          captured_at: new Date(p.timestamp).toISOString(),
        });
        done();
      },
      (e) => {
        setError(e.message + " — enter a reason or retry.");
        done();
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  const label = (
    <legend>
      {q.label}
      {q.required ? " *" : ""}
    </legend>
  );

  if (q.type === "photo" || q.type === "document") {
    const localValue = typeof value === "string" && value.startsWith("local-file:");
    return (
      <fieldset className={styles.captureField}>
        {label}
        <div className={styles.stateRow}>
          <p className={styles.helper}>
            Private JPG/PNG{q.type === "document" ? " or PDF" : ""}, up to 5 MiB. Obtain consent before capture. Encrypted file bytes are saved on this device before an answer is accepted.
          </p>
          {q.required && <StatusBadge tone="warning">Required</StatusBadge>}
        </div>
        <div className={styles.controlStack}>
          <Field label="Who consented to this attachment?">
            <select value={authority} onChange={(e) => setAuthority(e.target.value)}>
              <option value="">Choose consent authority</option>
              <option value="adult_subject">Adult subject</option>
              <option value="representative">Guardian / representative named above</option>
            </select>
          </Field>
          <input
            className={styles.fileControl}
            aria-label={q.label}
            type="file"
            accept={q.type === "photo" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
            capture={q.type === "photo" ? "environment" : undefined}
            disabled={working || !authority}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          {savedFiles.length > 0 && (
            <Field label="Recover an existing device file">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) onChange("local-file:" + e.target.value);
                }}
              >
                <option value="">Select retained file for this question</option>
                {savedFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename} — {f.state} — {f.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {working && <p className={styles.message} role="status">Saving encrypted file on this device… keep this form open.</p>}
        {typeof value === "string" && value && (
          <div className={styles.attachmentActions}>
            <div className={styles.stateRow}>
              <StatusBadge tone={localValue ? "warning" : "success"}>
                {localValue ? "Saved locally" : "Uploaded"}
              </StatusBadge>
              <span className={styles.attachmentMeta}>{localValue ? "Uploads with survey sync" : "Private attachment available through temporary authorization"}</span>
            </div>
            {!localValue && <AttachmentView id={value} />}
            <Button type="button" variant="danger" onClick={() => onChange("")}>Remove evidence</Button>
          </div>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </fieldset>
    );
  }

  if (q.type === "gps") {
    const gpsValue = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : null;
    const unavailable = gpsValue && "unavailable_reason" in gpsValue;
    return (
      <fieldset className={styles.captureField}>
        {label}
        <div className={styles.gpsHeader}>
          <p className={styles.helper}>Capture the current device location using the existing high-accuracy collection settings.</p>
          {gpsValue && <StatusBadge tone={unavailable ? "warning" : "success"}>{unavailable ? "Unavailable reason recorded" : "Captured"}</StatusBadge>}
        </div>
        {gpsValue && !unavailable && (
          <div className={styles.gpsGrid} aria-label="Captured location values">
            <div className={styles.gpsDatum}><span>Latitude</span><strong>{String(gpsValue.latitude ?? "—")}</strong></div>
            <div className={styles.gpsDatum}><span>Longitude</span><strong>{String(gpsValue.longitude ?? "—")}</strong></div>
            <div className={styles.gpsDatum}><span>Accuracy</span><strong>{String(gpsValue.accuracy ?? "—")}</strong></div>
          </div>
        )}
        <Button type="button" variant="secondary" disabled={working} onClick={gps}>
          {working ? "Locating…" : gpsValue && !unavailable ? "Capture again" : "Capture current location"}
        </Button>
        <Field label="If unavailable, explain why">
          <input
            minLength={5}
            maxLength={300}
            value={gpsValue ? String(gpsValue.unavailable_reason ?? "") : ""}
            onChange={(e) => onChange(e.target.value ? { unavailable_reason: e.target.value } : "")}
          />
        </Field>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </fieldset>
    );
  }

  if (q.type === "household") {
    const members = (Array.isArray(value) ? value : []) as Record<string, Json>[];
    const update = (index: number, key: string, v: string) => onChange(members.map((m, i) => (i === index ? { ...m, [key]: v } : m)));
    return (
      <fieldset className={styles.captureField}>
        {label}
        <div className={styles.stateRow}>
          <p className={styles.helper}>Reported members, maximum 30. These answers do not automatically create registry identities.</p>
          <StatusBadge tone="neutral">{members.length} / 30 members</StatusBadge>
        </div>
        <div className={styles.memberList}>
          {members.map((m, i) => (
            <section className={styles.memberCard} key={i} aria-label={`Household member ${i + 1}`}>
              <div className={styles.memberHeader}>
                <strong>Member {i + 1}</strong>
                <Button type="button" variant="danger" onClick={() => onChange(members.filter((_, n) => n !== i))}>Remove member</Button>
              </div>
              <div className={styles.memberFields}>
                {(["full_name", "birth_date", "relationship"] as const).map((key) => (
                  <Field key={key} label={key.replaceAll("_", " ")}>
                    <input
                      value={String(m[key] ?? "")}
                      type={key === "birth_date" ? "date" : "text"}
                      max={key === "birth_date" ? new Date().toISOString().slice(0, 10) : undefined}
                      maxLength={key === "relationship" ? 100 : 200}
                      onChange={(e) => update(i, key, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </section>
          ))}
        </div>
        <Button type="button" variant="secondary" disabled={members.length >= 30} onClick={() => onChange([...members, { full_name: "", birth_date: "", relationship: "" }])}>
          + Add household member
        </Button>
      </fieldset>
    );
  }

  if (q.type === "multiple") {
    return (
      <fieldset className={styles.captureField}>
        {label}
        <p className={styles.choiceHint}>Choose all that apply.</p>
        <div className={styles.choiceList}>
          {q.options?.map((o, index) => (
            <label className={styles.choiceRow} key={`${q.id}:multiple:${index}`}>
              <input
                type="checkbox"
                checked={Array.isArray(value) && value.includes(o)}
                onChange={(e) => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(e.target.checked ? [...current, o] : current.filter((v) => v !== o));
                }}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (q.type === "choice" || q.type === "yesno") {
    const options = q.type === "yesno" ? ["true", "false"] : q.options || [];
    return (
      <Field label={q.label} required={q.required}>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value === "" ? "" : q.type === "yesno" ? e.target.value === "true" : e.target.value)}
        >
          <option value="">Choose answer</option>
          {options.map((o, index) => (
            <option key={`${q.id}:${q.type}:${index}`} value={o}>
              {q.type === "yesno" ? (o === "true" ? "Yes" : "No") : o}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const hint = q.type === "identity" ? "13 digits, without spaces or dashes." : q.type === "phone" ? "7–15 digits, optional leading +." : undefined;
  return (
    <Field label={q.label} required={q.required} hint={hint}>
      <input
        type={q.type === "number" ? "number" : q.type === "date" ? "date" : q.type === "phone" ? "tel" : "text"}
        inputMode={q.type === "identity" ? "numeric" : undefined}
        min={q.min}
        max={q.max}
        step={q.type === "number" ? "any" : undefined}
        maxLength={q.type === "identity" ? 13 : 4000}
        value={String(value ?? "")}
        onChange={(e) => onChange(q.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  );
}
