import { colorOptionFor } from "./product-colors.js";

export const generalWhatsAppMessage = "مرحباً، أنا أتصفح متجر MELYNE وأود الاستفسار عن بعض المنتجات. هل يمكنكم مساعدتي؟ شكراً.";

export function publicProductUrl(product, storeDomain) {
  if (!product?.canonicalUrl) return null;
  try {
    const url = new URL(product.canonicalUrl);
    const store = new URL(storeDomain);
    return url.protocol === "https:" && url.hostname === store.hostname && url.pathname.startsWith("/products/")
      ? url.href : null;
  } catch { return null; }
}

export function productWhatsAppMessage(product, selected = {}, storeDomain) {
  const colorOption = colorOptionFor(product);
  const sizeOption = product.options?.find((option) => {
    const name = String(option.key || option.name || "").toLowerCase();
    return name.includes("size") || name.includes("taille") || name.includes("مقاس");
  });
  const color = colorOption && selected[colorOption.name];
  const size = sizeOption && selected[sizeOption.name];
  const url = publicProductUrl(product, storeDomain);
  const lines = [
    "مرحباً، أنا مهتم بهذا المنتج من متجر MELYNE:",
    "",
    `المنتج: ${product.name}`,
    ...(product.sku ? [`رمز المنتج: ${product.sku}`] : []),
    ...(color ? [`اللون: ${color}`] : []),
    ...(size ? [`المقاس: ${size}`] : []),
    ...(url ? [`رابط المنتج: ${url}`] : []),
    "",
    "أود معرفة المزيد عن هذا المنتج والتأكد من توفر الألوان والمقاسات. شكراً لكم!",
  ];
  return lines.join("\n");
}

export function whatsAppHref(number, message) {
  const normalized = String(number || "").replace(/\s+/g, "");
  if (!/^\d{8,15}$/.test(normalized)) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
