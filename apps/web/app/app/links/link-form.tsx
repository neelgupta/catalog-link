"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { ProductThumb } from "@/components/product-thumb";
import { Button, Checkbox, FormError, FormSuccess, Input, SearchField } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { SHOW_CATALOGS } from "@/lib/features";
import { applyDiscount, type Discount, discountFor, type LinkPricing } from "@cataloglink/core/link-pricing";
import { useKeepValuesAction } from "@/lib/use-keep-values-action";

type SelectionType = "ALL" | "CATEGORY" | "CATALOG" | "PRODUCTS";
type Facet = { name: string; count: number };
export type PickerProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  catalogName: string | null;
  /** Sheet price. */
  price: number;
  priceType: "PIECE" | "SET";
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
  pricing: LinkPricing;
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

const STEPS = [
  { title: "Name", hint: "Name and address" },
  { title: "Products", hint: "What customers see" },
  { title: "Prices", hint: "Discounts for this link" },
  { title: "Options", hint: "Show prices, ordering" },
] as const;

type PricingMode = LinkPricing["mode"];
/** A discount as typed in the form (value kept as text while typing). */
type DraftDiscount = { kind: Discount["kind"]; value: string };
const EMPTY_DISCOUNT: DraftDiscount = { kind: "PERCENT", value: "" };

const PRICING_MODES: { value: PricingMode; label: string; hint: string }[] = [
  { value: "NONE", label: "No discount", hint: "Sheet prices" },
  { value: "ALL", label: "All products", hint: "One discount for everything" },
  { value: "GROUP", label: "Selected products", hint: "One discount for the ones you pick" },
  { value: "EACH", label: "Product by product", hint: "Each product its own discount" },
];

const toDraft = (d?: Discount): DraftDiscount => (d ? { kind: d.kind, value: String(d.value) } : EMPTY_DISCOUNT);
/** A typed discount that can be used, or null (empty, 0, or 100%+). */
function readDiscount(d: DraftDiscount): Discount | null {
  const value = Number(d.value);
  if (!d.value.trim() || !Number.isFinite(value) || value <= 0) return null;
  if (d.kind === "PERCENT" && value >= 100) return null;
  return { kind: d.kind, value };
}
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);

