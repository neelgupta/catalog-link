"use server";

import { createLink, deleteLink, updateLink } from "@cataloglink/core/links";
import { LINK_SELECTION_TYPES, linkCreateSchema, linkUpdateSchema } from "@cataloglink/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, formValues, zodState } from "@/lib/actions";
import { requireClient } from "@/lib/auth";
import { revalidateClientCatalog } from "@/lib/catalog-cache";

/** The form sends one value list per selection type; only the chosen type's values count. */
function linkInput(formData: FormData) {
  const selectionType = String(formData.get("selectionType") ?? "ALL");
  const known = (LINK_SELECTION_TYPES as readonly string[]).includes(selectionType);
  return {
    name: formData.get("name"),
    slug: formData.get("slug") ?? "",
    selectionType,
    selectionValues: known && selectionType !== "ALL" ? formData.getAll(`values_${selectionType}`).map(String) : [],
    showPrice: formData.get("showPrice"),
    allowOrdering: formData.get("allowOrdering"),
    isActive: formData.get("isActive"),
    /** JSON from the Prices step. */
    pricing: formData.get("pricing") ?? undefined,
  };
}

export async function createLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId } = await requireClient();
  const values = formValues(formData);
  const parsed = linkCreateSchema.safeParse(linkInput(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  let id: string;
  try {
    id = (await createLink(clientId, parsed.data)).id;
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath("/app/links");
  redirect(`/app/links?created=${id}`);
}

export async function updateLinkAction(linkId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId } = await requireClient();
  const values = formValues(formData);
  const parsed = linkUpdateSchema.safeParse(linkInput(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    await updateLink(clientId, linkId, parsed.data);
  } catch (err) {
    return errorState(err, values);
  }
  revalidateClientCatalog(clientId);
  revalidatePath("/app/links", "layout");
  return { ok: true, message: "Link saved." };
}

export async function deleteLinkAction(linkId: string): Promise<ActionState> {
  const { clientId } = await requireClient();
  try {
    await deleteLink(clientId, linkId);
  } catch (err) {
    return errorState(err);
  }
  revalidateClientCatalog(clientId);
  revalidatePath("/app/links");
  redirect("/app/links?deleted=1");
}
