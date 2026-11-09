// Server-only failed-login throttle: 5 failures per email+IP locks that pair for 15 minutes.
//
// State is in process memory. On Vercel each warm function instance keeps its own map, so
// this is a best-effort brake on password guessing, not a global guarantee. Move it to a
// shared store (e.g. Upstash Redis) if a hard limit is ever required.

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  firstAt: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

const keyOf = (email: string, ip: string) => `${email.trim().toLowerCase()}|${ip}`;

function prune(now: number) {
  if (entries.size < 1000) return;
  for (const [k, e] of entries) {
    if (e.lockedUntil <= now && now - e.firstAt > LOCKOUT_MS) entries.delete(k);
  }
}

/** Milliseconds left on the lock for this email+IP, or 0 if sign-in may be attempted. */
export function lockRemainingMs(email: string, ip: string, now = Date.now()): number {
  const e = entries.get(keyOf(email, ip));
  return e && e.lockedUntil > now ? e.lockedUntil - now : 0;
}

/** Records a failure. Returns the lock length in ms if this failure triggered a lock, else 0. */
export function recordFailure(email: string, ip: string, now = Date.now()): number {
  prune(now);
  const k = keyOf(email, ip);
  let e = entries.get(k);
  // Failures older than the lockout window no longer count.
  if (!e || now - e.firstAt > LOCKOUT_MS || (e.lockedUntil && e.lockedUntil <= now)) {
    e = { failures: 0, firstAt: now, lockedUntil: 0 };
  }
  e.failures += 1;
  if (e.failures >= MAX_FAILURES) e.lockedUntil = now + LOCKOUT_MS;
  entries.set(k, e);
  return e.lockedUntil > now ? LOCKOUT_MS : 0;
}

export function clearFailures(email: string, ip: string): void {
  entries.delete(keyOf(email, ip));
}

/** Test helper. */
export function __resetThrottle(): void {
  entries.clear();
}
