"use server";

import { DomainError } from "@cataloglink/core/errors";
import { buildAuthUrl } from "@cataloglink/core/google";
import { disconnectSheet, enqueueSync, inspectSpreadsheetLink, selectSheet } from "@cataloglink/core/sync";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState } from "@/lib/actions";
import { requireClient } from "@/lib/auth";
import { createOAuthState } from "@/lib/google-oauth";

/** Sends the client to Google's consent screen. */
export async function startGoogleOAuthAction(): Promise<ActionState> {
  const { clientId, userId } = await requireClient();
  let url: string;
  try {
    url = buildAuthUrl(await createOAuthState(clientId, userId));
  } catch (err) {
    return errorState(err);
  }
  redirect(url);
}

/** Service account path: check a pasted sheet link, then go pick a tab. */
export async function inspectLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireClient();
  const sheetUrl = String(formData.get("sheetUrl") ?? "");
  let spreadsheetId: string;
  try {
    spreadsheetId = (await inspectSpreadsheetLink(sheetUrl)).id;
  } catch (err) {
    return errorState(err, { sheetUrl });
  }
  redirect(`/app/sheet/select?mode=SERVICE_ACCOUNT&id=${encodeURIComponent(spreadsheetId)}`);
}

/** Saves the chosen spreadsheet + tab (after checking its columns) and starts the first sync. */
export async function selectSheetAction(
  mode: "OAUTH" | "SERVICE_ACCOUNT",
  spreadsheetId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { clientId } = await requireClient();
  const tab = String(formData.get("tab") ?? "");
  if (!tab) return { error: "Choose the tab that has your products.", fieldErrors: { tab: "Choose a tab" } };
  try {
    await selectSheet(clientId, mode, spreadsheetId, tab);
    await enqueueSync(clientId, "MANUAL");
  } catch (err) {
    return errorState(err, { tab });
  }
  revalidatePath("/app", "layout");
  redirect("/app/sheet?connected=sheet");
}

export async function syncNowAction(): Promise<ActionState> {
  const { clientId } = await requireClient();
  try {
    await enqueueSync(clientId, "MANUAL");
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/sheet");
  return { ok: true, message: "Sync started." };
}

export async function disconnectSheetAction() {
  const { clientId } = await requireClient();
  await disconnectSheet(clientId);
  revalidatePath("/app", "layout");
  redirect("/app/sheet?disconnected=1");
}
