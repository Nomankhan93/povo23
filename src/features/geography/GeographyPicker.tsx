import { activeNode, Geo, geographyPath, levels } from "./model";
export function GeographyPicker({
  rows,
  value,
  onChange,
}: {
  rows: Geo[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const path = geographyPath(value, rows);
  return (
    <fieldset className="geo-picker">
      <legend>Structured location</legend>
      <p>
        Select at least a district. Continue to your taluka, UC and village/ward
        when available.
      </p>
      <div className="form-grid">
        {levels.map((level, i) => {
          const parent = i ? path[i - 1] : null;
          if (i && !parent) return null;
          const choices = rows.filter(
            (g) =>
              g.parent_id === (parent?.id || null) &&
              (g.kind === level || (i === 5 && g.kind === "ward")) &&
              activeNode(g, rows),
          );
          return (
            <label className="field" key={level}>
              <span>
                {i === 5
                  ? "Village / Ward"
                  : level === "taluka"
                    ? "Taluka / Tehsil"
                    : level === "uc"
                      ? "Union Council"
                      : level[0].toUpperCase() + level.slice(1)}
              </span>
              <select
                value={path[i]?.id || ""}
                onChange={(e) => onChange(e.target.value || parent?.id || null)}
              >
                <option value="">Choose {level}</option>
                {choices.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                {path[i] && !choices.some((g) => g.id === path[i].id) && (
                  <option value={path[i].id}>{path[i].name} (inactive)</option>
                )}
              </select>
            </label>
          );
        })}
      </div>
      {!rows.length && (
        <div className="notice">
          POEM needs to add the geography hierarchy before you can submit. You
          can save a draft meanwhile.
        </div>
      )}
    </fieldset>
  );
}
