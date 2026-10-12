import { Row } from "../../shared/legacyTypes";
import { Button, FieldGroup, FormActions, Select } from "../../components/ui/FieldLanceUI";
export function MembershipForm({ orgs, accounts, busy, save }: { orgs: Row[]; accounts: Row[]; busy: boolean; save: (o: string, u: string, r: string, s: string) => void }) {
  return <form className="membership" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); save(String(f.get("org")), String(f.get("user")), String(f.get("role")), String(f.get("status"))); }}>
    <FieldGroup columns={2}>
      <Select label="Organization" name="org" required options={[{ value: "", label: "Choose NGO" }, ...orgs.map(o => ({ value: String(o.id), label: String(o.name) }))]} />
      <Select label="Registered account" name="user" required options={[{ value: "", label: "Choose account" }, ...accounts.map(a => ({ value: String(a.id), label: String(a.email) }))]} />
      <Select label="Role" name="role" options={[{ value: "ngo_admin", label: "NGO admin" }, { value: "member", label: "Member" }]} />
      <Select label="Status" name="status" options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} />
    </FieldGroup>
    <FormActions><Button variant="primary" disabled={busy}>Save membership</Button></FormActions>
  </form>;
}
