import { newOrderCount } from "@cataloglink/core/orders";
import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Orders waiting for the seller; polled by the dashboard every 30 s. */
export async function GET() {
  const { clientId } = await requireClient();
  return NextResponse.json({ count: await newOrderCount(clientId) }, { headers: { "cache-control": "no-store" } });
}
