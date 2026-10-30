import { CatalogNotAvailable } from "../../_components/not-available";

export default function NotFound() {
  return (
    <CatalogNotAvailable
      title="Product not available"
      body="This design is no longer on this catalog. Go back to the catalog to see what's available."
    />
  );
}
