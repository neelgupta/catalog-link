"use client";

import { useEffect } from "react";
import { rememberOrder } from "../../_components/device-orders";

/** Keeps this PO's link on the phone, so "My orders" can list it without a login. */
export function RememberOrder({ slug, orderNo, url }: { slug: string; orderNo: number; url: string }) {
  useEffect(() => rememberOrder(slug, { orderNo, url }), [slug, orderNo, url]);
  return null;
}
