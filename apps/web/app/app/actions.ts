"use server";

import { redirect } from "next/navigation";
import { requireClient, startStaffSession } from "@/lib/auth";

/** Ends impersonation: back to the Super Admin's own session, on the client's admin page. */
export async function exitImpersonationAction() {
  const { clientId, impersonatedBy } = await requireClient();
  if (!impersonatedBy) redirect("/app");
  await startStaffSession({ userId: impersonatedBy, role: "SUPER_ADMIN" });
  redirect(`/admin/clients/${clientId}`);
}
