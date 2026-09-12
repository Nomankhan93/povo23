import { Row } from "../../shared/legacyTypes";
import { Field } from "../../shared/ui/FormFields";
export function MembershipForm({
  orgs,
  accounts,
  busy,
  save,
}: {
  orgs: Row[];
  accounts: Row[];
  busy: boolean;
  save: (o: string, u: string, r: string, s: string) => void;
}) {
  return (
    <form
      className="membership"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save(
          String(f.get("org")),
          String(f.get("user")),
          String(f.get("role")),
          String(f.get("status")),
        );
      }}
    >
      <Field label="Organization">
        <select name="org" required>
          <option value="">Choose NGO</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Registered account">
        <select name="user" required>
          <option value="">Choose account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Role">
        <select name="role">
          <option value="ngo_admin">NGO admin</option>
          <option value="member">Member</option>
        </select>
      </Field>
      <Field label="Status">
        <select name="status">
          <option>active</option>
          <option>suspended</option>
        </select>
      </Field>
      <button className="primary" disabled={busy}>
        Save membership
      </button>
    </form>
  );
}
