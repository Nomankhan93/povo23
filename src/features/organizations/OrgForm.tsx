import { useEffect, useState } from "react";
import { Row } from "../../shared/legacyTypes";
import { Field, Select, human } from "../../shared/ui/FormFields";
export function OrgForm({
  value,
  busy,
  cancel,
  save,
}: {
  value: Row;
  busy: boolean;
  cancel: () => void;
  save: (d: Row) => void;
}) {
  const [d, setD] = useState(value);
  useEffect(() => setD(value), [value]);
  return (
    <section className="panel detail">
      <h2>{value.id ? "Edit organization" : "Add partner NGO"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(d);
        }}
      >
        <div className="form-grid">
          {[
            "name",
            "registration_number",
            "contact_person",
            "email",
            "phone",
            "address",
            "areas",
            "programs",
          ].map((k) => (
            <Field key={k} label={human(k)}>
              <input
                required={k === "name"}
                minLength={k === "name" ? 2 : undefined}
                maxLength={k === "name" ? 200 : 1000}
                type={k === "email" ? "email" : "text"}
                value={d[k] || ""}
                onChange={(e) => setD({ ...d, [k]: e.target.value })}
              />
            </Field>
          ))}
          <Select
            label="Status"
            values={["pending", "active", "inactive", "suspended"]}
            value={d.status}
            onChange={(v) => setD({ ...d, status: v })}
          />
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={cancel}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Save NGO
          </button>
        </div>
      </form>
    </section>
  );
}
