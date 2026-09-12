import { useState } from "react";
import { Row } from "../../shared/legacyTypes";
import { Select } from "../../shared/ui/FormFields";
export function AccountAccess({
  account,
  busy,
  save,
}: {
  account: Row;
  busy: boolean;
  save: (r: string, s: string) => void;
}) {
  const [role, setRole] = useState(account.platform_role),
    [status, setStatus] = useState(account.status);
  return (
    <form
      className="account-row"
      onSubmit={(e) => {
        e.preventDefault();
        save(role, status);
      }}
    >
      <strong>{account.email}</strong>
      <Select
        label="Platform role"
        value={role}
        onChange={setRole}
        values={[
          "volunteer",
          "volunteer_manager",
          "ngo_manager",
          "auditor",
          "survey_manager",
          "admin",
          "super_admin",
        ]}
      />
      <Select
        label="Account status"
        value={status}
        onChange={setStatus}
        values={["active", "suspended"]}
      />
      <button className="secondary" disabled={busy}>
        Update access
      </button>
    </form>
  );
}
