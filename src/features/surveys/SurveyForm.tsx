import { useEffect, useMemo, useState, type FormEvent } from "react";
import { type Json } from "../../lib/supabase/database.types";
import {
  deleteSurveyDeviceDraft,
  loadSurveyDeviceDraft,
  saveSurveyDeviceDraft,
  type SurveyDeviceDraft,
} from "./offlineSurveyStore";
import { Household, Person, Project, Question, Response, Template } from "./model";
import { useSurveySave } from "./useSurveySave";

const blankConsent = {
  agreed: false,
  method: "verbal",
  representative: "",
  relationship: "",
};

export function SurveyForm({
  project,
  template,
  response,
  people,
  households,
  userId,
  busy,
  cancel,
  onSaved,
  onQueued,
}: {
  project: Project;
  template: Template;
  response: Response | null;
  people: Person[];
  households: Household[];
  userId: string;
  busy: boolean;
  cancel: () => void;
  onSaved: () => void;
  onQueued: () => void;
}) {
  const qs = template.questions as unknown as Question[];
  const baselineAnswers = useMemo(
    () => ((response?.answers || {}) as Record<string, Json>),
    [response],
  );
  const [answers, setAnswers] = useState<Record<string, Json>>(baselineAnswers),
    [person, setPerson] = useState(""),
    [household, setHousehold] = useState(""),
    [name, setName] = useState(""),
    [birth, setBirth] = useState(""),
    [householdLabel, setHouseholdLabel] = useState(""),
    [consent, setConsent] = useState(blankConsent),
    [hydrated, setHydrated] = useState(false),
    [restored, setRestored] = useState(false),
    [draftError, setDraftError] = useState(""),
    [dirty, setDirty] = useState(false),
    [online, setOnline] = useState(navigator.onLine);

  const draftResponse = response?.id || null;
  const clearDeviceDraft = async () => {
    await deleteSurveyDeviceDraft(userId, project.id, draftResponse);
    setRestored(false);
  };
  const request = useSurveySave(
    userId,
    async () => {
      await clearDeviceDraft();
      onSaved();
    },
    async () => {
      await clearDeviceDraft();
      onQueued();
    },
  );

  useEffect(() => {
    let live = true;
    setHydrated(false);
    setDraftError("");
    loadSurveyDeviceDraft(userId, project.id, draftResponse)
      .then((draft) => {
        if (!live || !draft) return;
        setPerson(draft.person);
        setHousehold(draft.household);
        setName(draft.name);
        setBirth(draft.birth);
        setHouseholdLabel(draft.householdLabel);
        setAnswers(draft.answers);
        setConsent(draft.consent);
        setRestored(true);
      })
      .catch((e) => {
        if (live) setDraftError((e as Error).message);
      })
      .finally(() => {
        if (live) setHydrated(true);
      });
    return () => {
      live = false;
    };
  }, [draftResponse, project.id, userId]);

  useEffect(() => {
    if (!hydrated || !dirty) return;
    const payload: SurveyDeviceDraft = {
      person,
      household,
      name,
      birth,
      householdLabel,
      answers,
      consent,
    };
    const timer = window.setTimeout(() => {
      saveSurveyDeviceDraft(userId, project.id, draftResponse, payload)
        .then(() => setDraftError(""))
        .catch((e) => setDraftError((e as Error).message));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [answers, birth, consent, dirty, draftResponse, household, householdLabel, hydrated, name, person, project.id, userId]);

  useEffect(() => {
    const yes = () => setOnline(true);
    const no = () => setOnline(false);
    window.addEventListener("online", yes);
    window.addEventListener("offline", no);
    return () => {
      window.removeEventListener("online", yes);
      window.removeEventListener("offline", no);
    };
  }, []);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    void request.send({
      p_id: response?.id || null,
      p_project: project.id,
      p_person: person || null,
      p_household: household || null,
      p_name: name,
      p_birth: birth || null,
      p_household_label: householdLabel,
      p_answers: answers,
      p_consent: consent,
      p_submit: button?.value === "submit",
      p_version: response?.version || 0,
    });
  }

  async function discardDraft() {
    if (!window.confirm("Discard the encrypted device draft and clear this form?")) return;
    await clearDeviceDraft();
    setPerson("");
    setHousehold("");
    setName("");
    setBirth("");
    setHouseholdLabel("");
    setAnswers(baselineAnswers);
    setConsent(blankConsent);
    setDirty(false);
  }

  return (
    <form className="survey-question" onSubmit={submit} onChange={() => setDirty(true)}>
      <div className="field-mode">
        <strong>{online ? "Online field mode" : "Offline field mode"}</strong>
        <span>
          {online
            ? "A write-ahead encrypted copy is kept until the server confirms the save."
            : "Keep collecting. Save or submit will remain encrypted on this device until connectivity returns."}
        </span>
      </div>
      <h3>{response ? "Update response" : "Collect a survey"}</h3>
      {restored && (
        <div className="notice" role="status">
          An encrypted device draft was restored after the form was reopened.
          <button type="button" onClick={() => void discardDraft()}>
            Discard draft
          </button>
        </div>
      )}
      {draftError && (
        <p className="notice error" role="alert">
          Device draft protection: {draftError}
        </p>
      )}
      <fieldset disabled={busy || request.saving || request.uncertain}>
        <section className="consent-notice">
          <h4>Consent before collection</h4>
          <p className="preserve-lines">{project.consent_notice}</p>
          <p>
            Purpose: {project.purpose} · Version: {project.consent_version}
          </p>
          <label className="checklabel">
            <input
              type="checkbox"
              checked={consent.agreed}
              onChange={(e) => setConsent({ ...consent, agreed: e.target.checked })}
              required
            />
            I explained this notice and obtained informed consent
          </label>
          <label className="field">
            Method
            <select
              value={consent.method}
              onChange={(e) => setConsent({ ...consent, method: e.target.value })}
            >
              <option value="verbal">Verbal consent</option>
              <option value="written">Written consent</option>
            </select>
          </label>
          <label className="field">
            Guardian / representative name (required for minors or unknown age)
            <input
              value={consent.representative}
              onChange={(e) => setConsent({ ...consent, representative: e.target.value })}
              maxLength={200}
            />
          </label>
          <label className="field">
            Relationship to person
            <input
              value={consent.relationship}
              onChange={(e) => setConsent({ ...consent, relationship: e.target.value })}
              maxLength={100}
            />
          </label>
        </section>
        {!response && (
          <>
            <label className="field">
              Person
              <select value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">New person</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · POEM-BEN-{String(p.registry_no).padStart(8, "0")}
                  </option>
                ))}
              </select>
            </label>
            {!person && (
              <>
                <label className="field">
                  Person name
                  <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={200} />
                </label>
                <label className="field">
                  Birth date (leave blank if unknown)
                  <input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" />
                </label>
                <label className="field">
                  Household
                  <select value={household} onChange={(e) => setHousehold(e.target.value)}>
                    <option value="">New household</option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </label>
                {!household && (
                  <label className="field">
                    Household label
                    <input
                      value={householdLabel}
                      onChange={(e) => setHouseholdLabel(e.target.value)}
                      minLength={2}
                      maxLength={200}
                      required
                    />
                  </label>
                )}
              </>
            )}
          </>
        )}
        {qs.map((q) => (
          <label className="field" key={q.id}>
            {q.label}
            {q.required ? " *" : ""}
            {q.type === "choice" || q.type === "yesno" ? (
              <select
                value={answers[q.id] === undefined ? "" : String(answers[q.id])}
                required={q.required}
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    [q.id]:
                      e.target.value === ""
                        ? ""
                        : q.type === "yesno"
                          ? e.target.value === "true"
                          : e.target.value,
                  })
                }
              >
                <option value="">Choose answer</option>
                {(q.type === "yesno" ? ["true", "false"] : q.options || []).map((v) => (
                  <option key={v} value={v}>
                    {q.type === "yesno" ? (v === "true" ? "Yes" : "No") : v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={q.type === "number" ? "number" : q.type === "date" ? "date" : "text"}
                step={q.type === "number" ? "any" : undefined}
                maxLength={4000}
                required={q.required}
                value={String(answers[q.id] ?? "")}
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    [q.id]: q.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
        <p>
          * Required on submission. Drafts also require consent. Use the registry search above to locate existing people before creating another record.
        </p>
        <div className="actions">
          <button className="secondary" value="draft" disabled={busy}>
            Save draft
          </button>
          <button className="primary" value="submit" disabled={busy}>
            Submit for review
          </button>
        </div>
      </fieldset>
      {request.error && !request.queued && (
        <p role="alert" className="notice error">
          {request.error}
        </p>
      )}
      {request.queued && (
        <p role="status" className="notice success">
          Survey saved to the encrypted device queue. It will sync with the same request ID when the connection is available.
        </p>
      )}
      {request.uncertain && (
        <p className="notice error">
          Encrypted device storage was unavailable, so the server save is uncertain. Keep this form open and retry the unchanged request.
        </p>
      )}
      {request.uncertain && (
        <button type="button" disabled={request.saving} onClick={() => void request.send()}>
          Retry unchanged request
        </button>
      )}
      <button type="button" className="secondary" disabled={request.saving || request.uncertain} onClick={cancel}>
        Close form
      </button>
      {request.saving && <p role="status">Protecting and confirming save…</p>}
    </form>
  );
}
