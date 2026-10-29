// Spaces request starts evenly so a process stays under a requests-per-minute limit.
// Meta's limits are per team, so one limiter is shared by every provider in a process.
export function rateLimiter(rpm: number) {
  let next = 0;
  return async () => {
    if (!Number.isFinite(rpm) || rpm <= 0) return;
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + 60000 / rpm;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
}
// Transient failures worth retrying: rate limits, server errors, timeouts, network.
export const RETRIES = 5;
export function backoffMs(attempt: number, retryAfter?: string | null) {
  const header = Number(retryAfter);
  const base = Math.min(30000, 500 * 2 ** attempt);
  return (
    Math.max(Number.isFinite(header) ? header * 1000 : 0, base) +
    Math.random() * 250
  );
}
