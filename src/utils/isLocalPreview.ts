export function isLocalPreviewHost() {
  if (typeof window === 'undefined') {
    return false;
  }

  const host = String(window.location.hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
