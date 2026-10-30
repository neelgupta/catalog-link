"use server";

import { changeOrderStatus, setPaymentReceived } from "@cataloglink/core/orders";
import { enqueueOrderSheetWrite } from "@cataloglink/core/orders-sheet";
import type { OrderStatus } from "@cataloglink/db";
import { revalidatePath } from "next/cache";
import { type ActionState, errorState } from "@/lib/actions";
import { requireClient } from "@/lib/auth";
import { revalidateClientCatalog } from "@/lib/catalog-cache";

const MESSAGES: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Order confirmed.",
  PACKED: "Marked as packed.",
  DISPATCHED: "Marked as dispatched.",
  DELIVERED: "Marked as delivered.",
  REJECTED: "Order rejected. The stock was added back.",
  CANCELLED: "Order cancelled. The stock was added back.",
};

async function afterChange(clientId: string, orderId: string, stockChanged: boolean) {
  if (stockChanged) revalidateClientCatalog(clientId);
  await enqueueOrderSheetWrite(clientId, orderId).catch((e) => console.error("[orders-sheet] enqueue failed", e));
  revalidatePath("/app", "layout");
}

export async function changeStatusAction(orderId: string, to: OrderStatus, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId } = await requireClient();
  const reason = String(formData.get("reason") ?? "").slice(0, 300);
  const note = String(formData.get("note") ?? "").slice(0, 300);
  try {
    await changeOrderStatus(clientId, orderId, to, { userId, reason, note });
  } catch (err) {
    return errorState(err, { reason, note });
  }
  await afterChange(clientId, orderId, to === "REJECTED" || to === "CANCELLED");
  return { ok: true, message: MESSAGES[to] };
}

export async function paymentAction(orderId: string, received: boolean): Promise<ActionState> {
  const { clientId } = await requireClient();
  try {
    await setPaymentReceived(clientId, orderId, received);
  } catch (err) {
    return errorState(err);
  }
  await afterChange(clientId, orderId, false);
  return { ok: true, message: received ? "Payment marked as received." : "Payment marked as not received." };
}
