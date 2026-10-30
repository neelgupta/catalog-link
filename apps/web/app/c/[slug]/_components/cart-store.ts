"use client";

import { useSyncExternalStore } from "react";

/** One cart line in localStorage (`cl_cart_<linkId>`). `price` is what the customer saw (null if hidden). */
export type StoredLine = {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  colour?: string;
  size?: string;
  qty: number;
  price: number | null;
};

const EVENT = "cl-cart-change";
const storageKey = (linkId: string) => `cl_cart_${linkId}`;
export const lineKey = (l: { productId: string; colour?: string; size?: string }) => `${l.productId}|${l.colour ?? ""}|${l.size ?? ""}`;

export function readCart(linkId: string): StoredLine[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(linkId)) ?? "[]");
    return Array.isArray(value) ? value.filter((l) => l && typeof l.productId === "string" && Number.isInteger(l.qty) && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export function writeCart(linkId: string, lines: StoredLine[]) {
  try {
    if (lines.length) localStorage.setItem(storageKey(linkId), JSON.stringify(lines));
    else localStorage.removeItem(storageKey(linkId));
  } catch {
    /* storage full or blocked: the cart just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Adds a line, or adds to the quantity of the same product + colour + size. */
export function addToCart(linkId: string, line: StoredLine) {
  const lines = readCart(linkId);
  const existing = lines.find((l) => lineKey(l) === lineKey(line));
  if (existing) {
    existing.qty += line.qty;
    existing.price = line.price;
  } else lines.push(line);
  writeCart(linkId, lines);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Number of lines in the cart (0 on the server). */
export function useCartCount(linkId: string) {
  return useSyncExternalStore(
    subscribe,
    () => readCart(linkId).length,
    () => 0,
  );
}
