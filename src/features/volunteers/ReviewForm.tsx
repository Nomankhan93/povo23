import { useState } from "react";
import { Row } from "../../shared/legacyTypes";
import { Field, Select, human } from "../../shared/ui/FormFields";
export function ReviewForm({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (s: string, n: string, c: Row) => void;
}) {
  const [status, setStatus] = useState("verified");
  return (
    <form
      className="review"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit(status, String(f.get("note")), {
          profile_complete: f.get("profile_complete") === "on",
          contact_checked: f.get("contact_checked") === "on",
          location_checked: f.get("location_checked") === "on",
        });
      }}
    >
      <h3>POEM review decision</h3>
      <p className="fine">
        For approval, review all current documents and complete these checks.
        These checks do not certify legal identity.
      </p>
      {["profile_complete", "contact_checked", "location_checked"].map((k) => (
        <label key={k} className="checklabel">
          <input name={k} type="checkbox" required={status === "verified"} />
          {human(k)}
        </label>
      ))}
      <Select
        label="Decision"
        value={status}
        onChange={setStatus}
        values={["verified", "correction_required", "suspended"]}
      />
      <Field label="Review note">
        <textarea
          name="note"
          minLength={3}
          maxLength={2000}
          required
          placeholder="State what you checked or what needs correction."
        />
      </Field>
      <button className="primary" disabled={busy}>
        Save decision
      </button>
    </form>
  );
}
