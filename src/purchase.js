export function validateDirectPurchase(product, selected, quantity) {
  const missing = (product.options || []).find((option) => !selected[option.name]);
  if (missing) return { error: `يرجى اختيار ${missing.name} أولاً.`, item: null };
  const variant = product.variants.find((entry) => entry.selections.every(
    (selection) => selected[selection.option] === selection.value,
  ));
  if (product.availability !== "available" ||
      (product.variants.length > 0 && (!variant || variant.availability !== "available" || variant.stockQuantity === 0))) {
    return { error: "هذه التوليفة غير متوفرة حالياً.", item: null };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 ||
      (variant?.stockQuantity != null && quantity > variant.stockQuantity)) {
    return { error: "الكمية المطلوبة غير متوفرة.", item: null };
  }
  return { error: null, item: {
    key: `${product.id}:${variant?.id || "default"}`,
    productId: product.id,
    variantId: variant?.id || null,
    quantity,
  } };
}

export function checkoutLines(cart, directPurchase, directMode) {
  return directMode ? (directPurchase ? [directPurchase] : []) : cart;
}
