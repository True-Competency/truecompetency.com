// src/lib/ratelimit.ts
// Rate limiting utility using Upstash Redis + @upstash/ratelimit
// Only active in production — returns allowed:true in development to avoid friction

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Only instantiate Redis client if env vars are present (prod only) ─────────

function getRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const redis = getRedis();

// ── Rate limiter configs ───────────────────────────────────────────────────────
// Using sliding window algorithm — smoother than fixed window, prevents bursting

function makeLimiter(requests: number, window: string) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      requests,
      window as `${number} ${"ms" | "s" | "m" | "h" | "d"}`,
    ),
    analytics: false,
  });
}

// Support email — 2 per minute per user
export const supportLimiter = makeLimiter(2, "1 m");

// Committee invitations — 10 per minute per user
export const invitationLimiter = makeLimiter(10, "1 m");

// File upload request/confirm — 5 per minute per user
export const uploadLimiter = makeLimiter(5, "1 m");

// Avatar upload — 3 per minute per user
export const avatarLimiter = makeLimiter(3, "1 m");

// Media signed URL — 30 per minute per user
export const mediaLimiter = makeLimiter(30, "1 m");

// ── Helper function ───────────────────────────────────────────────────────────

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

/**
 * Check rate limit for a given identifier (usually user ID).
 * Returns allowed:true if no limiter configured (dev environment).
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<RateLimitResult> {
  // No limiter = dev environment, always allow
  if (!limiter) return { allowed: true };

  const { success, reset } = await limiter.limit(identifier);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}
