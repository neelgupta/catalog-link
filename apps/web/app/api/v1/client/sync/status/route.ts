import { getPendingSync } from "@cataloglink/core/sync";
import { prisma } from "@cataloglink/db";
import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Polled by the sheet page while a sync is queued or running. */
export async function GET() {
  const { clientId } = await requireClient();
  const [pending, lastRun, pendingImages] = await Promise.all([
    getPendingSync(clientId),
    prisma.syncRun.findFirst({
      where: { clientId },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, startedAt: true, finishedAt: true },
    }),
    prisma.productImage.count({ where: { clientId, status: "PENDING" } }),
  ]);
  return NextResponse.json(
    { pendingSince: pending, lastRun, pendingImages },
    { headers: { "cache-control": "no-store" } },
  );
}
