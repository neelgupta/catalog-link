import { STATUS_LABEL } from "@cataloglink/core/orders";
import type { OrderStatus } from "@cataloglink/db";

const TONES: Record<OrderStatus, string> = {
  PLACED: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-indigo-100 text-indigo-800",
  PARTIALLY_CONFIRMED: "bg-indigo-100 text-indigo-800",
  PACKED: "bg-amber-100 text-amber-800",
  DISPATCHED: "bg-violet-100 text-violet-800",
  DELIVERED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-stone-200 text-stone-700",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const PAYMENT_LABEL = { PAY_LATER: "Pay later", UPI: "UPI", BANK: "Bank transfer" } as const;
