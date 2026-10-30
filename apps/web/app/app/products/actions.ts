"use server";

import { DomainError } from "@cataloglink/core/errors";
import { setProductHidden } from "@cataloglink/core/products";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { requireClient } from "@/lib/auth";
import { revalidateClientCatalog } from "@/lib/catalog-cache";

export async function setHiddenAction(productId: string, hidden: boolean): Promise<ActionState> {
  const { clientId } = await requireClient();
  try {
    await setProductHidden(clientId, productId, hidden);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidateClientCatalog(clientId);
  revalidatePath("/app/products", "layout");
  return { ok: true, message: hidden ? "Hidden from your links." : "Shown on your links." };
}
