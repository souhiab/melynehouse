export const ORDER_STATUSES = [
  { id: "new", label: "قيد الانتظار", tone: "pending" },
  { id: "no_response", label: "لا يرد", tone: "no-response" },
  { id: "confirmed", label: "مؤكد", tone: "confirmed" },
  { id: "preparing", label: "قيد التجهيز", tone: "preparing" },
  { id: "shipped", label: "تم الشحن", tone: "shipped" },
  { id: "delivered", label: "تم التوصيل", tone: "delivered" },
  { id: "cancelled", label: "ملغى", tone: "cancelled" },
];

export const ORDER_SOURCES = [
  { id: "website", label: "الموقع" },
  { id: "whatsapp", label: "واتساب" },
  { id: "instagram", label: "إنستغرام" },
  { id: "facebook", label: "فيسبوك" },
  { id: "tiktok", label: "تيك توك" },
  { id: "phone", label: "الهاتف" },
  { id: "other", label: "مصدر آخر" },
  { id: "unknown", label: "غير معروف / قديم" },
];

export const ORDER_TRANSITIONS = {
  new: ["no_response", "confirmed", "cancelled"],
  no_response: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const statusLabel = (id) => ORDER_STATUSES.find((item) => item.id === id)?.label || id || "غير معروف";
export const sourceLabel = (id) => ORDER_SOURCES.find((item) => item.id === id)?.label || "غير معروف / قديم";
export const productName = (item) => item?.productSnapshot?.originalName || item?.productSnapshot?.displayName || "منتج محفوظ";

export function selectionValue(item, kind) {
  const pattern = kind === "size" ? /size|taille|مقاس|قياس/i : /colou?r|لون/i;
  const selection = item?.variantSnapshot?.selections?.find((entry) => pattern.test(`${entry.optionKey || ""} ${entry.option || ""}`));
  return selection?.value || null;
}

export function lineTotal(item) {
  return Math.round(Number(item?.unitPriceMad || 0) * 100) * Number(item?.quantity || 0) / 100;
}
