"use server";

import { updateProfile, type ProfileImages } from "@cataloglink/core/profile";
import { profileSchema } from "@cataloglink/validation";
import { revalidatePath } from "next/cache";
import { type ActionState, errorState, fileBuffer, formValues, zodState } from "@/lib/actions";
import { requireClient } from "@/lib/auth";
import { revalidateClientCatalog } from "@/lib/catalog-cache";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId } = await requireClient();
  const values = formValues(formData);
  const parsed = profileSchema.safeParse({ ...values, paymentModes: formData.getAll("paymentModes").map(String) });
  if (!parsed.success) return zodState(parsed.error, values);

  const images: ProfileImages = {};
  for (const [kind, field, remove] of [
    ["logo", "logo", "removeLogo"],
    ["banner", "banner", "removeBanner"],
    ["upiQr", "upiQr", "removeUpiQr"],
  ] as const) {
    images[kind] = { upload: (await fileBuffer(formData, field))?.data, remove: formData.get(remove) === "on" };
  }

  try {
    await updateProfile(clientId, parsed.data, images);
  } catch (err) {
    return errorState(err, values);
  }
  revalidateClientCatalog(clientId);
  revalidatePath("/app", "layout");
  return { ok: true, message: "Profile saved. Customers see these details on your links." };
}
