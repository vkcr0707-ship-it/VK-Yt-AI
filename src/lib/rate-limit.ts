type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function limitFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function rateLimit(key: string, scope: string, options: { limit?: number; windowMs?: number } = {}): { allowed: boolean; retryAfterSec: number } {
  const limit = options.limit ?? limitFromEnv("RATE_LIMIT_REQUESTS", 60);
  const windowMs = options.windowMs ?? limitFromEnv("RATE_LIMIT_WINDOW_MS", 60_000);
  const now = Date.now();
  const bucketKey = `${scope}:${key}`;
  const current = buckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
}
