const RECOVERY_USER_KEY = "fieldlance:password-recovery-user";

function safeStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function recoveryRedirectError(search = location.search, hash = location.hash) {
  for (const raw of [search, hash]) {
    const value = raw.replace(/^[?#]/, "");
    if (!value) continue;
    const params = new URLSearchParams(value);
    const description = params.get("error_description");
    if (description) return description;
    const code = params.get("error_code") || params.get("error");
    if (code) return `Authentication link could not be completed (${code}).`;
  }
  return "";
}

export function recoveryUserId(storage: Storage | null = safeStorage()) {
  try {
    return storage?.getItem(RECOVERY_USER_KEY) || null;
  } catch {
    return null;
  }
}

export function rememberRecoveryUser(userId: string, storage: Storage | null = safeStorage()) {
  try {
    storage?.setItem(RECOVERY_USER_KEY, userId);
  } catch {
    // Session storage is only a reload bridge. The live auth event remains authoritative in-memory.
  }
}

export function clearRecoveryUser(storage: Storage | null = safeStorage()) {
  try {
    storage?.removeItem(RECOVERY_USER_KEY);
  } catch {
    // Best-effort cleanup for privacy-restricted browsers.
  }
}

export function canUseRecoveryForm(requested: boolean, sessionUserId: string | null, authorizedUserId: string | null) {
  return requested && Boolean(sessionUserId) && sessionUserId === authorizedUserId;
}
