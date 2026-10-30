import type { Redis } from "ioredis";
import { getRedis } from "./redis";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

/**
 * Fixed-window rate limit: at most `limit` hits per `windowSec` for `key`.
 * The first hit in a window sets the expiry, so the window starts on first use.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  redis: Redis = getRedis(),
): Promise<RateLimitResult> {
  const fullKey = `rl:${key}`;
  const [[, count], [, ttl]] = (await redis
    .multi()
    .incr(fullKey)
    .ttl(fullKey)
    .exec()) as [[unknown, number], [unknown, number]];

  if (ttl < 0) await redis.expire(fullKey, windowSec);

  const ok = count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - count),
    retryAfterSec: ok ? 0 : ttl > 0 ? ttl : windowSec,
  };
}

/** Preset limits (docs/IMPLEMENTATION.md §6). */
export const LIMITS = {
  otpSendPerMobile: { limit: 3, windowSec: 10 * 60 },
  otpSendPerIp: { limit: 20, windowSec: 60 * 60 },
  loginPerIp: { limit: 10, windowSec: 10 * 60 },
} as const;
