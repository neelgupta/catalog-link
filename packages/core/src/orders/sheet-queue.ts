import { prisma } from "@cataloglink/db";
import { parseClientSettings } from "../profile";
import { getQueue, QUEUES } from "../queues";

export type OrderSheetJobData = { clientId: string; orderId: string };

/**
 * Queues writing an order (or its new status) to the client's "Orders" sheet tab, when the client
 * switched that on and has a sheet connected. The job reads the order's latest state when it runs,
 * so repeated requests while one is waiting collapse into one (see sheet-writer.ts).
 */
export async function enqueueOrderSheetWrite(clientId: string, orderId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { settings: true, sheetConnection: { select: { spreadsheetId: true } } },
  });
  if (!client?.sheetConnection?.spreadsheetId || !parseClientSettings(client.settings).writeOrdersTab) return false;
  await getQueue(QUEUES.ordersSheet).add("order", { clientId, orderId } satisfies OrderSheetJobData, {
    deduplication: { id: `order-sheet:${orderId}` },
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: true,
    removeOnFail: 500,
  });
  return true;
}
