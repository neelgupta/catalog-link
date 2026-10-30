"use server";

import { createCustomer, setCustomerBlocked, updateCustomer } from "@cataloglink/core/customers";
import { customerSchema } from "@cataloglink/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, formValues, zodState } from "@/lib/actions";
import { requireClient } from "@/lib/auth";

function input(formData: FormData) {
  return { ...formValues(formData), linkIds: formData.getAll("linkIds").map(String) };
}

export async function createCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId } = await requireClient();
  const values = formValues(formData);
  const parsed = customerSchema.safeParse(input(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  let id: string;
  try {
    id = (await createCustomer(clientId, parsed.data)).id;
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath("/app/customers");
  redirect(`/app/customers/${id}?created=1`);
}

export async function updateCustomerAction(customerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId } = await requireClient();
  const values = formValues(formData);
  const parsed = customerSchema.safeParse(input(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    await updateCustomer(clientId, customerId, parsed.data);
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath("/app/customers", "layout");
  return { ok: true, message: "Customer saved." };
}

export async function setBlockedAction(customerId: string, blocked: boolean): Promise<ActionState> {
  const { clientId } = await requireClient();
  try {
    await setCustomerBlocked(clientId, customerId, blocked);
  } catch (err) {
    return errorState(err);
  }
  revalidatePath("/app/customers", "layout");
  return { ok: true, message: blocked ? "Customer blocked. They can browse but can't order." : "Customer unblocked." };
}
