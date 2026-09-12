import { type ReactNode } from "react";
export const human = (s: string) => s.replaceAll("_", " ");
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
