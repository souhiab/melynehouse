import { publicProductUrl } from "../whatsapp.js";
import { selectionValue } from "./order-view-model.js";

export function normalizeCustomerWhatsAppPhone(value) {
  const input = String(value || "").trim();
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return null;
  const compact = input.replace(/[\s().-]/g, "");
  const validInternational = (digits) => /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
  if (compact.startsWith("+")) return validInternational(compact.slice(1));
  if (compact.startsWith("00")) return validInternational(compact.slice(2));
  if (/^0[5-7]\d{8}$/.test(compact)) return `212${compact.slice(1)}`;
  if (/^212[5-7]\d{8}$/.test(compact)) return compact;
  return null;
}

export function orderConfirmationMessage(order, publicProducts = [], storeDomain) {
  const name = String(order?.customer?.name || "").trim();
  const number = String(order?.order_number || "").trim();
  const published = new Map(publicProducts.filter((product) => product.status === "published").map((product) => [product.id, product]));
  const items = (order?.items || []).map((item, index) => {
    const savedName = String(item?.productSnapshot?.originalName || item?.productSnapshot?.displayName || "").trim();
    const color = selectionValue(item, "color");
    const size = selectionValue(item, "size");
    const quantity = Number(item?.quantity);
    const product = published.get(item?.productSnapshot?.id);
    const url = product ? publicProductUrl(product, storeDomain) : null;
    return [
      ...(savedName ? [`${order.items.length > 1 ? `${index + 1}. ` : ""}المنتج: ${savedName}`] : []),
      ...(color ? [`اللون: ${color}`] : []),
      ...(size ? [`المقاس: ${size}`] : []),
      ...(Number.isSafeInteger(quantity) && quantity > 0 ? [`الكمية: ${quantity}`] : []),
      ...(url ? [`رابط المنتج: ${url}`] : []),
    ].join("\n");
  }).filter(Boolean);
  return [
    `السلام عليكم${name ? ` ${name}` : ""}،`,
    "",
    "معكم فريق MELYNE House.",
    "",
    ...(number ? [`نتواصل معكم لتأكيد طلبكم رقم ${number}.`, ""] : []),
    ...items.flatMap((item, index) => index ? ["", item] : [item]),
    ...(items.length ? [""] : []),
    "نود التأكد من معلومات طلبكم قبل متابعة تجهيزه.",
    "",
    "هل يمكنكم تأكيد الطلب من فضلكم؟",
    "",
    "شكراً لثقتكم في MELYNE House.",
  ].join("\n");
}

export function customerWhatsAppHref(order, publicProducts, storeDomain) {
  const phone = normalizeCustomerWhatsAppPhone(order?.customer?.phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(orderConfirmationMessage(order, publicProducts, storeDomain))}`;
}
