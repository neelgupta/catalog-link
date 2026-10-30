import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rateLimit } from "./ratelimit";

// Uses Redis logical database 15 so tests never touch app data.
const redis = new Redis(process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15", { lazyConnect: true });

describe("rateLimit (Redis)", () => {
  beforeAll(async () => {
    await redis.connect();
    await redis.flushdb();
  });
  afterAll(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("allows up to the limit, then blocks with a retry time", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("test:a", 3, 60, redis));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[2]!.remaining).toBe(0);
    expect(results[3]!.retryAfterSec).toBeGreaterThan(0);
    expect(await redis.ttl("rl:test:a")).toBeGreaterThan(0);
  });

  it("keeps keys independent", async () => {
    await rateLimit("test:b", 1, 60, redis);
    expect((await rateLimit("test:c", 1, 60, redis)).ok).toBe(true);
    expect((await rateLimit("test:b", 1, 60, redis)).ok).toBe(false);
  });
});
