"use client";

import { useMemo, useState } from "react";
import { ProductThumb } from "@/components/product-thumb";
import {
  Button,
  Checkbox,
  FormActions,
  FormError,
  FormSection,
  FormSuccess,
  Input,
} from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { useKeepValuesAction } from "@/lib/use-keep-values-action";

type SelectionType = "ALL" | "CATEGORY" | "CATALOG" | "PRODUCTS";
type Facet = { name: string; count: number };
export type PickerProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  catalogName: string | null;
  /** On links: in the sheet, Active = Yes, not hidden. */
  visible: boolean;
  image: { thumbUrl: string | null; blurDataUrl: string | null } | null;
};
export type LinkValues = {
  name: string;
  slug: string;
  isDefault: boolean;
  selectionType: SelectionType;
  selectionValues: string[];
  showPrice: boolean;
  allowOrdering: boolean;
  isActive: boolean;
};

const TYPES: { value: SelectionType; label: string; hint: string }[] = [
  { value: "ALL", label: "All products", hint: "Everything on your default link" },
  { value: "CATEGORY", label: "By category", hint: "e.g. only Sarees" },
  { value: "CATALOG", label: "By catalog", hint: "e.g. Rangoli Vol-3" },
  { value: "PRODUCTS", label: "Pick products", hint: "Choose one by one" },
];

/** Same rules as the server's slugify, for the address preview. */
function slugify(input: string) {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "catalog"
  );
}

