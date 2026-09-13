import { activeNode, Geo, geographyPath } from "./model";

const provinceOrder = [
  "Sindh",
  "Punjab",
  "Khyber Pakhtunkhwa (KP)",
  "Balochistan",
  "Islamabad Capital Territory",
  "Azad Jammu & Kashmir (AJK)",
  "Gilgit-Baltistan (GB)",
];

function isReferenceRoot(g: Geo) {
  return g.kind === "province" && g.parent_id === null && g.code.startsWith("PKREF-");
}

function isSynthetic(g: Geo) {
  const source = (g.source_note || "").toLowerCase();
  return source.includes("synthetic") || g.name.toLowerCase().includes("integration fixture");
}

function sortByName<T extends Geo>(rows: T[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

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
  const selectedProvince = path.find((g) => g.kind === "province") || null;
  const selectedDivision = path.find((g) => g.kind === "division") || null;
  const selectedDistrict = path.find((g) => g.kind === "district") || null;
  const selectedTaluka = path.find((g) => g.kind === "taluka") || null;

  const provinces = rows
    .filter((g) => isReferenceRoot(g) && activeNode(g, rows) && !isSynthetic(g))
    .sort((a, b) => {
      const ai = provinceOrder.indexOf(a.name);
      const bi = provinceOrder.indexOf(b.name);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name);
    });

  const divisions = selectedProvince
    ? sortByName(
        rows.filter(
          (g) =>
            g.parent_id === selectedProvince.id &&
            g.kind === "division" &&
            activeNode(g, rows) &&
            !isSynthetic(g),
        ),
      )
    : [];

  const districtParent = divisions.length ? selectedDivision : selectedProvince;
  const districts = districtParent
    ? sortByName(
        rows.filter(
          (g) =>
            g.parent_id === districtParent.id &&
            g.kind === "district" &&
            activeNode(g, rows) &&
            !isSynthetic(g),
        ),
      )
    : [];

  const talukas = selectedDistrict
    ? sortByName(
        rows.filter(
          (g) =>
            g.parent_id === selectedDistrict.id &&
            g.kind === "taluka" &&
            activeNode(g, rows) &&
            !isSynthetic(g),
        ),
      )
    : [];

  const legacySelection =
    value && (!selectedProvince || !selectedProvince.code.startsWith("PKREF-"));

  return (
    <fieldset className="geo-picker">
      <legend>Structured location</legend>
      <p>
        Select Province / Territory, Division, District and Taluka / Tehsil / Subdivision. Islamabad
        Capital Territory has no administrative Division, so the District follows the
        Territory directly. Enter Union Council manually below.
      </p>
      {legacySelection && (
        <div className="notice">
          Your previous location is outside the current Pakistan reference hierarchy.
          Please select your location again before submitting.
        </div>
      )}
      <div className="form-grid">
        <label className="field">
          <span>Province / Territory</span>
          <select
            value={selectedProvince?.code.startsWith("PKREF-") ? selectedProvince.id : ""}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">Choose Province / Territory</option>
            {provinces.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        {selectedProvince && divisions.length > 0 && (
          <label className="field">
            <span>Division</span>
            <select
              value={selectedDivision?.id || ""}
              onChange={(e) => onChange(e.target.value || selectedProvince.id)}
            >
              <option value="">Choose Division</option>
              {divisions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {districtParent && (
          <label className="field">
            <span>District</span>
            <select
              value={selectedDistrict?.id || ""}
              onChange={(e) => onChange(e.target.value || districtParent.id)}
            >
              <option value="">Choose District</option>
              {districts.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {selectedDistrict && (
          <label className="field">
            <span>Taluka / Tehsil / Subdivision</span>
            <select
              value={selectedTaluka?.id || ""}
              onChange={(e) => onChange(e.target.value || selectedDistrict.id)}
            >
              <option value="">Choose Taluka / Tehsil / Subdivision</option>
              {talukas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!provinces.length && (
        <div className="notice">
          Pakistan reference geography has not been loaded yet. Apply the 2.7.1
          geography migration before profile submission.
        </div>
      )}
    </fieldset>
  );
}