/** Number box with a % / ₹ switch. */
function DiscountInput({ value, onChange, label, compact = false }: { value: DraftDiscount; onChange: (d: DraftDiscount) => void; label: string; compact?: boolean }) {
  return (
    <div className={`flex items-center overflow-hidden rounded-xl border border-stone-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 ${compact ? "w-36" : "w-full max-w-xs"}`}>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        aria-label={label}
        placeholder={compact ? "0" : value.kind === "PERCENT" ? "e.g. 10" : "e.g. 100"}
        value={value.value}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        className={`min-w-0 flex-1 px-3 text-base outline-none sm:text-sm ${compact ? "h-9" : "h-11"}`}
      />
      <div className="flex shrink-0 gap-0.5 p-1" role="group" aria-label={`${label}: % or ₹`}>
        {(["PERCENT", "AMOUNT"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.kind === k}
            onClick={() => onChange({ ...value, kind: k })}
            className={`rounded-lg px-2.5 text-sm font-semibold ${compact ? "h-7" : "h-9"} ${value.kind === k ? "bg-brand-500 text-white" : "text-stone-500 hover:bg-stone-100"}`}
          >
            {k === "PERCENT" ? "%" : "₹"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "₹1,000 → ₹900", or the sheet price alone when there's no discount. */
function PricePreview({ price, discount }: { price: number; discount: Discount | null }) {
  if (!discount) return <span className="text-stone-600">{inr(price)}</span>;
  const after = applyDiscount(price, discount);
  return (
    <span className="whitespace-nowrap">
      <span className="text-stone-400 line-through">{inr(price)}</span>{" "}
      <span className={after <= 0 ? "font-semibold text-red-600" : "font-semibold text-green-700"}>{inr(after)}</span>
    </span>
  );
}

/** Progress bar: numbered steps joined by a line. Done steps show a tick and can be reopened. */
function Stepper({ step, canOpen, onOpen }: { step: number; canOpen: (i: number) => boolean; onOpen: (i: number) => void }) {
  return (
    <ol className="flex items-start">
      {STEPS.map((s, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={s.title} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2 ${i <= step ? "bg-brand-500" : "bg-stone-200"}`}
              />
            )}
            <button
              type="button"
              disabled={!canOpen(i)}
              onClick={() => onOpen(i)}
              aria-current={current ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s.title}${done ? " (done)" : ""}`}
              className="relative z-10 flex flex-col items-center gap-1.5 disabled:cursor-default"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-stone-50 transition ${
                  done ? "bg-brand-500 text-white" : current ? "bg-brand-500 text-white ring-brand-100" : "bg-white text-stone-500 ring-1 ring-stone-300"
                }`}
              >
                {done ? <Check aria-hidden="true" className="size-4" /> : i + 1}
              </span>
              <span className={`text-sm font-medium ${current ? "text-stone-900" : "text-stone-500"}`}>{s.title}</span>
              <span className="hidden text-xs text-stone-400 sm:block">{s.hint}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Link form in three steps (Name → Products → Options) on one page: the steps switch without
 * reloading and everything is saved together at the end. When editing, every step can be opened and
 * "Save link" works from any step.
 */
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
  const editing = !!link;
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(editing ? STEPS.length - 1 : 0);
  const [stepError, setStepError] = useState<string>();
  const [name, setName] = useState(state.values?.name ?? link?.name ?? "");
  const [type, setType] = useState<SelectionType>(link?.selectionType ?? "CATEGORY");
  const [selected, setSelected] = useState<Record<SelectionType, string[]>>(() => ({
    ALL: [],
    CATEGORY: link?.selectionType === "CATEGORY" ? link.selectionValues : [],
    CATALOG: link?.selectionType === "CATALOG" ? link.selectionValues : [],
    PRODUCTS: link?.selectionType === "PRODUCTS" ? link.selectionValues : [],
  }));
  // Prices step.
  const saved = link?.pricing ?? { mode: "NONE" as const };
  const [pricingMode, setPricingMode] = useState<PricingMode>(saved.mode);
  const [allDiscount, setAllDiscount] = useState<DraftDiscount>(toDraft(saved.mode === "ALL" ? saved.discount : undefined));
  const [groupDiscount, setGroupDiscount] = useState<DraftDiscount>(toDraft(saved.mode === "GROUP" ? saved.discount : undefined));
  const [groupIds, setGroupIds] = useState<string[]>(saved.mode === "GROUP" ? saved.productIds : []);
  const [eachDiscounts, setEachDiscounts] = useState<Record<string, DraftDiscount>>(
    saved.mode === "EACH" ? Object.fromEntries(Object.entries(saved.discounts).map(([id, d]) => [id, toDraft(d)])) : {},
  );
  const [eachQuery, setEachQuery] = useState("");

  /** Products unticked inside the chosen categories (By category). */
  const [excluded, setExcluded] = useState<string[]>([]);
  const err = (field: string) => state.fieldErrors?.[field];
  // "By catalog" is hidden for now (lib/features.ts) unless this link already uses it.
  const types = TYPES.filter((t) => t.value !== "CATALOG" || SHOW_CATALOGS || link?.selectionType === "CATALOG");

  // A new server error sends you back to the step that has the field.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.fieldErrors?.name || state.fieldErrors?.slug) setStep(0);
    else if (state.fieldErrors?.selectionValues) setStep(1);
    else if (state.fieldErrors?.pricing) setStep(2);
  }

  const toggle = (t: SelectionType, value: string) =>
    setSelected((s) => ({
      ...s,
      [t]: s[t].includes(value) ? s[t].filter((v) => v !== value) : [...s[t], value],
    }));

  /** Products in the chosen categories, in sheet order. */
  const inCategories = useMemo(() => {
    const set = new Set(selected.CATEGORY.map((x) => x.toLowerCase()));
    return products.filter((p) => set.has(p.category.toLowerCase()));
  }, [products, selected.CATEGORY]);
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const narrowed = type === "CATEGORY" && inCategories.some((p) => excludedSet.has(p.id));

  /**
   * What is saved: unticking products inside "By category" saves the ticked products one by one
   * (new products in those categories then aren't added automatically).
   */
  const effectiveType: SelectionType = isDefault ? "ALL" : narrowed ? "PRODUCTS" : type;
  const effectiveValues = useMemo(
    () =>
      effectiveType === "ALL"
        ? []
        : narrowed
          ? inCategories.filter((p) => !excludedSet.has(p.id)).map((p) => p.id)
          : selected[type],
    [effectiveType, narrowed, inCategories, excludedSet, selected, type],
  );

  const matching = useMemo(() => {
    const lower = (v: string[]) => new Set(v.map((x) => x.toLowerCase()));
    const visible = products.filter((p) => p.visible);
    if (effectiveType === "ALL") return visible.length;
    if (effectiveType === "CATEGORY") {
      const set = lower(effectiveValues);
      return visible.filter((p) => set.has(p.category.toLowerCase())).length;
    }
    if (effectiveType === "CATALOG") {
      const set = lower(effectiveValues);
      return visible.filter((p) => p.catalogName && set.has(p.catalogName.toLowerCase())).length;
    }
    const set = new Set(effectiveValues);
    return visible.filter((p) => set.has(p.id)).length;
  }, [products, effectiveType, effectiveValues]);

  /** The products this link will show, for the Prices step. */
  const linkProducts = useMemo(() => {
    const visible = products.filter((p) => p.visible);
    if (effectiveType === "ALL") return visible;
    if (effectiveType === "PRODUCTS") {
      const set = new Set(effectiveValues);
      return visible.filter((p) => set.has(p.id));
    }
    const set = new Set(effectiveValues.map((x) => x.toLowerCase()));
    return visible.filter((p) => set.has((effectiveType === "CATEGORY" ? p.category : (p.catalogName ?? "")).toLowerCase()));
  }, [products, effectiveType, effectiveValues]);
  const onLinkIds = useMemo(() => new Set(linkProducts.map((p) => p.id)), [linkProducts]);

  /** What gets saved; discounts for products no longer on the link are dropped. */
  const pricing: LinkPricing = useMemo(() => {
    if (isDefault) return { mode: "NONE" };
    if (pricingMode === "ALL") {
      const d = readDiscount(allDiscount);
      return d ? { mode: "ALL", discount: d } : { mode: "NONE" };
    }
    if (pricingMode === "GROUP") {
      const d = readDiscount(groupDiscount);
      const ids = groupIds.filter((id) => onLinkIds.has(id));
      return d && ids.length ? { mode: "GROUP", discount: d, productIds: ids } : { mode: "NONE" };
    }
    if (pricingMode === "EACH") {
      const entries = Object.entries(eachDiscounts)
        .filter(([id]) => onLinkIds.has(id))
        .map(([id, d]) => [id, readDiscount(d)] as const)
        .filter((e): e is readonly [string, Discount] => e[1] !== null);
      return entries.length ? { mode: "EACH", discounts: Object.fromEntries(entries) } : { mode: "NONE" };
    }
    return { mode: "NONE" };
  }, [isDefault, pricingMode, allDiscount, groupDiscount, groupIds, eachDiscounts, onLinkIds]);
  const discountedCount = linkProducts.filter((p) => discountFor(pricing, p.id)).length;
  const madeFree = linkProducts.filter((p) => {
    const d = discountFor(pricing, p.id);
    return d && p.price > 0 && applyDiscount(p.price, d) <= 0;
  });

  const host = appUrl.replace(/^https?:\/\//, "");
  const suggestedSlug = slugify(`${clientSlug} ${name || "link"}`);
  const last = STEPS.length - 1;

  /** Checks the current step before moving on; returns an error message or undefined. */
  const check = (i: number) => {
    if (i === 0 && !name.trim()) return "Give the link a name.";
    if (i === 1 && !isDefault && type !== "ALL" && selected[type].length === 0)
      return type === "PRODUCTS" ? "Pick at least one product." : `Choose at least one ${type === "CATEGORY" ? "category" : "catalog"}.`;
    if (i === 1 && narrowed && effectiveValues.length === 0) return "Tick at least one product.";
    if (i === 2 && !isDefault) {
      if (pricingMode === "ALL" && !readDiscount(allDiscount)) return "Enter the discount (a % below 100, or a ₹ amount).";
      if (pricingMode === "GROUP" && !readDiscount(groupDiscount)) return "Enter the discount (a % below 100, or a ₹ amount).";
      if (pricingMode === "GROUP" && !groupIds.some((id) => onLinkIds.has(id))) return "Tick the products that get the discount.";
      if (pricingMode === "EACH" && pricing.mode === "NONE") return "Enter a discount for at least one product.";
      if (madeFree.length) return `The discount is more than the price of ${madeFree.length === 1 ? madeFree[0]!.name : `${madeFree.length} products`}. Use a smaller discount.`;
    }
    return undefined;
  };
  const open = (i: number) => {
    setStepError(undefined);
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => {
    const problem = check(step);
    if (problem) return setStepError(problem);
    setReached((r) => Math.max(r, step + 1));
    open(step + 1);
  };

  const panel = (i: number) => (step === i ? "space-y-4" : "hidden");

  return (
    <form
      onSubmit={(e) => {
        if (!editing && step < last) {
          e.preventDefault();
          next();
          return;
        }
        const failing = [0, 1, 2].find((i) => check(i));
        if (failing !== undefined) {
          e.preventDefault();
          setStepError(check(failing));
          setStep(failing);
          return;
        }
        onSubmit(e);
      }}
      className="max-w-3xl space-y-5"
    >
      <div className="rounded-2xl border border-stone-200 bg-white px-3 py-4 sm:px-5">
        <Stepper step={step} canOpen={(i) => i <= reached && i !== step} onOpen={open} />
      </div>

      <FormError message={stepError ?? state.error} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      {/* All steps stay in the form (hidden when not current) so everything is submitted together. */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
        <div className={panel(0)}>
          <StepTitle n={1} title="Name your link" text="Only you see the name. Customers see your business name." />
          <Input
            label="Link name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={err("name")}
            required
            maxLength={60}
            placeholder="e.g. Bridal collection for Mumbai retailers"
            autoFocus={!editing}
          />
          {link ? (
            <div>
              <p className="mb-1 text-sm font-medium text-stone-700">Link address</p>
              <p className="truncate rounded-xl bg-stone-50 px-3.5 py-2.5 font-mono text-sm">
                {host}/c/{link.slug}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                The address can&apos;t change, so links you already shared keep working.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Link address (optional)</span>
              <div
                className={`flex items-center overflow-hidden rounded-xl border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 ${err("slug") ? "border-red-400" : "border-stone-300"}`}
              >
                <span className="hidden shrink-0 border-r border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-500 sm:block">
                  {host}/c/
                </span>
                <input
                  name="slug"
                  defaultValue={state.values?.slug ?? ""}
                  placeholder={suggestedSlug}
                  autoCapitalize="none"
                  className="h-11 min-w-0 flex-1 px-3.5 font-mono text-base outline-none sm:text-sm"
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

        <div className={panel(1)}>
          <StepTitle
            n={2}
            title="Choose the products"
            text="New products that match are added to the link automatically."
            aside={
              <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
                {matching} shown
              </span>
            }
          />
          {isDefault ? (
            <>
              <input type="hidden" name="selectionType" value="ALL" />
              <p className="text-sm text-stone-600">The default link always shows all your active products.</p>
            </>
          ) : (
            <>
              <fieldset>
                <legend className="sr-only">Which products</legend>
                <div className={`grid grid-cols-1 gap-2 ${types.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                  {types.map((t) => (
                    <label
                      key={t.value}
                      className={`cursor-pointer rounded-xl border p-3 text-sm transition ${type === t.value ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-stone-200 hover:border-stone-300"}`}
                    >
                      <input
                        type="radio"
                        value={t.value}
                        checked={type === t.value}
                        onChange={() => {
                          setType(t.value);
                          setStepError(undefined);
                        }}
                        className="sr-only"
                      />
                      <span className="block font-semibold">{t.label}</span>
                      <span className="block text-xs text-stone-500">{t.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* What gets saved (see effectiveType). */}
              <input type="hidden" name="selectionType" value={effectiveType} />
              {effectiveValues.map((v) => (
                <input key={v} type="hidden" name={`values_${effectiveType}`} value={v} />
              ))}

              {type === "CATEGORY" && (
                <>
                  <FacetPicker
                    facets={categories}
                    selected={selected.CATEGORY}
                    onToggle={(v) => toggle("CATEGORY", v)}
                    empty="No categories in your sheet yet."
                  />
                  {inCategories.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-stone-700">
                        Products in {selected.CATEGORY.length === 1 ? selected.CATEGORY[0] : "these categories"}
                        <span className="font-normal text-stone-500"> · untick any you don&apos;t want on this link</span>
                      </p>
                      <ProductChecklist
                        products={inCategories}
                        isChecked={(id) => !excludedSet.has(id)}
                        onToggle={(id) => setExcluded((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]))}
                        onToggleAll={(ids, on) =>
                          setExcluded((x) => (on ? x.filter((v) => !ids.includes(v)) : [...new Set([...x, ...ids])]))
                        }
                      />
                      {narrowed && (
                        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                          Only the ticked products will be on this link. New products added to{" "}
                          {selected.CATEGORY.length === 1 ? "this category" : "these categories"} later won&apos;t be added
                          automatically.
                        </p>
                      )}
                    </div>
                  )}
                </>
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
                  onToggleAll={(ids, on) =>
                    setSelected((s) => ({
                      ...s,
                      PRODUCTS: on ? [...new Set([...s.PRODUCTS, ...ids])] : s.PRODUCTS.filter((v) => !ids.includes(v)),
                    }))
                  }
                />
              )}
              {err("selectionValues") && <p className="text-sm text-red-600">{err("selectionValues")}</p>}
            </>
          )}
        </div>

        <div className={panel(2)}>
          <StepTitle
            n={3}
            title="Prices for this link"
            text="Lower prices for customers who get this link only. Your sheet prices and other links don't change."
            aside={
              discountedCount > 0 ? (
                <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
                  {discountedCount} discounted
                </span>
              ) : undefined
            }
          />
          <input type="hidden" name="pricing" value={JSON.stringify(pricing)} />
          {isDefault ? (
            <p className="text-sm text-stone-600">
              Your default link always uses your sheet prices. Make a custom link to give some customers a discount.
            </p>
          ) : (
            <>
              <fieldset>
                <legend className="sr-only">Discount</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PRICING_MODES.map((m) => (
                    <label
                      key={m.value}
                      className={`cursor-pointer rounded-xl border p-3 text-sm transition ${pricingMode === m.value ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-stone-200 hover:border-stone-300"}`}
                    >
                      <input
                        type="radio"
                        value={m.value}
                        checked={pricingMode === m.value}
                        onChange={() => {
                          setPricingMode(m.value);
                          setStepError(undefined);
                        }}
                        className="sr-only"
                      />
                      <span className="block font-semibold">{m.label}</span>
                      <span className="block text-xs text-stone-500">{m.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {pricingMode === "ALL" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-stone-700">Discount on all {linkProducts.length} products</p>
                  <DiscountInput label="Discount on all products" value={allDiscount} onChange={setAllDiscount} />
                  {linkProducts[0] && (
                    <p className="text-sm text-stone-500">
                      e.g. {linkProducts[0].name}: <PricePreview price={linkProducts[0].price} discount={readDiscount(allDiscount)} />
                    </p>
                  )}
                </div>
              )}

              {pricingMode === "GROUP" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-stone-700">Discount for the ticked products</p>
                  <DiscountInput label="Discount for selected products" value={groupDiscount} onChange={setGroupDiscount} />
                  <ProductChecklist
                    products={linkProducts}
                    isChecked={(id) => groupIds.includes(id)}
                    onToggle={(id) => setGroupIds((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]))}
                    onToggleAll={(ids, on) => setGroupIds((x) => (on ? [...new Set([...x, ...ids])] : x.filter((v) => !ids.includes(v))))}
                    aside={(p) => (
                      <PricePreview price={p.price} discount={groupIds.includes(p.id) ? readDiscount(groupDiscount) : null} />
                    )}
                  />
                </div>
              )}

              {pricingMode === "EACH" && (
                <div className="space-y-3">
                  <SearchField
                    name={undefined}
                    value={eachQuery}
                    onChange={(e) => setEachQuery(e.target.value)}
                    placeholder="Search name, SKU, category…"
                    aria-label="Search products to discount"
                  />
                  <ul className="max-h-[28rem] divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
                    {linkProducts
                      .filter((p) => {
                        const q = eachQuery.trim().toLowerCase();
                        return !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
                      })
                      .map((p) => {
                        const draft = eachDiscounts[p.id] ?? EMPTY_DISCOUNT;
                        return (
                          <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                            <ProductThumb image={p.image} alt="" className="size-10 shrink-0 rounded-md text-[0px]" />
                            <span className="min-w-[10rem] flex-1">
                              <span className="block truncate text-sm">{p.name}</span>
                              <span className="block text-xs">
                                <PricePreview price={p.price} discount={readDiscount(draft)} />
                              </span>
                            </span>
                            <DiscountInput
                              compact
                              label={`Discount for ${p.name}`}
                              value={draft}
                              onChange={(d) => setEachDiscounts((x) => ({ ...x, [p.id]: d }))}
                            />
                          </li>
                        );
                      })}
                    {linkProducts.length === 0 && <li className="p-4 text-center text-sm text-stone-500">No products on this link yet.</li>}
                  </ul>
                  <p className="text-xs text-stone-500">Leave a box empty for no discount on that product.</p>
                </div>
              )}
              {err("pricing") && <p className="text-sm text-red-600">{err("pricing")}</p>}
            </>
          )}
        </div>

        <div className={panel(3)}>
          <StepTitle n={4} title="Options" text="What customers can see and do on this link." />
          <div className="space-y-3">
            <Checkbox name="showPrice" label="Show prices" defaultChecked={link?.showPrice ?? true} />
            <Checkbox name="allowOrdering" label="Allow customers to order" defaultChecked={link?.allowOrdering ?? true} />
            {isDefault ? (
              <input type="hidden" name="isActive" value="on" />
            ) : (
              <Checkbox name="isActive" label="Link is on (turn off to stop it opening)" defaultChecked={link?.isActive ?? true} />
            )}
          </div>
          <div className="rounded-xl bg-stone-50 p-4 text-sm">
            <p className="font-medium text-stone-900">{name.trim() || "Untitled link"}</p>
            <p className="mt-0.5 text-stone-500">
              {link ? `${host}/c/${link.slug}` : `${host}/c/${suggestedSlug}`} · {matching} product{matching === 1 ? "" : "s"}
              {discountedCount > 0 && ` · ${discountedCount} discounted`}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => open(step - 1)}>
            <ArrowLeft aria-hidden="true" className="size-4" /> Back
          </Button>
        )}
        <div className="ml-auto flex gap-3">
          {step < last && (
            <Button type="button" variant={editing ? "secondary" : "primary"} onClick={next}>
              Next <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
          {(editing || step === last) && (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save link" : "Create link"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function StepTitle({ n, title, text, aside }: { n: number; title: string; text: string; aside?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Step {n} of {STEPS.length}</p>
        <h2 className="mt-0.5 text-lg font-semibold">{title}</h2>
        <p className="text-sm text-stone-500">{text}</p>
      </div>
      {aside}
    </div>
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
          className={`flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition ${isChecked(f.name) ? "border-brand-500 bg-brand-50 font-medium text-brand-700" : "border-stone-300 hover:border-stone-400"}`}
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

/** Product list with tick-boxes and a "Select all" for the products shown. */
function ProductChecklist({
  products,
  isChecked,
  onToggle,
  onToggleAll,
  aside,
}: {
  products: PickerProduct[];
  isChecked: (id: string) => boolean;
  onToggle: (id: string) => void;
  /** Ticks (on) or unticks all of `ids`. */
  onToggleAll: (ids: string[], on: boolean) => void;
  /** Extra text at the end of each row (e.g. the new price). */
  aside?: (p: PickerProduct) => ReactNode;
}) {
  const ids = products.map((p) => p.id);
  const ticked = ids.filter(isChecked).length;
  const all = ids.length > 0 && ticked === ids.length;
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200">
      <label className="flex cursor-pointer items-center gap-3 border-b border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = ticked > 0 && !all;
          }}
          disabled={ids.length === 0}
          onChange={() => onToggleAll(ids, !all)}
          className="size-5 shrink-0 accent-brand-500"
        />
        Select all
        <span className="ml-auto text-xs font-normal text-stone-500">
          {ticked} of {ids.length} selected
        </span>
      </label>
      <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
        {products.length === 0 && <li className="p-4 text-center text-sm text-stone-500">No products match.</li>}
        {products.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-stone-50">
              <input
                type="checkbox"
                checked={isChecked(p.id)}
                onChange={() => onToggle(p.id)}
                className="size-5 shrink-0 accent-brand-500"
              />
              <ProductThumb image={p.image} alt="" className="size-10 shrink-0 rounded-md text-[0px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block truncate text-xs text-stone-500">
                  {p.sku} · {p.category}
                  {SHOW_CATALOGS && p.catalogName ? ` · ${p.catalogName}` : ""}
                  {!p.visible && " · not on links"}
                </span>
              </span>
              {aside && <span className="shrink-0 text-xs">{aside(p)}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductPicker({
  products,
  selected,
  onToggle,
  onToggleAll,
}: {
  products: PickerProduct[];
  selected: string[];
  onToggle: (v: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
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
        <SearchField
          name={undefined}
          className="flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, SKU, category…"
          aria-label="Search products"
        />
        <label className="flex items-center gap-2 text-sm whitespace-nowrap text-stone-600">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
            className="size-4 accent-brand-500"
          />
          Show selected only ({selected.length})
        </label>
      </div>
      <ProductChecklist products={list} isChecked={(id) => chosen.has(id)} onToggle={onToggle} onToggleAll={onToggleAll} />
    </div>
  );
}
