/** Invariant check; throws Error so callers can distinguish bugs from user-facing failures. */
export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
