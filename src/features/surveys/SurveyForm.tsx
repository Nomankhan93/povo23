import {surveyQuestionSections,representativeNeeded} from './surveyPresentation';
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
import { Alert, Button, StatusBadge } from "../../components/ui/FieldLanceUI";
import styles from "./SurveyForm.module.css";

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
  const formRef=useRef<HTMLFormElement>(null);
  const [step,setStep]=useState('consent');
  const draftWrites=useRef<Promise<void>>(Promise.resolve());
  const finalizing=useRef(false);
  const [savedAt,setSavedAt]=useState<number|null>(null);
  const [draftWriteState,setDraftWriteState]=useState<"ready"|"saving"|"saved"|"error">("ready");
  const draftWriteRevision=useRef(0);
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

  const visible=visibleAnswers(qs,answers);
  const groups=surveyQuestionSections(qs).filter(group=>group.questions.some(q=>isVisible(q,visible)));
  const sections=[{id:'consent',title:'Consent'},...(!response?[{id:'person',title:'Person & household'}]:[]),...groups,{id:'review',title:'Review & submit'}];
  const currentStep=sections.some(section=>section.id===step)?step:sections[0].id;
  const stepIndex=sections.findIndex(section=>section.id===currentStep);
  const knownBirth=response?people.find(p=>p.id===response.person_id)?.birth_date:person?people.find(p=>p.id===person)?.birth_date:birth;
  const showRepresentative=representativeNeeded(knownBirth,qs,visible);
  function reveal(element:HTMLElement,native=false){
    const section=element.closest<HTMLElement>('[data-survey-section]');
    if(section)setStep(section.dataset.surveySection!);
    requestAnimationFrame(()=>{
      element.focus();element.scrollIntoView({block:'center'});
      if(native&&(element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement))element.reportValidity();
    });
  }
  function firstInvalid(root:ParentNode|null){
    return Array.from(root?.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea')||[])
      .find(element=>element.willValidate&&!element.validity.valid);
  }
  function moveSection(id:string){
    setStep(id);
    requestAnimationFrame(()=>{
      const heading=formRef.current?.querySelector<HTMLElement>('[data-survey-section="'+id+'"] h4');
      heading?.focus();heading?.scrollIntoView({block:'start'});
    });
  }
  function nextSection(){
    const section=formRef.current?.querySelector('[data-survey-section="'+currentStep+'"]');
    const invalid=firstInvalid(section||null);
    if(invalid){reveal(invalid,true);return}
    moveSection(sections[stepIndex+1].id);
  }

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
    setSavedAt(null);
    setDraftWriteState("ready");
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
    const writeRevision=++draftWriteRevision.current;
    setDraftWriteState("saving");
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
        .then(() => {
          setDraftError("");
          setSavedAt(Date.now());
          if(draftWriteRevision.current===writeRevision)setDraftWriteState("saved");
        })
        .catch((e) => {
          if(draftWriteRevision.current===writeRevision)setDraftWriteState("error");
          setDraftError((e as Error).message);
        });
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
    const invalid=firstInvalid(formRef.current);
    if(invalid){reveal(invalid,true);return}
    const invalidQuestions:string[]=[];
    const errors=captureErrors(qs,answers,button?.value === "submit",id=>invalidQuestions.push(id));
    if(invalidQuestions.length){
      const wrapper=Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-survey-question]')||[]).find(node=>node.dataset.surveyQuestion===invalidQuestions[0]);
      const target=wrapper?.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea,button')||wrapper;
      if(target)reveal(target);
    }
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
    setSavedAt(null);
    setDraftWriteState("ready");
    finalizing.current=false;
  }

  const representativeFields=(<>          <label className="field">
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
</>);
  const currentVisibleQuestions = qs.filter((q) => isVisible(q, visibleAnswers(qs, answers)));
  const answeredVisibleQuestions = currentVisibleQuestions.filter((q) => {
    const value = answers[q.id];
    return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
  });
  const draftStatusText = draftWriteState === "saving"
    ? "Saving device draft… keep this form open"
    : draftWriteState === "saved" && savedAt
      ? `Saved locally at ${new Date(savedAt).toLocaleTimeString()}`
      : draftWriteState === "error"
        ? "Device draft save needs attention"
        : "Device draft ready";

  return (
    <form
      ref={formRef}
      noValidate
      className={styles.form}
      data-current-section={currentStep}
      onSubmit={submit}
      onChange={() => setDirty(true)}
    >
      <header className={styles.collectionHeader}>
        <div className={styles.headerTop}>
          <div className={styles.headerCopy}>
            <h3>{response ? "Update response" : "Collect a survey"}</h3>
            <p className={styles.contextLine}>{template.name} · {project.title}</p>
          </div>
          <div className={styles.headerStatus} aria-label="Collection status">
            <StatusBadge tone={online ? "success" : "warning"}>{online ? "Online" : "Offline"}</StatusBadge>
            <StatusBadge tone={draftWriteState === "saving" ? "warning" : draftWriteState === "saved" ? "success" : draftWriteState === "error" ? "danger" : "neutral"}>{draftStatusText}</StatusBadge>
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {draftStatusText}
            </span>
          </div>
        </div>
        <div className={styles.progressBlock}>
          <div className={styles.progressMeta}>
            <span>Section {stepIndex + 1} of {sections.length} · {sections[stepIndex].title}</span>
            <span>{answeredVisibleQuestions.length} / {currentVisibleQuestions.length} visible questions answered</span>
          </div>
          <progress
            aria-label="Survey question progress"
            max={Math.max(1, currentVisibleQuestions.length)}
            value={answeredVisibleQuestions.length}
          />
          <p className={styles.progressHelp}>Progress shows questions with an answer. Consent, required fields and answer validity are checked separately before submission.</p>
        </div>
        <p className={styles.statusCopy}>
          {online
            ? "A write-ahead encrypted copy is kept until the server confirms the save."
            : "Keep collecting. Save or submit will remain encrypted on this device until connectivity returns."}
        </p>
      </header>

      <p>{project.governance_notice || "Legacy project policy: purpose and consent below apply; no independent-verification collection gate configured."}</p>
      {restored && (
        <Alert
          title="Encrypted device draft restored"
          tone="info"
          action={<Button type="button" variant="tertiary" onClick={() => void discardDraft()}>Discard draft</Button>}
        >
          The protected local draft was restored after this form was reopened.
        </Alert>
      )}
      {draftError && <Alert title="Device draft protection" tone="danger">{draftError}</Alert>}

      <div className={styles.mobileProgress} role="status">
        <span>Section {stepIndex + 1} of {sections.length} · {sections[stepIndex].title}</span>
        <progress aria-label="Survey section progress" max={sections.length} value={stepIndex + 1} />
      </div>

      <div className={styles.workspace}>
        <aside className={styles.sectionRail} aria-label="Survey progress">
          <div>
            <h4>Survey progress</h4>
            <p>Work through the existing collection sections in order or return to a previous section.</p>
          </div>
          <nav className={styles.sectionNav} aria-label="Survey sections">
            {sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                className={styles.sectionNavButton}
                data-active={currentStep === section.id}
                aria-current={currentStep === section.id ? "step" : undefined}
                onClick={() => moveSection(section.id)}
              >
                <span className={styles.sectionNumber}>{index + 1}</span>
                <span>{section.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className={styles.content}>
          <fieldset className={styles.fieldset} disabled={busy || request.saving || request.uncertain || !hydrated}>
            <div className={styles.section} data-survey-section="consent" hidden={currentStep !== "consent"}>
              <section className="consent-notice">
                <h4 tabIndex={-1}>Consent before collection</h4>
                <p className="preserve-lines">{project.consent_notice}</p>
                <p>Purpose: {project.purpose} · Version: {project.consent_version}</p>
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
                  <select value={consent.method} onChange={(e) => setConsent({ ...consent, method: e.target.value })}>
                    <option value="verbal">Verbal consent</option>
                    <option value="written">Written consent</option>
                  </select>
                </label>
                {showRepresentative ? (
                  <div className="representative-fields">{representativeFields}</div>
                ) : (
                  <details className="representative-fields">
                    <summary>Add a guardian / representative if applicable</summary>
                    {representativeFields}
                  </details>
                )}
              </section>
            </div>

            {!response && (
              <div className={styles.section} data-survey-section="person" hidden={currentStep !== "person"}>
                <h4 tabIndex={-1}>Person & household</h4>
                <div className={styles.sectionBody}>
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
                          {households.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                        </select>
                      </label>
                      {!household && (
                        <label className="field">
                          Household label
                          <input value={householdLabel} onChange={(e) => setHouseholdLabel(e.target.value)} minLength={2} maxLength={200} required />
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {groups.map((group) => (
              <div key={group.id} className={styles.section} data-survey-section={group.id} hidden={currentStep !== group.id}>
                <h4 tabIndex={-1}>{group.title}</h4>
                <div className={styles.questionList}>
                  {group.questions.filter((q) => isVisible(q, visible)).map((q) => (
                    <div className={styles.question} data-survey-question={q.id} key={q.id} tabIndex={-1}>
                      <CaptureField
                        q={q}
                        ownerId={userId}
                        value={answers[q.id]}
                        projectId={project.id}
                        consent={{ ...consent, governance_version: project.governance_version }}
                        onBusy={(v) => setCaptureBusy((n) => n + (v ? 1 : -1))}
                        onChange={(v) => {
                          setAnswers((previous) => visibleAnswers(qs, { ...previous, [q.id]: v }));
                          setDirty(true);
                          setReviewed(false);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className={styles.section} data-survey-section="review" hidden={currentStep !== "review"}>
              <h4 tabIndex={-1}>Review & submit</h4>
              <Button
                type="button"
                variant="secondary"
                disabled={!consent.agreed || captureBusy > 0}
                onClick={() => {
                  if (!window.confirm("Use current consent for retained device attachments? New evidence references will be created; the rejected original request remains unchanged.")) return;
                  setCaptureBusy((n) => n + 1);
                  void reconsentAttachments(userId, answers, { ...consent, governance_version: project.governance_version })
                    .then((v) => {
                      setAnswers(v);
                      setDirty(true);
                      setReviewed(false);
                    })
                    .catch((e) => setDraftError(e.message))
                    .finally(() => setCaptureBusy((n) => n - 1));
                }}
              >
                Renew device attachment consent after policy correction
              </Button>
              <details>
                <summary>Review answers before submission</summary>
                <div className={styles.reviewAnswers}>
                  {qs.filter((q) => isVisible(q, visibleAnswers(qs, answers))).map((q) => (
                    <div className={styles.reviewAnswer} key={q.id}>
                      <strong>{q.label}</strong>
                      <pre>{answerText(answers[q.id])}</pre>
                    </div>
                  ))}
                </div>
              </details>
              <label className="checklabel">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                I reviewed the answers with the respondent before submitting.
              </label>
              <p className={styles.reviewHelp}>* Required on submission. Drafts also require consent. Use the registry search above to locate existing people before creating another record.</p>
            </div>

            <div className={styles.mobileNavigation}>
              <Button type="button" variant="secondary" disabled={stepIndex === 0 || captureBusy > 0} onClick={() => moveSection(sections[stepIndex - 1].id)}>
                Previous section
              </Button>
              {stepIndex < sections.length - 1 && (
                <Button type="button" variant="primary" disabled={captureBusy > 0} onClick={nextSection}>
                  Next section
                </Button>
              )}
            </div>

            <div className={styles.formActions}>
              <Button variant="secondary" value="draft" disabled={busy || captureBusy > 0}>Save draft</Button>
              <Button className={styles.submitButton} variant="primary" value="submit" disabled={busy || captureBusy > 0 || !reviewed}>
                Submit for review
              </Button>
            </div>
          </fieldset>
        </div>
      </div>

      <div className={styles.formAlerts}>
        {validation.length > 0 && (
          <Alert title="Review the highlighted survey answers" tone="danger">
            <ul className={styles.validationList}>{validation.map((v, i) => <li key={i}>{v}</li>)}</ul>
          </Alert>
        )}
        {request.error && !request.queued && <Alert title="Survey save failed" tone="danger">{request.error}</Alert>}
        {request.queued && (
          <Alert title="Survey queued on this device" tone="success">
            Survey saved to the encrypted device queue. It will sync with the same request ID when the connection is available.
          </Alert>
        )}
        {request.uncertain && (
          <Alert title="Server save is uncertain" tone="danger">
            Encrypted device storage was unavailable, so the server save is uncertain. Keep this form open and retry the unchanged request.
          </Alert>
        )}
      </div>
      <div className={styles.recoveryActions}>
        {request.uncertain && (
          <Button type="button" variant="secondary" disabled={request.saving} onClick={() => void request.send()}>
            Retry unchanged request
          </Button>
        )}
        <Button type="button" variant="tertiary" disabled={request.saving || request.uncertain || captureBusy > 0} onClick={() => void closeForm()}>
          Close form
        </Button>
      </div>
      {request.saving && <p role="status">Protecting and confirming save…</p>}
    </form>

  );
}
