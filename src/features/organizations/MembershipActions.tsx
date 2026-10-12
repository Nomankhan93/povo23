import { useState } from "react";
import { Button, ConfirmDialog, Select } from "../../components/ui/FieldLanceUI";

type PendingAction = { kind: "status" | "role"; role: string; status: string; title: string; description: string; confirmLabel: string; danger?: boolean };
export function MembershipActions({ role, status, label, busy, save }: { role: string; status: string; label: string; busy: boolean; save: (role: string, status: string) => void }) {
  const [editing, setEditing] = useState(false), [nextRole, setNextRole] = useState(role), [pending, setPending] = useState<PendingAction | null>(null);
  const requestStatus = () => {
    const removing = status === "active";
    setPending({ kind: "status", role, status: removing ? "suspended" : "active", title: `${removing ? "Remove" : "Restore"} membership access?`, description: removing ? `Suspend organization membership for ${label}. This removes permissions granted by this membership; separate survey assignments, platform roles, account and history remain unchanged.` : `Restore organization membership for ${label} with its saved role.`, confirmLabel: removing ? "Remove membership access" : "Restore membership access", danger: removing });
  };
  const requestRole = () => setPending({ kind: "role", role: nextRole, status, title: "Change membership role?", description: `Change ${label} from ${role === "ngo_admin" ? "NGO admin" : "Member"} to ${nextRole === "ngo_admin" ? "NGO admin" : "Member"}.`, confirmLabel: "Save role" });
  return <div className="actions">
    {editing ? <><Select label="Membership role" disabled={busy} value={nextRole} onChange={e => setNextRole(e.target.value)} options={[{ value: "ngo_admin", label: "NGO admin" }, { value: "member", label: "Member" }]} /><Button disabled={busy || nextRole === role} onClick={requestRole}>Save role</Button><Button disabled={busy} onClick={() => { setEditing(false); setNextRole(role); }}>Cancel</Button></> : <Button disabled={busy} onClick={() => setEditing(true)}>Edit role</Button>}
    <Button disabled={busy} variant={status === "active" ? "danger" : "secondary"} onClick={requestStatus}>{status === "active" ? "Remove membership access" : "Restore membership access"}</Button>
    <ConfirmDialog open={Boolean(pending)} title={pending?.title || "Confirm membership change"} description={pending?.description} confirmLabel={pending?.confirmLabel} danger={pending?.danger} busy={busy} onCancel={() => setPending(null)} onConfirm={() => { if (!pending) return; const captured = pending; setPending(null); save(captured.role, captured.status); if (captured.kind === "role") setEditing(false); }} />
  </div>;
}
