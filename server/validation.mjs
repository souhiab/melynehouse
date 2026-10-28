import { z } from "zod";

const money = z.number().finite().min(0).max(1_000_000);
const identifier = z.string().trim().min(1).max(200);
const nullableMoney = money.nullable().optional();
const optionalText = (max) => z.string().trim().max(max).nullable().optional();
const optionalMeasure = z.number().finite().min(0).max(1_000_000).nullable().optional();

export const loginSchema = z.object({ email: z.email().max(320), password: z.string().min(1).max(1000) }).strict();

export const imageColorSchema = z.object({ colorLabel: z.string().min(1).max(200).nullable() }).strict();

const optionSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(120), key: z.string().max(120).nullable().optional(),
  values: z.array(z.object({ id: identifier, label: z.string().min(1).max(200).refine((label) => label.trim().length > 0), secondaryLabel: z.string().max(200).nullable().optional() }).strict()).max(100),
}).strict();

export const variantSchema = z.object({
  id: identifier.optional(),
  name: z.string().trim().min(1).max(500),
  selections: z.array(z.object({ option: z.string().max(120), optionKey: z.string().nullable().optional(), value: z.string().max(200) }).strict()).max(10),
  priceMad: money,
  comparisonPriceMad: nullableMoney,
  stockQuantity: z.number().int().min(0).max(10_000_000).nullable().optional(),
  available: z.boolean(),
  retired: z.boolean().default(false),
  imageId: identifier.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.comparisonPriceMad != null && value.comparisonPriceMad < value.priceMad) ctx.addIssue({ code: "custom", path: ["comparisonPriceMad"], message: "Comparison price cannot be lower than the selling price" });
  if (value.retired && value.available) ctx.addIssue({ code: "custom", path: ["available"], message: "A retired variant cannot be available" });
});

export const productSchema = z.object({
  id: identifier.optional(), sku: z.string().trim().max(120).nullable().optional(),
  slug: z.string().trim().min(1).max(300).regex(/^[^/?#]+$/),
  originalName: z.string().trim().min(1).max(500), displayName: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).nullable().optional(), descriptionHtml: z.string().max(100_000).nullable().optional(),
  shortDescription: optionalText(2_000), costPriceMad: nullableMoney,
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  brandName: optionalText(120), modelName: optionalText(120), supplierName: optionalText(120),
  badgeText: optionalText(40), badgeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  seoTitle: optionalText(160), metaDescription: optionalText(320),
  weightKg: optionalMeasure, widthCm: optionalMeasure, heightCm: optionalMeasure, depthCm: optionalMeasure,
  priceMad: money, comparisonPriceMad: nullableMoney,
  availability: z.enum(["available", "unavailable"]), status: z.enum(["draft", "published", "hidden", "archived"]),
  categorySlugs: z.array(identifier).min(1).max(10), options: z.array(optionSchema).max(20).default([]),
  variants: z.array(variantSchema).max(500).default([]),
  featured: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
  if (value.comparisonPriceMad != null && value.comparisonPriceMad < value.priceMad) ctx.addIssue({ code: "custom", path: ["comparisonPriceMad"], message: "Comparison price cannot be lower than the selling price" });
  if (new Set(value.categorySlugs).size !== value.categorySlugs.length) ctx.addIssue({ code: "custom", path: ["categorySlugs"], message: "Categories must be unique" });
  if (new Set(value.options.map((option) => option.id)).size !== value.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique" });
  for (const [index, option] of value.options.entries()) {
    if (new Set(option.values.map((item) => item.label)).size !== option.values.length) ctx.addIssue({ code: "custom", path: ["options", index, "values"], message: "Option values must be unique" });
  }
  const activeOptions = value.options.filter((option) => option.values.length);
  const variants = new Set();
  for (const [index, variant] of value.variants.entries()) {
    const selectedOptions = new Set();
    if (!variant.retired && variant.selections.length !== activeOptions.length) ctx.addIssue({ code: "custom", path: ["variants", index, "selections"], message: "Each active variant must select every active option" });
    for (const [selectionIndex, selection] of variant.selections.entries()) {
      if (variant.retired) continue;
      const option = activeOptions.find((item) => (item.key || item.name) === (selection.optionKey || selection.option) || item.name === selection.option);
      const optionId = option?.id;
      if (!option || selectedOptions.has(optionId) || !option.values.some((item) => item.label === selection.value)) {
        ctx.addIssue({ code: "custom", path: ["variants", index, "selections", selectionIndex], message: "Variant selection must match a unique product option and value" });
      }
      if (optionId) selectedOptions.add(optionId);
    }
    const signature = variant.selections.map((selection) => `${selection.optionKey || selection.option}=${selection.value}`).sort().join("|");
    if (variants.has(signature)) ctx.addIssue({ code: "custom", path: ["variants", index, "selections"], message: "Variant selections must be unique" });
    variants.add(signature);
  }
});

export const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(200), phone: z.string().trim().min(6).max(40),
    city: z.string().trim().min(2).max(200), address: z.string().trim().min(4).max(1000),
  }).strict(),
  note: z.string().max(2000).optional().default(""),
  items: z.array(z.object({ productId: identifier, variantId: identifier.nullable().optional(), quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(50),
}).strict();

export const manualOrderSchema = orderSchema.safeExtend({
  source: z.enum(["whatsapp", "instagram", "facebook", "website", "other"]),
});

export const bannerSchema = z.object({
  headingAr: z.string().trim().min(1).max(300), supportingTextAr: z.string().max(1000).nullable().optional(),
  buttonLabelAr: z.string().max(120).nullable().optional(), destinationUrl: z.string().max(2000).nullable().optional(),
  desktopImageUrl: z.string().trim().min(1).max(2000), mobileImageUrl: z.string().max(2000).nullable().optional(),
  imageAltAr: z.string().trim().min(1).max(500), status: z.enum(["draft", "published", "archived"]),
  activeFrom: z.iso.datetime().nullable().optional(), activeUntil: z.iso.datetime().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.destinationUrl && !isSafeDestination(value.destinationUrl)) ctx.addIssue({ code: "custom", path: ["destinationUrl"], message: "Use a relative store path or an https URL" });
  if (value.activeFrom && value.activeUntil && new Date(value.activeUntil) <= new Date(value.activeFrom)) ctx.addIssue({ code: "custom", path: ["activeUntil"], message: "End date must be later than start date" });
});

export function isSafeDestination(value) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = new Error("Validation failed"); error.status = 400; error.details = result.error.flatten(); throw error;
  }
  return result.data;
}

