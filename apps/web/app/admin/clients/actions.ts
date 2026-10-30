"use server";

import {
  createClient,
  deleteClient,
  resetOwnerPassword,
  setClientStatus,
  updateClient,
} from "@cataloglink/core/clients";
import { DomainError } from "@cataloglink/core/errors";
import { assignSubscription, recordPayment } from "@cataloglink/core/subscriptions";
import { prisma } from "@cataloglink/db";
import {
  clientCreateSchema,
  clientUpdateSchema,
  passwordResetSchema,
  paymentSchema,
  subscriptionSchema,
} from "@cataloglink/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, fileBuffer, formValues, zodState } from "@/lib/actions";
import { requireSuperAdmin, startStaffSession } from "@/lib/auth";

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const values = formValues(formData);
  delete values.password;
  const parsed = clientCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodState(parsed.error, values);

  let clientId: string;
  try {
    const logo = await fileBuffer(formData, "logo");
    clientId = (await createClient(parsed.data, logo?.data)).id;
  } catch (err) {
    // If only the logo failed, the client exists: go to it and let the admin retry the logo.
    if (err instanceof DomainError && err.field === "logo" && err.message.startsWith("Client created")) {
      const created = await prisma.client.findFirst({ where: { email: parsed.data.email }, select: { id: true } });
      if (created) redirect(`/admin/clients/${created.id}?notice=logo-failed`);
    }
    return errorState(err, values);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/clients/${clientId}?notice=created`);
}

export async function updateClientAction(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const values = formValues(formData);
  const parsed = clientUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    const logo = await fileBuffer(formData, "logo");
    await updateClient(clientId, parsed.data, { upload: logo?.data, remove: formData.get("removeLogo") === "on" });
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Client details saved." };
}

export async function setClientStatusAction(clientId: string, formData: FormData) {
  await requireSuperAdmin();
  const status = formData.get("status") === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  await setClientStatus(clientId, status);
  revalidatePath("/admin", "layout");
}

export async function resetPasswordAction(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = passwordResetSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return zodState(parsed.error);
  try {
    await resetOwnerPassword(clientId, parsed.data.password);
  } catch (err) {
    return errorState(err);
  }
  return { ok: true, message: "Password updated. Share it with the client securely." };
}

export async function deleteClientAction(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true } });
  if (!client) redirect("/admin/clients");
  if (String(formData.get("confirmName") ?? "").trim() !== client.businessName) {
    return { error: "Type the business name exactly to confirm.", fieldErrors: { confirmName: "Name doesn't match" } };
  }
  try {
    await deleteClient(clientId);
  } catch (err) {
    return errorState(err);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/clients?notice=deleted");
}

export async function assignPlanAction(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const values = formValues(formData);
  const parsed = subscriptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    await assignSubscription(clientId, parsed.data);
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, message: "Plan assigned." };
}

export async function recordPaymentAction(
  clientId: string,
  subscriptionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const values = formValues(formData);
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodState(parsed.error, values);
  try {
    await recordPayment(clientId, subscriptionId, parsed.data);
  } catch (err) {
    return errorState(err, values);
  }
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, message: "Payment recorded." };
}

/** Switches the session to the client's dashboard, remembering the admin in `imp`. */
export async function impersonateClientAction(clientId: string) {
  const { userId: adminId } = await requireSuperAdmin();
  const owner = await prisma.user.findFirst({
    where: { clientId, role: "CLIENT_OWNER" },
    select: { id: true },
  });
  if (!owner) throw new Error("This client has no owner login");
  console.info(`[audit] super admin ${adminId} impersonating client ${clientId}`);
  await startStaffSession({ userId: owner.id, role: "CLIENT_OWNER", clientId, imp: adminId });
  redirect("/app");
}
