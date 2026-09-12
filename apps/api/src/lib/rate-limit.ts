import type { FastifyRequest } from "fastify";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const CLEANUP_INTERVAL = 60_000;

let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();

  if (now - lastCleanup < CLEANUP_INTERVAL) {
    return;
  }

  lastCleanup = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: FastifyRequest): string {
  return request.ip || "unknown";
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
} {
  cleanup();

  const now = Date.now();

  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = {
      count: 0,
      resetAt: now + windowMs
    };

    buckets.set(key, bucket);
  }

  bucket.count++;

  const remaining = Math.max(0, limit - bucket.count);

  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(
        (bucket.resetAt - now) / 1000
      )
    };
  }

  return {
    allowed: true,
    remaining,
    retryAfter: 0
  };
}