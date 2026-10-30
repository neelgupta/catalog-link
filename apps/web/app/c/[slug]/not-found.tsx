import type { Metadata } from "next";
import { CatalogNotAvailable } from "./_components/not-available";

export const metadata: Metadata = { title: "Catalog not available", robots: { index: false } };

export default function NotFound() {
  return <CatalogNotAvailable />;
}
