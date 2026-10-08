function configuredOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicAppOrigin() {
  const configured = configuredOrigin(import.meta.env.VITE_PUBLIC_APP_ORIGIN);
  return configured || window.location.origin;
}

export function publicAppUrl(path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${publicAppOrigin()}${normalized}`;
}
