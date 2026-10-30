// Order status machine (docs/IMPLEMENTATION.md §12).
//
//   PLACED ──► CONFIRMED ──► PACKED ──► DISPATCHED ──► DELIVERED
//     │            │            │
//     ├──► REJECTED (seller, reason required)
//     └──► CANCELLED (customer while PLACED, or seller before DISPATCHED; reason required)
import type { OrderStatus } from "@cataloglink/db";
import { DomainError } from "../errors";

/**
 * For now sellers see only two states: New and Completed. The full flow (Confirmed → Packed →
 * Dispatched → Delivered, reject / cancel) stays in the code; set this to false to bring it back.
 */
export const SIMPLE_ORDER_FLOW = true;

/** Orders that aren't finished yet. In the simple flow they all show as "New". */
export const OPEN_STATUSES: OrderStatus[] = ["PLACED", "CONFIRMED", "PARTIALLY_CONFIRMED", "PACKED", "DISPATCHED"];

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

const FULL_LABEL: Record<OrderStatus, string> = {
  PLACED: "New",
  CONFIRMED: "Confirmed",
  PARTIALLY_CONFIRMED: "Partly confirmed",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const SIMPLE_LABEL: Record<OrderStatus, string> = {
  ...Object.fromEntries(OPEN_STATUSES.map((s) => [s, "New"])),
  DELIVERED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as Record<OrderStatus, string>;

/** Seller-facing status names. */
export const STATUS_LABEL = SIMPLE_ORDER_FLOW ? SIMPLE_LABEL : FULL_LABEL;

/** The full machine, plus (in the simple flow) "complete" straight from any open status. */
export function canTransition(from: OrderStatus, to: OrderStatus) {
  return NEXT[from].includes(to) || (SIMPLE_ORDER_FLOW && to === "DELIVERED" && OPEN_STATUSES.includes(from));
}

/** The steps the seller is offered. */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  if (SIMPLE_ORDER_FLOW) return OPEN_STATUSES.includes(from) ? ["DELIVERED"] : [];
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

type TabDef = { label: string; statuses: readonly OrderStatus[] };

const FULL_TABS: Record<string, TabDef> = {
  new: { label: "New", statuses: ["PLACED"] },
  confirmed: { label: "Confirmed", statuses: ["CONFIRMED", "PARTIALLY_CONFIRMED"] },
  packed: { label: "Packed", statuses: ["PACKED"] },
  dispatched: { label: "Dispatched", statuses: ["DISPATCHED"] },
  delivered: { label: "Delivered", statuses: ["DELIVERED"] },
  cancelled: { label: "Cancelled", statuses: ["REJECTED", "CANCELLED"] },
  all: { label: "All", statuses: [] },
};

const SIMPLE_TABS: Record<string, TabDef> = {
  new: { label: "New", statuses: OPEN_STATUSES },
  completed: { label: "Completed", statuses: ["DELIVERED"] },
  all: { label: "All", statuses: [] },
};

/** Orders-list tabs and the statuses each one shows ("new" and "all" exist in both flows). */
export const ORDER_TABS = SIMPLE_ORDER_FLOW ? SIMPLE_TABS : FULL_TABS;
export type OrderTab = string;
