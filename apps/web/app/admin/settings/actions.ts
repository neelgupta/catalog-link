"use server";

import { saveSheetTemplate, updatePlatformSettings } from "@cataloglink/core/platform";
import { platformSettingsSchema } from "@cataloglink/validation";
import { revalidatePath } from "next/cache";
import { type ActionState, errorState, fileBuffer, formValues, zodState } from "@/lib/actions";
import { requireSuperAdmin } from "@/lib/auth";

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const values = formValues(formData);
  const parsed = platformSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  await updatePlatformSettings(parsed.data);
  revalidatePath("/admin/settings");
  return { ok: true, message: "Settings saved." };
}

export async function uploadTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const file = await fileBuffer(formData, "template");
  if (!file) return { error: "Choose an .xlsx file to upload.", fieldErrors: { template: "Choose a file" } };
  try {
    await saveSheetTemplate(file.name, file.data);
  } catch (err) {
    return errorState(err);
  }
  revalidatePath("/admin/settings");
  return { ok: true, message: "Template uploaded. Clients will download this file during onboarding." };
}
