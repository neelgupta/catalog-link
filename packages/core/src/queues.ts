import { Queue, type ConnectionOptions } from "bullmq";

/** All BullMQ queues. Workers for these live in apps/worker. */
export const QUEUES = {
  /** Read a client's sheet and upsert products (Milestone 3). */
  sync: "sync",
  /** Download Drive images and make thumbnails (Milestone 3). */
  images: "images",
  /** Write orders to the client's "Orders" sheet tab (Milestone 7). */
  ordersSheet: "orders-sheet",
  /** Repeatable maintenance jobs: sync scheduler tick, cleanup (Milestones 3 and 8). */
  maintenance: "maintenance",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** BullMQ connection options from REDIS_URL. Workers need maxRetriesPerRequest: null. */
export function bullConnection(url = process.env.REDIS_URL): ConnectionOptions {
  if (!url) throw new Error("REDIS_URL is not set");
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

const queues = new Map<QueueName, Queue>();

/** Producer-side queue handle (cached per process). */
export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: bullConnection(),
      defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
    });
    queues.set(name, queue);
  }
  return queue;
}
