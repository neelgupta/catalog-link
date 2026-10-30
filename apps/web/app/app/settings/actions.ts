"use server";

import { updateClientSettings } from "@cataloglink/core/profile";
import { clientSettingsSchema } from "@cataloglink/validation";
import { revalidatePath } from "next/cache";
import { type ActionState, errorState, formValues, zodState } from "@/lib/actions";
import { requireClient } from "@/lib/auth";
import { revalidateClientCatalog } from "@/lib/catalog-cache";

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId } = await requireClient();
  const values = formValues(formData);
  const parsed = clientSettingsSchema.safeParse(values);
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    await updateClientSettings(clientId, parsed.data);
  } catch (err) {
    return errorState(err, values);
  }
  revalidateClientCatalog(clientId);
  revalidatePath("/app", "layout");
  return { ok: true, message: "Settings saved." };
}
