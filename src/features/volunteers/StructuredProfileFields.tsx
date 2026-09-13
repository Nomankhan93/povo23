import { useMemo, useState } from "react";
import { geographyPath, type Geo } from "../geography/model";
import { GeographyPicker } from "../geography/GeographyPicker";
import {
  blankReference,
  educationOptions,
  encodeCommaList,
  encodeEducation,
  encodePreferredAreaIds,
  encodeReferences,
  languageOptions,
  parseCommaList,
  parsePreferredAreaIds,
  parseReferences,
  skillOptions,
  splitEducation,
  type ReferenceEntry,
} from "./profileStructure";

type Update = (key: string, value: string) => void;

function SearchableMultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const selected = parseCommaList(value);
  const [query, setQuery] = useState("");
  const [other, setOther] = useState("");
  const filtered = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );
  function toggle(option: string) {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(encodeCommaList(next));
  }
  function addOther() {
    const custom = other.trim();
    if (!custom) return;
    onChange(encodeCommaList([...selected, `Other: ${custom}`]));
    setOther("");
  }
  return (
    <fieldset className="structured-field multi-select-field">
      <legend>{label}</legend>
      <input
        className="multi-select-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}`}
        maxLength={80}
      />
      <div className="choice-grid" role="group" aria-label={label}>
        {filtered.map((option) => (
          <label className="choice-item" key={option}>
            <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} />
            <span>{option}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="selected-chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {selected.map((item) => (
            <button type="button" className="chip" key={item} onClick={() => toggle(item)} aria-label={`Remove ${item}`}>
              {item} ×
            </button>
          ))}
        </div>
      )}
      <div className="other-inline">
        <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Other" maxLength={100} />
        <button type="button" className="secondary" onClick={addOther}>Add other</button>
      </div>
    </fieldset>
  );
}

function PreferredAreas({ rows, value, onChange }: { rows: Geo[]; value: string; onChange: (value: string) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const ids = parsePreferredAreaIds(value);
  const legacy = value.trim() && !value.trim().startsWith("[") ? value.trim() : "";
  const selectedRows = ids.map((id) => rows.find((g) => g.id === id)).filter((g): g is Geo => !!g);
  const pendingRow = pending ? rows.find((g) => g.id === pending) : null;
  const canAdd = pendingRow?.kind === "district" || pendingRow?.kind === "taluka";
  return (
    <fieldset className="structured-field preferred-areas">
      <legend>Preferred work areas</legend>
      <p>Select one or more Districts or Taluka / Tehsil / Subdivisions where you are willing to work.</p>
      {legacy && <div className="notice">Legacy preferred-area note preserved: {legacy}. Add structured areas below to replace it.</div>}
      <GeographyPicker rows={rows} value={pending} onChange={setPending} />
      <div className="actions compact-actions">
        <button
          type="button"
          className="secondary"
          disabled={!canAdd || !pending || ids.includes(pending) || ids.length >= 20}
          onClick={() => pending && onChange(encodePreferredAreaIds([...ids, pending]))}
        >
          Add preferred area
        </button>
      </div>
      {selectedRows.length > 0 && (
        <div className="selected-area-list">
          {selectedRows.map((geo) => (
            <div className="selected-area" key={geo.id}>
              <span>{geographyPath(geo.id, rows).map((g) => g.name).join(" / ")}</span>
              <button type="button" className="link" onClick={() => onChange(encodePreferredAreaIds(ids.filter((id) => id !== geo.id)))}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ReferencesEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rows = parseReferences(value);
  function save(next: ReferenceEntry[]) {
    onChange(encodeReferences(next));
  }
  function patch(id: string, key: keyof ReferenceEntry, nextValue: string) {
    save(rows.map((row) => row.id === id ? { ...row, [key]: nextValue } : row));
  }
  return (
    <fieldset className="structured-field references-editor">
      <legend>References</legend>
      <p>Add up to three professional or community references. Provide only contacts who agreed to be listed.</p>
      {rows.map((row, index) => (
        <article className="reference-card" key={row.id}>
          <div className="panel-title">
            <h3>Reference {index + 1}</h3>
            <button type="button" className="link" onClick={() => save(rows.filter((item) => item.id !== row.id))}>Remove</button>
          </div>
          <div className="form-grid">
            <label className="field">Name<input value={row.name} onChange={(e) => patch(row.id, "name", e.target.value)} maxLength={120} /></label>
            <label className="field">Organization<input value={row.organization} onChange={(e) => patch(row.id, "organization", e.target.value)} maxLength={160} /></label>
            <label className="field">Designation<input value={row.designation} onChange={(e) => patch(row.id, "designation", e.target.value)} maxLength={120} /></label>
            <label className="field">Relationship<input value={row.relationship} onChange={(e) => patch(row.id, "relationship", e.target.value)} maxLength={120} placeholder="Supervisor, teacher, community leader…" /></label>
            <label className="field">Phone<input value={row.phone} onChange={(e) => patch(row.id, "phone", e.target.value)} maxLength={80} /></label>
            <label className="field">Email<input type="email" value={row.email} onChange={(e) => patch(row.id, "email", e.target.value)} maxLength={160} /></label>
          </div>
          <label className="field">Notes / context<textarea value={row.notes} onChange={(e) => patch(row.id, "notes", e.target.value)} maxLength={500} /></label>
        </article>
      ))}
      <button type="button" className="secondary" disabled={rows.length >= 3} onClick={() => save([...rows, blankReference()])}>Add reference</button>
    </fieldset>
  );
}

export function StructuredProfileFields({
  details,
  geographies,
  update,
}: {
  details: Record<string, string>;
  geographies: Geo[];
  update: Update;
}) {
  const education = splitEducation(details.education);
  return (
    <>
      <fieldset className="structured-field">
        <legend>Education</legend>
        <div className="form-grid">
          <label className="field">
            Highest education level
            <select value={education.level} onChange={(e) => update("education", encodeEducation(e.target.value, education.other))}>
              <option value="">Choose education level</option>
              {educationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              <option value="Other">Other</option>
            </select>
          </label>
          {education.level === "Other" && (
            <label className="field">Other education<input value={education.other} onChange={(e) => update("education", encodeEducation("Other", e.target.value))} maxLength={200} /></label>
          )}
        </div>
      </fieldset>

      <SearchableMultiSelect label="Skills" value={details.skills || ""} options={skillOptions} onChange={(value) => update("skills", value)} />
      <SearchableMultiSelect label="Languages" value={details.languages || ""} options={languageOptions} onChange={(value) => update("languages", value)} />
      <PreferredAreas rows={geographies} value={details.preferred_areas || ""} onChange={(value) => update("preferred_areas", value)} />
      <ReferencesEditor value={details.references || ""} onChange={(value) => update("references", value)} />
    </>
  );
}
