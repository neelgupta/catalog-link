import "./load-env";
import { getEnv } from "@cataloglink/core/env";
import { googleSourceFor } from "@cataloglink/core/google";
import { processImage } from "@cataloglink/core/images";
import { bullConnection, getQueue, QUEUES } from "@cataloglink/core/queues";
import { getRedis } from "@cataloglink/core/redis";
import {
  clearPendingSync,
  enqueueImages,
  enqueueSync,
  failStaleSyncs,
  findDueClients,
  revalidateCatalog,
  runSync,
  type ImageJobData,
  type SyncJobData,
} from "@cataloglink/core/sync";
import { prisma } from "@cataloglink/db";
import { Worker } from "bullmq";
import { logger } from "./logger";

const HEARTBEAT_KEY = "worker:heartbeat";

async function main() {
  getEnv();
  await prisma.$queryRaw`SELECT 1`;
  logger.info("database ok");
  logger.info({ redis: await getRedis().ping() }, "redis ok");
  const connection = bullConnection();

  // ── Sheet sync ────────────────────────────────────────────────────────
  const sync = new Worker<SyncJobData>(
    QUEUES.sync,
    async (job) => {
      const { clientId, trigger } = job.data;
      await clearPendingSync(clientId);
      const conn = await prisma.sheetConnection.findUnique({ where: { clientId } });
      if (!conn) return { skipped: "not connected" };
      const started = Date.now();
      const result = await runSync(clientId, trigger, {
        source: () => googleSourceFor(conn),
        enqueueImages,
        onCatalogChanged: revalidateCatalog,
      });
      logger.info({ clientId, trigger, ...result, ms: Date.now() - started }, "sync finished");
      return result;
    },
    // Spread load across clients and stay well inside Google's per-minute quota.
    { connection, concurrency: 3, limiter: { max: 5, duration: 1000 } },
  );

  // ── Product images ────────────────────────────────────────────────────
  const images = new Worker<ImageJobData>(
    QUEUES.images,
    async (job) => {
      const image = await prisma.productImage.findUnique({
        where: { id: job.data.imageId },
        select: { clientId: true, driveFileId: true, client: { select: { sheetConnection: true } } },
      });
      if (!image) return "missing";
      const conn = image.client.sheetConnection;
      if (image.driveFileId && !conn) {
        await prisma.productImage.update({ where: { id: job.data.imageId }, data: { status: "FAILED", error: "Google Sheet is disconnected" } });
        return "failed";
      }
      // Transient Google errors throw, and BullMQ retries with backoff.
      const result = await processImage(job.data.imageId, () => googleSourceFor(conn!));
      if (result === "ready") imagesReady.add(image.clientId);
      return result;
    },
    { connection, concurrency: 4, limiter: { max: 10, duration: 1000 } },
  );
  // New thumbnails should show on the catalog promptly; refresh at most every few seconds per client.
  const imagesReady = new Set<string>();
  const flushImages = setInterval(() => {
    for (const clientId of imagesReady) void revalidateCatalog(clientId);
    imagesReady.clear();
  }, 5000);

  // ── Maintenance: heartbeat + sync scheduler ───────────────────────────
  const maintenance = new Worker(
    QUEUES.maintenance,
    async (job) => {
      switch (job.name) {
        case "heartbeat":
          await getRedis().set(HEARTBEAT_KEY, new Date().toISOString(), "EX", 180);
          return;
        case "sync-tick": {
          const stale = await failStaleSyncs();
          const due = await findDueClients();
          for (const clientId of due) await enqueueSync(clientId, "AUTO");
          if (due.length || stale) logger.info({ due: due.length, stale }, "sync tick");
          return { due: due.length };
        }
        default:
          throw new Error(`Unknown maintenance job: ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  );

  for (const [name, worker] of Object.entries({ sync, images, maintenance })) {
    worker.on("failed", (job, err) => logger.error({ queue: name, job: job?.name, data: job?.data, err: err.message }, "job failed"));
  }

  const maintenanceQueue = getQueue(QUEUES.maintenance);
  await maintenanceQueue.upsertJobScheduler("heartbeat", { every: 60_000 }, { name: "heartbeat", opts: { removeOnComplete: true, removeOnFail: 100 } });
  await maintenanceQueue.upsertJobScheduler("sync-tick", { every: 60_000 }, { name: "sync-tick", opts: { removeOnComplete: true, removeOnFail: 100 } });
  logger.info({ queues: [QUEUES.sync, QUEUES.images, QUEUES.maintenance] }, "worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    clearInterval(flushImages);
    await Promise.all([sync.close(), images.close(), maintenance.close()]);
    await Promise.all([maintenanceQueue.close(), getQueue(QUEUES.sync).close(), getQueue(QUEUES.images).close()]);
    getRedis().disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "worker failed to start");
  process.exit(1);
});
