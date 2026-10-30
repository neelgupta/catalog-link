import { revalidateTag } from "next/cache";

/** Drops cached catalog pages for a client after a change made in the dashboard. */
export function revalidateClientCatalog(clientId: string) {
  // Stock and visibility must not be served stale, so cached entries expire immediately.
  revalidateTag(`catalog:${clientId}`, { expire: 0 });
}
