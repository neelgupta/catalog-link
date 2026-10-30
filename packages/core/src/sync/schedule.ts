import { prisma } from "@cataloglink/db";
import { getPlatformSettings } from "../platform";
import { parseClientSettings } from "../profile";
import { getQueue, QUEUES } from "../queues";
import { getRedis } from "../redis";

export type SyncJobData = { clientId: string; trigger: "AUTO" | "MANUAL" };
export type ImageJobData = { imageId: string };

const pendingKey = (clientId: string) => `sync:pending:${clientId}`;

/** True when a client's next automatic sync is due. */
export function isSyncDue(lastSyncedAt: Date | null, intervalMin: number, now: Date) {
  return !lastSyncedAt || now.getTime() - lastSyncedAt.getTime() >= intervalMin * 60_000;
}

/** Clients with a connected sheet, an active status and an unexpired plan whose interval has passed. */
export async function findDueClients(now = new Date()) {
  const { defaultSyncIntervalMin } = await getPlatformSettings();
  const candidates = await prisma.client.findMany({
    where: {
      status: "ACTIVE",
      sheetConnection: { spreadsheetId: { not: null }, sheetName: { not: null } },
      subscriptions: { some: { status: { in: ["TRIAL", "ACTIVE"] }, expiresAt: { gt: now } } },
    },
    select: { id: true, settings: true, sheetConnection: { select: { lastSyncedAt: true } } },
  });
  return candidates
    .filter((c) => {
      const interval = parseClientSettings(c.settings).syncIntervalMin ?? defaultSyncIntervalMin;
      return isSyncDue(c.sheetConnection?.lastSyncedAt ?? null, Math.max(1, interval), now);
    })
    .map((c) => c.id);
}

/** Marks syncs that have been RUNNING for over 15 minutes (worker crashed or restarted) as failed. */
export async function failStaleSyncs(now = new Date()) {
  const cutoff = new Date(now.getTime() - 15 * 60_000);
  const stale = await prisma.syncRun.findMany({ where: { status: "RUNNING", startedAt: { lt: cutoff } }, select: { id: true, clientId: true } });
  if (!stale.length) return 0;
  await prisma.syncRun.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: "FAILED", finishedAt: now, errorMessage: "The sync was interrupted. It will run again automatically." },
  });
  await prisma.sheetConnection.updateMany({
    where: { clientId: { in: stale.map((s) => s.clientId) }, lastStatus: "RUNNING" },
    data: { lastStatus: "FAILED" },
  });
  return stale.length;
}

/**
 * Queues a sync. While a sync for the client is waiting or running, further requests are
 * de-duplicated, so a client never has two syncs at once.
 */
export async function enqueueSync(clientId: string, trigger: SyncJobData["trigger"]) {
  if (trigger === "MANUAL") await getRedis().set(pendingKey(clientId), new Date().toISOString(), "EX", 300);
  await getQueue(QUEUES.sync).add("sync", { clientId, trigger } satisfies SyncJobData, {
    deduplication: { id: `sync:${clientId}` },
    priority: trigger === "MANUAL" ? 1 : 5,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

/** When the client pressed "Sync now" and the sync hasn't started yet. */
export async function getPendingSync(clientId: string) {
  return getRedis().get(pendingKey(clientId));
}
export async function clearPendingSync(clientId: string) {
  await getRedis().del(pendingKey(clientId));
}

export async function enqueueImages(imageIds: string[]) {
  if (!imageIds.length) return;
  await getQueue(QUEUES.images).addBulk(
    imageIds.map((imageId) => ({
      name: "image",
      data: { imageId } satisfies ImageJobData,
      opts: {
        deduplication: { id: `img:${imageId}` },
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    })),
  );
}

/** Asks the web app to drop cached catalog pages for a client (best effort). */
export async function revalidateCatalog(clientId: string) {
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (!appUrl || !process.env.INTERNAL_API_SECRET) return;
  try {
    await fetch(`${appUrl}/api/internal/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ tags: [`catalog:${clientId}`] }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn(`[revalidate] failed for client ${clientId}: ${(err as Error).message}`);
  }
}
