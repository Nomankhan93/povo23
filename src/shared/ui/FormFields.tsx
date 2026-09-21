import { type ReactNode } from "react";
const publicRoleLabels: Record<string,string> = {
  volunteer: 'Field Worker', volunteer_manager: 'Field Worker manager', ngo: 'Organization',
  ngo_admin: 'Organization Admin', ngo_manager: 'Organization manager',
};
export const human = (s: string) => publicRoleLabels[s] || s.replaceAll("_", " ");
export function Badge({ value }: { value: string }) {
  return <span className={"badge " + value}>{human(value)}</span>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Select({
  value,
  onChange,
  values,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  values: string[];
  label: string;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {values.map((v) => (
          <option key={v} value={v}>
            {human(v)}
          </option>
        ))}
      </select>
    </Field>
  );
}
