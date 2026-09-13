import { geographyPath, type Geo } from "../geography/model";

export const educationOptions = [
  "No formal education",
  "Primary",
  "Middle",
  "Matric / SSC",
  "Intermediate / HSSC",
  "Diploma / Technical",
  "Bachelor's",
  "Master's",
  "MPhil",
  "PhD",
] as const;

export const skillOptions = [
  "Survey / Data Collection",
  "Community Mobilization",
  "Field Verification",
  "Data Entry",
  "KoboToolbox / ODK",
  "MS Office / Google Workspace",
  "Monitoring & Evaluation",
  "Report Writing",
  "First Aid",
  "Teaching / Tutoring",
  "Counselling / Psychosocial Support",
  "Health Awareness",
  "Disaster Response",
  "Relief Distribution",
  "Livelihood Assessment",
  "Photography / Videography",
  "Social Media",
  "Graphic Design",
  "Fundraising",
  "Team Leadership",
  "Public Speaking",
  "Driving",
  "Motorcycle Riding",
] as const;

export const languageOptions = [
  "Urdu",
  "English",
  "Sindhi",
  "Punjabi",
  "Pashto",
  "Balochi",
  "Saraiki",
  "Brahui",
  "Hindko",
  "Kashmiri",
  "Shina",
  "Balti",
  "Burushaski",
] as const;

export type ReferenceEntry = {
  id: string;
  name: string;
  organization: string;
  designation: string;
  phone: string;
  email: string;
  relationship: string;
  notes: string;
};

export function parseCommaList(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
}

export function encodeCommaList(values: string[]): string {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].join(", ");
}

export function splitEducation(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { level: "", other: "" };
  if ((educationOptions as readonly string[]).includes(text)) return { level: text, other: "" };
  if (text === "Other:" || text.startsWith("Other: ")) return { level: "Other", other: text.slice(6).trim() };
  return { level: "Other", other: text };
}

export function encodeEducation(level: string, other: string) {
  return level === "Other" ? (other.trim() ? `Other: ${other.trim()}` : "Other:") : level;
}

export function parsePreferredAreaIds(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const text = value.trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))];
    } catch {
      return [];
    }
  }
  return [];
}

export function encodePreferredAreaIds(ids: string[]) {
  return JSON.stringify([...new Set(ids)].slice(0, 20));
}

export function preferredAreaLabels(value: unknown, geographies: Geo[]) {
  return parsePreferredAreaIds(value).map((id) =>
    geographyPath(id, geographies)
      .map((g) => g.name)
      .join(" / "),
  ).filter(Boolean);
}

function referenceId() {
  return globalThis.crypto?.randomUUID?.() || `ref-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function blankReference(): ReferenceEntry {
  return {
    id: referenceId(),
    name: "",
    organization: "",
    designation: "",
    phone: "",
    email: "",
    relationship: "",
    notes: "",
  };
}

export function parseReferences(value: unknown): ReferenceEntry[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const text = value.trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 3).map((row) => ({
          id: typeof row?.id === "string" && row.id ? row.id : referenceId(),
          name: typeof row?.name === "string" ? row.name : "",
          organization: typeof row?.organization === "string" ? row.organization : "",
          designation: typeof row?.designation === "string" ? row.designation : "",
          phone: typeof row?.phone === "string" ? row.phone : "",
          email: typeof row?.email === "string" ? row.email : "",
          relationship: typeof row?.relationship === "string" ? row.relationship : "",
          notes: typeof row?.notes === "string" ? row.notes : "",
        }));
      }
    } catch {
      // Fall through to legacy conversion.
    }
  }
  return [{ ...blankReference(), name: "Legacy reference", notes: text }];
}

export function encodeReferences(rows: ReferenceEntry[]) {
  return JSON.stringify(
    rows.slice(0, 3).map((row) => ({
      id: row.id,
      name: row.name.trim().slice(0, 120),
      organization: row.organization.trim().slice(0, 160),
      designation: row.designation.trim().slice(0, 120),
      phone: row.phone.trim().slice(0, 80),
      email: row.email.trim().slice(0, 160),
      relationship: row.relationship.trim().slice(0, 120),
      notes: row.notes.trim().slice(0, 500),
    })),
  );
}
