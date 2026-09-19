import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { type Json } from "../../lib/supabase/database.types";
import {
  deleteSurveyDeviceDraft,
  loadSurveyDeviceDraft,
  saveSurveyDeviceDraft,
  type SurveyDeviceDraft,
} from "./offlineSurveyStore";
import { Household, Person, Project, Question, Response, Template } from "./model";
import { useSurveySave } from "./useSurveySave";

import {registerActiveDraft} from "./activeDraft";
import { reconsentAttachments } from "./fieldAttachments";
import { CaptureField } from "./CaptureFields";
import { visibleAnswers, isVisible, answerText, captureErrors } from "./capture";

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
  const draftWrites=useRef<Promise<void>>(Promise.resolve());
  const finalizing=useRef(false);
  const [savedAt,setSavedAt]=useState<number|null>(null);
  const [validation,setValidation]=useState<string[]>([]);
  const [captureBusy,setCaptureBusy]=useState(0);
  const [reviewed,setReviewed]=useState(false);
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
    [consent, setConsent] = useState<SurveyDeviceDraft["consent"]>(blankConsent),
    [hydrated, setHydrated] = useState(false),
    [restored, setRestored] = useState(false),
    [draftError, setDraftError] = useState(""),
    [dirty, setDirty] = useState(false),
    [online, setOnline] = useState(navigator.onLine);

  useEffect(()=>setReviewed(false),[answers,person,household,name,birth,householdLabel,consent]);

  const draftResponse = response?.id || null;
  const latestDraft=useRef({person,household,name,birth,householdLabel,answers,consent});
  latestDraft.current={person,household,name,birth,householdLabel,answers,consent};
  useEffect(()=>registerActiveDraft(async()=>{
    if(captureBusy>0)throw Error("Wait for attachment capture/location to finish before leaving this form");
    if(finalizing.current){await draftWrites.current;return}
    finalizing.current=true;
    try{await draftWrites.current;if(dirty)await saveSurveyDeviceDraft(userId,project.id,draftResponse,{...latestDraft.current,consent:{...latestDraft.current.consent,governance_version:project.governance_version}})}finally{finalizing.current=false}
  }),[dirty,captureBusy,userId,project.id,project.governance_version,draftResponse]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty&&!finalizing.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);

  const clearDeviceDraft = async () => {
    finalizing.current=true;
    await draftWrites.current;
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
        const policyChanged = (draft.consent.governance_version || 0) !== project.governance_version;
        setConsent({...draft.consent, agreed: policyChanged ? false : draft.consent.agreed});
        if (policyChanged) setDraftError("Project policy changed. Review the current policy and obtain consent again before saving this recovered draft.");
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
  }, [draftResponse, project.id, project.governance_version, userId]);

  useEffect(() => {
    if (!hydrated || !dirty || finalizing.current) return;
    const payload: SurveyDeviceDraft = {
      person,
      household,
      name,
      birth,
      householdLabel,
      answers,
      consent: {...consent, governance_version: project.governance_version},
    };
    const timer = window.setTimeout(() => {
      if(finalizing.current)return;
      draftWrites.current=draftWrites.current.catch(()=>{}).then(()=>saveSurveyDeviceDraft(userId, project.id, draftResponse, payload));
      draftWrites.current
        .then(() => {setDraftError("");setSavedAt(Date.now())})
        .catch((e) => setDraftError((e as Error).message));
    }, 50);
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
    const errors=captureErrors(qs,answers,button?.value === "submit");
    setValidation(errors);
    if(errors.length || captureBusy>0 || (button?.value === "submit" && !reviewed))return;
    finalizing.current=true;
    void request.send({
      p_id: response?.id || null,
      p_project: project.id,
      p_person: person || null,
      p_household: household || null,
      p_name: name,
      p_birth: birth || null,
      p_household_label: householdLabel,
      p_answers: visibleAnswers(qs, answers),
      p_consent: {...consent, governance_version: project.governance_version,template_id:template.id},
      p_submit: button?.value === "submit",
      p_version: response?.version || 0,
    });
  }

  useEffect(()=>{if(request.error&&!request.queued)finalizing.current=false},[request.error,request.queued]);
  async function closeForm(){
    if(captureBusy>0)return;
    try{
      finalizing.current=true;await draftWrites.current;
      if(dirty)await saveSurveyDeviceDraft(userId,project.id,draftResponse,{person,household,name,birth,householdLabel,answers,consent:{...consent,governance_version:project.governance_version}});
      cancel();
    }catch(e){finalizing.current=false;setDraftError((e as Error).message)}
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
    finalizing.current=false;
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
      <p role="status">{dirty?"Saving device draft… keep this form open":savedAt?`Saved locally at ${new Date(savedAt).toLocaleTimeString()}`:"Device draft ready"}</p>
      <h3>{response ? "Update response" : "Collect a survey"}</h3>
      <div className="survey-progress"><label htmlFor="survey-question-progress">Survey questions: {qs.filter(q=>isVisible(q,visibleAnswers(qs,answers))).length} currently visible</label><progress id="survey-question-progress" max={Math.max(1,qs.filter(q=>isVisible(q,visibleAnswers(qs,answers))).length)} value={qs.filter(q=>isVisible(q,visibleAnswers(qs,answers)) && answers[q.id]!==undefined && answers[q.id]!==null && answers[q.id]!=='' && (!Array.isArray(answers[q.id]) || (answers[q.id] as unknown[]).length>0)).length}/><small>Progress shows questions with an answer. Consent, required fields and answer validity are checked separately before submission.</small></div>
      <p>{project.governance_notice || "Legacy project policy: purpose and consent below apply; no independent-verification collection gate configured."}</p>
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
      <fieldset disabled={busy || request.saving || request.uncertain || !hydrated}>
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
                    {p.full_name} · FL-BEN-{String(p.registry_no).padStart(8, "0")}
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
        {qs.filter(q=>isVisible(q,visibleAnswers(qs,answers))).map(q=><CaptureField key={q.id} q={q} ownerId={userId} value={answers[q.id]} projectId={project.id} consent={{...consent,governance_version:project.governance_version}} onBusy={v=>setCaptureBusy(n=>n+(v?1:-1))} onChange={v=>{setAnswers(previous=>visibleAnswers(qs,{...previous,[q.id]:v}));setDirty(true);setReviewed(false)}}/>)}
        <button type="button" disabled={!consent.agreed || captureBusy>0} onClick={()=>{
          if(!window.confirm("Use current consent for retained device attachments? New evidence references will be created; the rejected original request remains unchanged."))return;
          setCaptureBusy(n=>n+1);void reconsentAttachments(userId,answers,{...consent,governance_version:project.governance_version}).then(v=>{setAnswers(v);setDirty(true);setReviewed(false)}).catch(e=>setDraftError(e.message)).finally(()=>setCaptureBusy(n=>n-1));
        }}>Renew device attachment consent after policy correction</button>
        <details><summary>Review answers before submission</summary>{qs.filter(q=>isVisible(q,visibleAnswers(qs,answers))).map(q=><div key={q.id}><strong>{q.label}</strong><pre>{answerText(answers[q.id])}</pre></div>)}</details>
        <label className="checklabel"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the answers with the respondent before submitting.</label>
        <p>
          * Required on submission. Drafts also require consent. Use the registry search above to locate existing people before creating another record.
        </p>
        <div className="actions survey-actions">
          <button className="secondary" value="draft" disabled={busy || captureBusy>0}>
            Save draft
          </button>
          <button className="primary" value="submit" disabled={busy || captureBusy>0 || !reviewed}>
            Submit for review
          </button>
        </div>
      </fieldset>
      {validation.length>0&&<ul role="alert" className="notice error">{validation.map((v,i)=><li key={i}>{v}</li>)}</ul>}
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
      <button type="button" className="secondary" disabled={request.saving || request.uncertain || captureBusy>0} onClick={()=>void closeForm()}>
        Close form
      </button>
      {request.saving && <p role="status">Protecting and confirming save…</p>}
    </form>
  );
}
