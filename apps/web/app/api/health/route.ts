import { getRedis } from "@cataloglink/core/redis";
import { prisma } from "@cataloglink/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness of the web app and its dependencies, including the worker heartbeat. */
export async function GET() {
  const check = async (fn: () => Promise<unknown>) => {
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      return { ok: false, value: err instanceof Error ? err.message : String(err) };
    }
  };

  const [database, redis, worker] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`.then(() => "up")),
    check(() => getRedis().ping()),
    check(async () => {
      const beat = await getRedis().get("worker:heartbeat");
      if (!beat) throw new Error("no heartbeat in the last 3 minutes");
      return beat;
    }),
  ]);

  const ok = database.ok && redis.ok;
  return NextResponse.json(
    { ok, database, redis, worker },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