export function LinkForm({
  action,
  link,
  appUrl,
  clientSlug,
  categories,
  catalogs,
  products,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Present when editing. */
  link?: LinkValues;
  appUrl: string;
  clientSlug: string;
  categories: Facet[];
  catalogs: Facet[];
  products: PickerProduct[];
}) {
  const [state, onSubmit, pending] = useKeepValuesAction(action, {});
  const isDefault = link?.isDefault ?? false;
  const [name, setName] = useState(state.values?.name ?? link?.name ?? "");
  const [type, setType] = useState<SelectionType>(link?.selectionType ?? "CATEGORY");
  const [selected, setSelected] = useState<Record<SelectionType, string[]>>(() => ({
    ALL: [],
    CATEGORY: link?.selectionType === "CATEGORY" ? link.selectionValues : [],
    CATALOG: link?.selectionType === "CATALOG" ? link.selectionValues : [],
    PRODUCTS: link?.selectionType === "PRODUCTS" ? link.selectionValues : [],
  }));
  const err = (field: string) => state.fieldErrors?.[field];

  const toggle = (t: SelectionType, value: string) =>
    setSelected((s) => ({
      ...s,
      [t]: s[t].includes(value) ? s[t].filter((v) => v !== value) : [...s[t], value],
    }));

  const matching = useMemo(() => {
    const lower = (v: string[]) => new Set(v.map((x) => x.toLowerCase()));
    const visible = products.filter((p) => p.visible);
    if (type === "ALL" || isDefault) return visible.length;
    if (type === "CATEGORY") {
      const set = lower(selected.CATEGORY);
      return visible.filter((p) => set.has(p.category.toLowerCase())).length;
    }
    if (type === "CATALOG") {
      const set = lower(selected.CATALOG);
      return visible.filter((p) => p.catalogName && set.has(p.catalogName.toLowerCase())).length;
    }
    const set = new Set(selected.PRODUCTS);
    return visible.filter((p) => set.has(p.id)).length;
  }, [products, type, selected, isDefault]);

  const host = appUrl.replace(/^https?:\/\//, "");
  const suggestedSlug = slugify(`${clientSlug} ${name || "link"}`);

  return (
    <form onSubmit={onSubmit} className="space-y-6 lg:space-y-10">
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      <FormSection
        title="Link"
        description="A name for your own reference, and the address customers open."
      >
        <div className="space-y-4">
          <Input
            label="Link name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={err("name")}
            required
            maxLength={60}
            placeholder="e.g. Bridal collection for Mumbai retailers"
            hint="Only you see this name. Customers see your business name."
          />
          {link ? (
            <div>
              <p className="mb-1 text-sm font-medium text-stone-700">Link address</p>
              <p className="truncate rounded-lg bg-stone-50 px-3 py-2 font-mono text-sm">
                {host}/c/{link.slug}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                The address can&apos;t change, so links you already shared keep working.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">
                Link address (optional)
              </span>
              <div
                className={`flex items-center overflow-hidden rounded-lg border bg-white focus-within:border-brand-500 ${err("slug") ? "border-red-400" : "border-stone-300"}`}
              >
                <span className="hidden shrink-0 bg-stone-50 px-3 py-2.5 text-sm text-stone-500 sm:block">
                  {host}/c/
                </span>
                <input
                  name="slug"
                  defaultValue={state.values?.slug ?? ""}
                  placeholder={suggestedSlug}
                  autoCapitalize="none"
                  className="h-11 min-w-0 flex-1 px-3 font-mono text-base outline-none sm:text-sm"
                />
              </div>
              {err("slug") ? (
                <span className="mt-1 block text-xs text-red-600">{err("slug")}</span>
              ) : (
                <span className="mt-1 block text-xs text-stone-500">
                  Leave empty to use {suggestedSlug}. It can&apos;t be changed later.
                </span>
              )}
            </label>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Products on this link"
        description={
          <>
            Choose which products customers see. New products that match are added automatically.
            <span className="mt-3 block text-2xl font-semibold text-stone-900">
              {matching} shown
            </span>
          </>
        }
      >
        {isDefault ? (
          <>
            <input type="hidden" name="selectionType" value="ALL" />
            <p className="text-sm text-stone-600">
              The default link always shows all your active products.
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <fieldset>
              <legend className="sr-only">Which products</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => (
                  <label
                    key={t.value}
                    className={`cursor-pointer rounded-xl border p-3 text-sm ${type === t.value ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}
                  >
                    <input
                      type="radio"
                      name="selectionType"
                      value={t.value}
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                      className="sr-only"
                    />
                    <span className="block font-medium">{t.label}</span>
                    <span className="block text-xs text-stone-500">{t.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Every list is submitted under its own name; the server reads only the chosen type's. */}
            {(["CATEGORY", "CATALOG", "PRODUCTS"] as const).map((t) =>
              selected[t].map((v) => (
                <input key={`${t}:${v}`} type="hidden" name={`values_${t}`} value={v} />
              )),
            )}

            {type === "CATEGORY" && (
              <FacetPicker
                facets={categories}
                selected={selected.CATEGORY}
                onToggle={(v) => toggle("CATEGORY", v)}
                empty="No categories in your sheet yet."
              />
            )}
            {type === "CATALOG" && (
              <FacetPicker
                facets={catalogs}
                selected={selected.CATALOG}
                onToggle={(v) => toggle("CATALOG", v)}
                empty="No catalog names in your sheet yet. Fill the Catalog Name column to group products."
              />
            )}
            {type === "PRODUCTS" && (
              <ProductPicker
                products={products}
                selected={selected.PRODUCTS}
                onToggle={(v) => toggle("PRODUCTS", v)}
              />
            )}
            {err("selectionValues") && (
              <p className="text-sm text-red-600">{err("selectionValues")}</p>
            )}
          </div>
        )}
      </FormSection>

      <FormSection title="Options" description="What customers can see and do on this link.">
        <div className="space-y-3">
          <Checkbox name="showPrice" label="Show prices" defaultChecked={link?.showPrice ?? true} />
          <Checkbox
            name="allowOrdering"
            label="Allow customers to order"
            defaultChecked={link?.allowOrdering ?? true}
          />
          {isDefault ? (
            <input type="hidden" name="isActive" value="on" />
          ) : (
            <Checkbox
              name="isActive"
              label="Link is on (turn off to stop it opening)"
              defaultChecked={link?.isActive ?? true}
            />
          )}
        </div>
      </FormSection>

      <FormActions>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : link ? "Save link" : "Create link"}
        </Button>
      </FormActions>
    </form>
  );
}

function FacetPicker({
  facets,
  selected,
  onToggle,
  empty,
}: {
  facets: Facet[];
  selected: string[];
  onToggle: (v: string) => void;
  empty: string;
}) {
  const known = new Set(facets.map((f) => f.name.toLowerCase()));
  // Names saved on the link that are no longer in the sheet stay visible so they can be removed.
  const stale = selected.filter((s) => !known.has(s.toLowerCase()));
  if (!facets.length && !stale.length) return <p className="text-sm text-stone-500">{empty}</p>;
  const isChecked = (name: string) => selected.some((s) => s.toLowerCase() === name.toLowerCase());
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ...facets.map((f) => ({ ...f, stale: false })),
        ...stale.map((name) => ({ name, count: 0, stale: true })),
      ].map((f) => (
        <label
          key={f.name}
          className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${isChecked(f.name) ? "border-brand-500 bg-brand-50" : "border-stone-300"}`}
        >
          <input
            type="checkbox"
            checked={isChecked(f.name)}
            onChange={() =>
              onToggle(selected.find((s) => s.toLowerCase() === f.name.toLowerCase()) ?? f.name)
            }
            className="size-4 accent-brand-500"
          />
          {f.name}
          <span className="text-xs text-stone-500">{f.stale ? "not in sheet" : f.count}</span>
        </label>
      ))}
    </div>
  );
}

function ProductPicker({
  products,
  selected,
  onToggle,
}: {
  products: PickerProduct[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const chosen = new Set(selected);
  const q = query.trim().toLowerCase();
  const list = products.filter(
    (p) =>
      (!onlySelected || chosen.has(p.id)) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.catalogName?.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, SKU, category…"
          aria-label="Search products"
          className="h-10 min-w-0 flex-1 rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-brand-500 sm:text-sm"
        />
        <label className="flex items-center gap-2 text-sm whitespace-nowrap text-stone-600">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
            className="size-4 accent-brand-500"
          />
          Selected ({selected.length})
        </label>
      </div>
      <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
        {list.length === 0 && (
          <li className="p-4 text-center text-sm text-stone-500">No products match.</li>
        )}
        {list.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-stone-50">
              <input
                type="checkbox"
                checked={chosen.has(p.id)}
                onChange={() => onToggle(p.id)}
                className="size-4 shrink-0 accent-brand-500"
              />
              <ProductThumb
                image={p.image}
                alt=""
                className="size-10 shrink-0 rounded-md text-[0px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block truncate text-xs text-stone-500">
                  {p.sku} · {p.category}
                  {p.catalogName ? ` · ${p.catalogName}` : ""}
                  {!p.visible && " · not on links"}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
