// Order status machine (docs/IMPLEMENTATION.md §12).
//
//   PLACED ──► CONFIRMED ──► PACKED ──► DISPATCHED ──► DELIVERED
//     │            │            │
//     ├──► REJECTED (seller, reason required)
//     └──► CANCELLED (customer while PLACED, or seller before DISPATCHED; reason required)
import type { OrderStatus } from "@cataloglink/db";
import { DomainError } from "../errors";

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PARTIALLY_CONFIRMED: ["PACKED", "CANCELLED"], // reserved for Phase 2
  PACKED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Statuses that end an order and give its held stock back. */
export const CLOSING_STATUSES: OrderStatus[] = ["REJECTED", "CANCELLED"];

/** Seller-facing status names. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "New",
  CONFIRMED: "Confirmed",
  PARTIALLY_CONFIRMED: "Partly confirmed",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return NEXT[from].includes(to);
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return NEXT[from];
}

/** Throws a readable error for a status change that isn't allowed, or a missing reason. */
export function assertTransition(from: OrderStatus, to: OrderStatus, reason?: string | null) {
  if (!canTransition(from, to)) {
    throw new DomainError("BAD_TRANSITION", `An order that is ${STATUS_LABEL[from].toLowerCase()} can't be marked ${STATUS_LABEL[to].toLowerCase()}.`);
  }
  if (CLOSING_STATUSES.includes(to) && !reason?.trim()) {
    throw new DomainError("REASON_REQUIRED", `Give a reason so the customer knows why the order was ${to === "REJECTED" ? "rejected" : "cancelled"}.`, "reason");
  }
}

/** Orders-list tabs and the statuses each one shows. */
export const ORDER_TABS = {
  new: { label: "New", statuses: ["PLACED"] },
  confirmed: { label: "Confirmed", statuses: ["CONFIRMED", "PARTIALLY_CONFIRMED"] },
  packed: { label: "Packed", statuses: ["PACKED"] },
  dispatched: { label: "Dispatched", statuses: ["DISPATCHED"] },
  delivered: { label: "Delivered", statuses: ["DELIVERED"] },
  cancelled: { label: "Cancelled", statuses: ["REJECTED", "CANCELLED"] },
  all: { label: "All", statuses: [] },
} as const satisfies Record<string, { label: string; statuses: OrderStatus[] }>;
export type OrderTab = keyof typeof ORDER_TABS;
