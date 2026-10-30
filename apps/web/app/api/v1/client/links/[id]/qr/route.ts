import { qrPng, qrSvg } from "@cataloglink/core/qr";
import { forClient } from "@cataloglink/db";
import { apiError } from "@/lib/api";
import { requireClient } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/public-url";

/** QR code for one of the client's links: ?format=png|svg, &download=1 to save as a file. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { clientId } = await requireClient();
  const { id } = await params;
  const link = await forClient(clientId).catalogLink.findFirst({ where: { id }, select: { slug: true } });
  if (!link) return apiError(404, "NOT_FOUND", "Link not found");

  const search = new URL(request.url).searchParams;
  const format = search.get("format") === "svg" ? "svg" : "png";
  const url = `${await publicBaseUrl()}/c/${link.slug}`;
  const body = format === "svg" ? await qrSvg(url) : new Uint8Array(await qrPng(url));
  const headers: Record<string, string> = {
    "content-type": format === "svg" ? "image/svg+xml" : "image/png",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  if (search.get("download")) headers["content-disposition"] = `attachment; filename="${link.slug}-qr.${format}"`;
  return new Response(body, { headers });
}
