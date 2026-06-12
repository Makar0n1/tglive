// Minimal in-memory sliding-window rate limiter. Sufficient for a single-node
// deployment; swap for Redis if the app is scaled horizontally.

const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const since = now - opts.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > since);

  if (hits.length >= opts.limit) {
    buckets.set(key, hits);
    return { ok: false, remaining: 0 };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, remaining: opts.limit - hits.length };
}

// Opportunistic cleanup to bound memory.
let lastSweep = Date.now();
export function sweep(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  if (now - lastSweep < 5 * 60 * 1000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const kept = hits.filter((t) => t > now - maxAgeMs);
    if (kept.length === 0) buckets.delete(key);
    else buckets.set(key, kept);
  }
}
