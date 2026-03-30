/** Invariant check; throws Error so callers can distinguish bugs from user-facing failures. */
export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
