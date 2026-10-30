"use server";

import { createPlan, deletePlan, updatePlan } from "@cataloglink/core/plans";
import { planSchema } from "@cataloglink/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, formValues, zodState } from "@/lib/actions";
import { requireSuperAdmin } from "@/lib/auth";

function parse(formData: FormData) {
  // Unchecked checkboxes aren't submitted at all.
  return planSchema.safeParse({ ...Object.fromEntries(formData), isActive: formData.get("isActive") === "on" });
}

export async function createPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const values = formValues(formData);
  const parsed = parse(formData);
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    await createPlan(parsed.data);
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath("/admin/plans");
  return { ok: true, message: `Plan "${parsed.data.name}" created.` };
}

export async function updatePlanAction(planId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const values = formValues(formData);
  const parsed = parse(formData);
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    await updatePlan(planId, parsed.data);
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath("/admin/plans");
  return { ok: true, message: `Plan "${parsed.data.name}" saved.` };
}

export async function deletePlanAction(planId: string): Promise<ActionState> {
  await requireSuperAdmin();
  try {
    await deletePlan(planId);
  } catch (err) {
    return errorState(err);
  }
  revalidatePath("/admin/plans");
  // The plan's card (and its pop-up) disappears, so the message is shown by the page.
  redirect("/admin/plans?notice=deleted");
}
