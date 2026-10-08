export type DiagnosticArea =
  | "app"
  | "auth"
  | "database"
  | "rpc"
  | "workspace"
  | "offline"
  | "map"
  | "routing"
  | "notification"
  | "service_worker";

export type DiagnosticContext = Record<string, string | number | boolean | null | undefined>;

export type DiagnosticRecord = {
  id: string;
  area: DiagnosticArea;
  occurredAt: string;
  name: string;
  message: string;
  code?: string;
  status?: number;
  context: Record<string, string | number | boolean>;
};

const MAX_DIAGNOSTICS = 80;
const MAX_FINGERPRINTS = 160;
const MAX_MESSAGE = 240;
const DEDUPE_WINDOW_MS = 10_000;
const SAFE_CONTEXT_KEYS = new Set([
  "operation",
  "phase",
  "routeKind",
  "workspaceMode",
  "sourceKind",
  "status",
  "online",
  "component",
  "eventType",
  "httpStatus",
  "errorCode",
  "retryable",
  "release",
]);

const recent: DiagnosticRecord[] = [];
const lastFingerprints = new Map<string, { at: number; record: DiagnosticRecord }>();
let globalDiagnosticsInstalled = false;

function diagnosticId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `FL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `FL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function sanitizeDiagnosticText(value: unknown) {
  let text = typeof value === "string" ? value : value instanceof Error ? value.message : String(value ?? "Unknown error");
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[token]")
    .replace(/([?&](?:code|token|token_hash|access_token|refresh_token|password|secret)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/\b[A-F0-9]{8}-[A-F0-9]{4}-[1-5][A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}\b/gi, "[id]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/(?:\+?92|0)?3\d{2}[\s-]?\d{7}\b/g, "[phone]")
    .replace(/\b\d{11,16}\b/g, "[number]")
    .replace(/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, "[coordinates]")
    .replace(/https?:\/\/[^\s?#]+\?[^\s#]+/gi, match => match.split("?")[0] + "?[query-redacted]")
    .replace(/\b(?:password|secret|token|authorization|answer|response|beneficiary|phone|email|latitude|longitude)\s*[:=]\s*[^,;\s]+/gi, match => match.split(/[:=]/)[0] + "=[redacted]");
  return text.slice(0, MAX_MESSAGE) || "Unexpected error";
}

function errorDetails(error: unknown) {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const statusValue = candidate.status ?? candidate.statusCode;
  const status = typeof statusValue === "number" ? statusValue : typeof statusValue === "string" && /^\d{3}$/.test(statusValue) ? Number(statusValue) : undefined;
  const codeValue = candidate.code;
  return {
    name: sanitizeDiagnosticText(candidate.name || (error instanceof Error ? error.name : "Error")).slice(0, 60),
    message: sanitizeDiagnosticText(error instanceof Error ? error.message : candidate.message ?? error),
    code: typeof codeValue === "string" || typeof codeValue === "number" ? sanitizeDiagnosticText(codeValue).slice(0, 40) : undefined,
    status,
  };
}

function safeContext(context: DiagnosticContext = {}) {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!SAFE_CONTEXT_KEYS.has(key) || value == null) continue;
    if (typeof value === "boolean" || typeof value === "number") result[key] = value;
    else result[key] = sanitizeDiagnosticText(value).slice(0, 80);
  }
  return result;
}

export function reportDiagnostic(area: DiagnosticArea, error: unknown, context: DiagnosticContext = {}) {
  const details = errorDetails(error);
  const safe = safeContext(context);
  const fingerprint = `${area}|${safe.operation || ""}|${details.code || ""}|${details.status || ""}|${details.message}`;
  const now = Date.now();
  const previous = lastFingerprints.get(fingerprint);
  if (previous && now - previous.at < DEDUPE_WINDOW_MS) return previous.record;

  const record: DiagnosticRecord = {
    id: diagnosticId(),
    area,
    occurredAt: new Date(now).toISOString(),
    name: details.name,
    message: details.message,
    ...(details.code ? { code: details.code } : {}),
    ...(details.status ? { status: details.status } : {}),
    context: safe,
  };
  recent.push(record);
  if (recent.length > MAX_DIAGNOSTICS) recent.splice(0, recent.length - MAX_DIAGNOSTICS);
  lastFingerprints.set(fingerprint, { at: now, record });
  for (const [key, value] of lastFingerprints) if (now - value.at > DEDUPE_WINDOW_MS) lastFingerprints.delete(key);
  while (lastFingerprints.size > MAX_FINGERPRINTS) lastFingerprints.delete(lastFingerprints.keys().next().value as string);

  // Never pass the raw Error/context to console or browser events; both can contain PII or credentials.
  if (typeof console !== "undefined") console.error("[FieldLance diagnostic]", record);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("fieldlance:diagnostic", { detail: record }));
  return record;
}

export function readRecentDiagnostics() {
  return recent.map(item => ({ ...item, context: { ...item.context } }));
}

export function userFacingError(error: unknown, fallback: string) {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const status = typeof candidate.status === "number" ? candidate.status : Number(candidate.status || 0);
  const message = sanitizeDiagnosticText(candidate.message ?? (error instanceof Error ? error.message : error)).toLowerCase();
  if (status === 401 || /jwt|session|refresh token|not authenticated/.test(message)) return "Your sign-in session is no longer valid. Sign in again to continue.";
  if (status === 403 || code === "42501" || /permission|not authorized|access required/.test(message)) return "Your access has changed or this action is no longer available. Refresh your workspace and try again.";
  if (/failed to fetch|network|load failed|networkerror|connection/.test(message)) return "FieldLance could not reach the server. Check your connection and try again.";
  if (code === "23505") return "This record already exists. Refresh the current data before trying again.";
  return fallback;
}

export function installGlobalDiagnostics() {
  if (typeof window === "undefined" || globalDiagnosticsInstalled) return () => {};
  globalDiagnosticsInstalled = true;
  const onError = (event: ErrorEvent) => {
    reportDiagnostic("app", event.error || event.message, { operation: "global_error", eventType: "error", online: navigator.onLine });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportDiagnostic("app", event.reason, { operation: "unhandled_rejection", eventType: "unhandledrejection", online: navigator.onLine });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    globalDiagnosticsInstalled = false;
  };
}
