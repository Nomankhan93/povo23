import { useState, type FormEvent } from "react";
import { type Json } from "../../lib/supabase/database.types";
import {
  Household,
  Person,
  Project,
  Question,
  Response,
  Template,
  get,
} from "./model";
import { useSurveySave } from "./useSurveySave";
export function SurveyForm({
  project,
  template,
  response,
  people,
  households,
  busy,
  cancel,
  onSaved,
}: {
  project: Project;
  template: Template;
  response: Response | null;
  people: Person[];
  households: Household[];
  busy: boolean;
  cancel: () => void;
  onSaved: () => void;
}) {
  const request = useSurveySave(onSaved);
  const qs = template.questions as unknown as Question[];
  const [answers, setAnswers] = useState<Record<string, Json>>(
      (response?.answers || {}) as Record<string, Json>,
    ),
    [person, setPerson] = useState(""),
    [household, setHousehold] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const button = (e.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    void request.send({
      p_id: response?.id || null,
      p_project: project.id,
      p_person: person || null,
      p_household: household || null,
      p_name: get(f, "name"),
      p_birth: get(f, "birth") || null,
      p_household_label: get(f, "household"),
      p_answers: answers,
      p_consent: {
        agreed: f.get("agreed") === "on",
        method: get(f, "method"),
        representative: get(f, "representative"),
        relationship: get(f, "relationship"),
      },
      p_submit: button?.value === "submit",
      p_version: response?.version || 0,
    });
  }
  return (
    <form className="survey-question" onSubmit={submit}>
      <h3>{response ? "Update response" : "Collect a survey"}</h3>
      <fieldset disabled={busy || request.saving || request.uncertain}>
        <section className="consent-notice">
          <h4>Consent before collection</h4>
          <p className="preserve-lines">{project.consent_notice}</p>
          <p>
            Purpose: {project.purpose} · Version: {project.consent_version}
          </p>
          <label className="checklabel">
            <input type="checkbox" name="agreed" required />I explained this
            notice and obtained informed consent
          </label>
          <label className="field">
            Method
            <select name="method">
              <option value="verbal">Verbal consent</option>
              <option value="written">Written consent</option>
            </select>
          </label>
          <label className="field">
            Guardian / representative name (required for minors or unknown age)
            <input name="representative" maxLength={200} />
          </label>
          <label className="field">
            Relationship to person
            <input name="relationship" maxLength={100} />
          </label>
        </section>
        {!response && (
          <>
            <label className="field">
              Person
              <select
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              >
                <option value="">New person</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · BEN-{p.registry_no}
                  </option>
                ))}
              </select>
            </label>
            {!person && (
              <>
                <label className="field">
                  Person name
                  <input name="name" required minLength={2} maxLength={200} />
                </label>
                <label className="field">
                  Birth date (leave blank if unknown)
                  <input name="birth" type="date" />
                </label>
                <label className="field">
                  Household
                  <select
                    value={household}
                    onChange={(e) => setHousehold(e.target.value)}
                  >
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
                      name="household"
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
                {(q.type === "yesno" ? ["true", "false"] : q.options || []).map(
                  (v) => (
                    <option key={v} value={v}>
                      {q.type === "yesno" ? (v === "true" ? "Yes" : "No") : v}
                    </option>
                  ),
                )}
              </select>
            ) : (
              <input
                type={
                  q.type === "number"
                    ? "number"
                    : q.type === "date"
                      ? "date"
                      : "text"
                }
                step={q.type === "number" ? "any" : undefined}
                maxLength={4000}
                value={String(answers[q.id] ?? "")}
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    [q.id]:
                      q.type === "number" && e.target.value !== ""
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
        <p>
          * Required on submission. Drafts also require consent. Use the
          registry search above to locate existing people before creating
          another record.
        </p>
        <div className="actions">
          <button className="secondary" value="draft" disabled={busy}>
            Save online draft
          </button>
          <button className="primary" value="submit" disabled={busy}>
            Submit for review
          </button>
        </div>
      </fieldset>
      {request.error && (
        <p role="alert" className="notice error">
          {request.error}
        </p>
      )}
      {request.uncertain && (
        <p>
          The server may have saved this survey. Retry the unchanged request to
          confirm it. Keep this form open; reloading loses this retry reference.
        </p>
      )}
      {request.uncertain && (
        <button
          type="button"
          disabled={request.saving}
          onClick={() => void request.send()}
        >
          Retry unchanged request
        </button>
      )}
      <button
        type="button"
        className="secondary"
        disabled={request.saving || request.uncertain}
        onClick={cancel}
      >
        Cancel
      </button>
      {request.saving && <p role="status">Confirming save…</p>}
    </form>
  );
}
