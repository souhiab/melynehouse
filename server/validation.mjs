import { z } from "zod";

const money = z.number().finite().min(0).max(1_000_000);
const identifier = z.string().trim().min(1).max(200);
const nullableMoney = money.nullable().optional();

export const loginSchema = z.object({ email: z.email().max(320), password: z.string().min(1).max(1000) }).strict();

export const variantSchema = z.object({
  id: identifier.optional(),
  name: z.string().trim().min(1).max(500),
  selections: z.array(z.object({ option: z.string().max(120), optionKey: z.string().nullable().optional(), value: z.string().max(200) }).strict()).max(10),
  priceMad: money,
  comparisonPriceMad: nullableMoney,
  stockQuantity: z.number().int().min(0).max(10_000_000).nullable().optional(),
  available: z.boolean(),
  imageId: identifier.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.comparisonPriceMad != null && value.comparisonPriceMad < value.priceMad) ctx.addIssue({ code: "custom", path: ["comparisonPriceMad"], message: "Comparison price cannot be lower than the selling price" });
});

export const productSchema = z.object({
  id: identifier.optional(), sku: z.string().trim().max(120).nullable().optional(),
  slug: z.string().trim().min(1).max(300).regex(/^[^/?#]+$/),
  originalName: z.string().trim().min(1).max(500), displayName: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).nullable().optional(), descriptionHtml: z.string().max(100_000).nullable().optional(),
  priceMad: money, comparisonPriceMad: nullableMoney,
  availability: z.enum(["available", "unavailable"]), status: z.enum(["published", "hidden", "archived"]),
  categorySlugs: z.array(identifier).min(1).max(10), options: z.array(z.unknown()).max(20).default([]),
  variants: z.array(variantSchema).max(500).default([]),
  featured: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
  if (value.comparisonPriceMad != null && value.comparisonPriceMad < value.priceMad) ctx.addIssue({ code: "custom", path: ["comparisonPriceMad"], message: "Comparison price cannot be lower than the selling price" });
  if (new Set(value.categorySlugs).size !== value.categorySlugs.length) ctx.addIssue({ code: "custom", path: ["categorySlugs"], message: "Categories must be unique" });
  const variants = new Set();
  for (const [index, variant] of value.variants.entries()) {
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

