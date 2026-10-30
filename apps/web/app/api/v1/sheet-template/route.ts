import { getPlatformSettings } from "@cataloglink/core/platform";
import { CONTENT_TYPES, getStorage } from "@cataloglink/core/storage";
import { buildTemplate } from "@cataloglink/core/sync";
import { apiError } from "@/lib/api";
import { getStaffSession } from "@/lib/auth";

let builtIn: Promise<Buffer> | undefined;

/**
 * Downloads the product sheet template: the one uploaded in Super Admin settings, or the built-in
 * template with every supported column. Any logged-in Super Admin or client.
 */
export async function GET() {
  if (!(await getStaffSession())) return apiError(401, "UNAUTHORIZED", "Please log in");

  const uploaded = (await getPlatformSettings()).sheetTemplate;
  const data = (uploaded && (await getStorage().read(uploaded.key))) || (await (builtIn ??= buildTemplate()));
  const fileName = (uploaded ? uploaded.fileName : "CatalogLink_Template.xlsx").replace(/[^\w.\- ]/g, "_");

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": CONTENT_TYPES.xlsx!,
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "private, no-store",
    },
  });
}
