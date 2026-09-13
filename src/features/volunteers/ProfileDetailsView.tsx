import { type Geo } from "../geography/model";
import { human } from "../../shared/ui/FormFields";
import { parseCommaList, parseReferences, preferredAreaLabels } from "./profileStructure";

function label(key: string) {
  if (key === "preferred_areas") return "Preferred work areas";
  if (key === "union_council") return "Union Council";
  if (key === "area") return "Address";
  if (key === "experience") return "Legacy experience notes";
  return human(key);
}

export function ProfileDetailsView({
  details,
  geographies,
}: {
  details: Record<string, unknown>;
  geographies: Geo[];
}) {
  return (
    <div className="detail-fields">
      {Object.entries(details).map(([key, value]) => {
        if (key === "preferred_areas") {
          const areas = preferredAreaLabels(value, geographies);
          return (
            <div key={key}>
              <small>{label(key)}</small>
              <p>{areas.length ? areas.join(" · ") : typeof value === "string" && value && !value.startsWith("[") ? value : "—"}</p>
            </div>
          );
        }
        if (key === "references") {
          const refs = parseReferences(value);
          return (
            <div key={key} className="detail-span">
              <small>{label(key)}</small>
              {refs.length ? refs.map((ref) => (
                <p key={ref.id}>
                  <strong>{ref.name || "Reference"}</strong>
                  {ref.designation ? ` · ${ref.designation}` : ""}
                  {ref.organization ? ` · ${ref.organization}` : ""}
                  {ref.relationship ? ` · ${ref.relationship}` : ""}
                  {ref.phone ? ` · ${ref.phone}` : ""}
                  {ref.email ? ` · ${ref.email}` : ""}
                  {ref.notes ? ` — ${ref.notes}` : ""}
                </p>
              )) : <p>—</p>}
            </div>
          );
        }
        if (key === "skills" || key === "languages") {
          const rows = parseCommaList(value);
          return (
            <div key={key}>
              <small>{label(key)}</small>
              <p>{rows.join(" · ") || "—"}</p>
            </div>
          );
        }
        return (
          <div key={key}>
            <small>{label(key)}</small>
            <p>{String(value || "—")}</p>
          </div>
        );
      })}
    </div>
  );
}
