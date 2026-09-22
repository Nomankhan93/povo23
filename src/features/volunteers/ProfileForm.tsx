import { useState } from "react";
import { Row } from "../../shared/legacyTypes";
import { Field, Select, human } from "../../shared/ui/FormFields";
import { GeographyPicker } from "../geography/GeographyPicker";
import { type Geo } from "../geography/model";
import { StructuredProfileFields } from "./StructuredProfileFields";
import { ProfilePhoto } from "./ProfilePhoto";

export const fields = [
  ["full_name", "Full name"],
  ["phone", "Phone"],
  ["union_council", "Union Council (optional)"],
  ["address", "Full address"],
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
  saveDraft,
  publish,
  geographies,
  onPhotoChanged,
}: {
  profile: Row;
  busy: boolean;
  geographies: Geo[];
  saveDraft: (d: Row, g: string | null) => Promise<boolean>;
  publish: (d: Row, g: string | null) => Promise<boolean>;
  onPhotoChanged: () => Promise<void>;
}) {
  const [d, setD] = useState<Row>(() => {
      const initial = { ...(profile.details || {}) };
      initial.address = initial.address || initial.area || "";
      initial.union_council = initial.union_council || "";
      delete initial.area;
      return initial;
    }),
    [geo, setGeo] = useState<string | null>(profile.geography_id || null);
  const update = (key: string, value: string) => setD((current: Row) => ({ ...current, [key]: value }));
  return (
    <section className="panel detail">
      <div className="profile-editor-header">
        <ProfilePhoto
          userId={profile.user_id}
          name={d.full_name || "Volunteer"}
          photoPath={profile.photo_path || null}
          photoUpdatedAt={profile.photo_updated_at || null}
          owner
          onChanged={onPhotoChanged}
        />
        <div className="profile-editor-heading">
          <div className="panel-title">
            <h2>My volunteer profile</h2>
            <span className={"badge " + profile.status}>
              {profile.status === "verified" ? "Active" : human(profile.status)}
            </span>
          </div>
          <p>
            Your profile is editable. Save a draft before publishing, or publish when your full name, phone,
            Taluka / Tehsil / Subdivision and full address are complete. Published changes go live immediately
            and do not require admin approval. Union Council is optional.
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          publish(d, geo);
        }}
      >
        <GeographyPicker rows={geographies} value={geo} onChange={setGeo} />
        <div className="form-grid">
          {fields.map(([k, l]) => (
            <Field
              key={k}
              label={l + (k === "full_name" || k === "phone" || k === "address" ? " *" : "")}
            >
              {["address", "bio"].includes(k) ? (
                <textarea
                  maxLength={k === "address" ? 2000 : 4000}
                  value={d[k] || ""}
                  onChange={(e) => update(k, e.target.value)}
                />
              ) : (
                <input
                  maxLength={k === "full_name" ? 200 : k === "union_council" ? 200 : 1000}
                  value={d[k] || ""}
                  onChange={(e) => update(k, e.target.value)}
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
              onChange={(v) => update(k, v)}
            />
          ))}
        </div>
        <div className="notice">
          The profile availability value is a general recruitment summary. Use <strong>My Availability</strong> in the Field Worker workspace to set weekdays, working hours, unavailable dates and parallel-project capacity used by assignment conflict checks.
        </div>

        <StructuredProfileFields details={d as Record<string, string>} geographies={geographies} update={update} />

        {d.experience && (
          <div className="notice">
            Your legacy work-experience note is preserved. Use the separate Work experience section in the sidebar to add or verify individual NGO/project entries.
          </div>
        )}
        <div className="actions">
          {profile.status === "draft" && (
            <button
              type="button"
              className="secondary"
              disabled={busy || profile.status === "suspended"}
              onClick={() => saveDraft(d, geo)}
            >
              Save draft
            </button>
          )}
          <button className="primary" disabled={busy || profile.status === "suspended"}>
            {busy ? "Saving…" : profile.status === "draft" ? "Publish profile" : "Save changes"}
          </button>
        </div>
        <p className="fine">
          Provide only information and references you are authorized to share. Work experience and Private documents
          are managed from their separate sidebar sections.
        </p>
      </form>
    </section>
  );
}
