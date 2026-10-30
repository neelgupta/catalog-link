import { Redis } from "ioredis";

declare global {
  var __cataloglinkRedis: Redis | undefined;
}

/** Shared Redis connection for caching and rate limits (not for BullMQ workers). */
export function getRedis(): Redis {
  if (!globalThis.__cataloglinkRedis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    globalThis.__cataloglinkRedis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
  }
  return globalThis.__cataloglinkRedis;
}
