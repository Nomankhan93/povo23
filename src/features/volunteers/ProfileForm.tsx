import { useState } from "react";
import { Row } from "../../shared/legacyTypes";
import { Badge, Field, Select, human } from "../../shared/ui/FormFields";
import { GeographyPicker } from "../geography/GeographyPicker";
import { type Geo } from "../geography/model";

export const fields = [
  ["full_name", "Full name"],
  ["phone", "Phone"],
  ["union_council", "Union Council (optional)"],
  ["address", "Full address"],
  ["education", "Education"],
  ["skills", "Skills (comma separated)"],
  ["languages", "Languages"],
  ["experience", "Work and survey experience"],
  ["preferred_areas", "Preferred work areas"],
  ["references", "References"],
  ["bio", "About you"],
];
export const options: Record<string, string[]> = {
  availability: ["Part-time", "Full-time", "Weekends", "Unavailable"],
  preference: ["Volunteer", "Paid", "Paid or volunteer"],
  transport: ["None", "Public transport", "Motorcycle", "Car"],
  smartphone: ["Available", "Not available"],
};
export function ProfileForm({
  profile,
  busy,
  save,
  geographies,
}: {
  profile: Row;
  busy: boolean;
  geographies: Geo[];
  save: (d: Row, s: boolean, g: string | null) => Promise<boolean>;
}) {
  const [d, setD] = useState<Row>(() => {
      const initial = { ...(profile.details || {}) };
      initial.address = initial.address || initial.area || "";
      initial.union_council = initial.union_council || "";
      delete initial.area;
      return initial;
    }),
    [geo, setGeo] = useState<string | null>(profile.geography_id || null);
  return (
    <section className="panel detail">
      <div className="panel-title">
        <h2>My volunteer profile</h2>
        <Badge value={profile.status} />
      </div>
      {profile.review_note && (
        <div className="notice">POEM review: {profile.review_note}</div>
      )}
      <p>
        Save a draft at any time. Submit once your full name, phone, Taluka / Tehsil / Subdivision
        and full address are complete. Union Council is optional and entered manually.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(d, true, geo);
        }}
      >
        <GeographyPicker rows={geographies} value={geo} onChange={setGeo} />
        <div className="form-grid">
          {fields.map(([k, l]) => (
            <Field
              key={k}
              label={
                l +
                (k === "full_name" || k === "phone" || k === "address" ? " *" : "")
              }
            >
              {["address", "experience", "references", "bio"].includes(k) ? (
                <textarea
                  maxLength={k === "address" ? 2000 : 4000}
                  value={d[k] || ""}
                  onChange={(e) => setD({ ...d, [k]: e.target.value })}
                />
              ) : (
                <input
                  maxLength={k === "full_name" ? 200 : k === "union_council" ? 200 : 1000}
                  value={d[k] || ""}
                  onChange={(e) => setD({ ...d, [k]: e.target.value })}
                />
              )}
            </Field>
          ))}
          {Object.entries(options).map(([k, vals]) => (
            <Select
              key={k}
              label={human(k)}
              value={d[k] || ""}
              values={["", ...vals]}
              onChange={(v) => setD({ ...d, [k]: v })}
            />
          ))}
        </div>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || profile.status === "suspended"}
            onClick={() => save(d, false, geo)}
          >
            Save draft
          </button>
          <button
            className="primary"
            disabled={busy || profile.status === "suspended"}
          >
            {busy ? "Saving…" : "Submit for verification"}
          </button>
        </div>
        <p className="fine">
          Provide only information and references you are authorized to share.
          Upload supporting evidence in the Private documents section below.
        </p>
      </form>
    </section>
  );
}
