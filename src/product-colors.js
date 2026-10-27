export function colorOptionFor(product) {
  return product.options?.find((option) => {
    const name = String(option.key || option.name || "").toLowerCase();
    return name.includes("color") || name.includes("colour") || name.includes("لون");
  }) || null;
}

export function colorOfVariant(variant, option) {
  if (!option) return null;
  return variant.selections?.find((selection) =>
    selection.option === option.name || (option.key && selection.optionKey === option.key)
  )?.value || null;
}

export function imagesForColor(product, color) {
  if (!color) return product.images;
  const option = colorOptionFor(product);
  const linkedIds = new Set(product.variants
    .filter((variant) => colorOfVariant(variant, option) === color && variant.imageId)
    .map((variant) => variant.imageId));
  const images = product.images.filter((image) => image.colorLabel === color || linkedIds.has(image.id));
  return images.length ? images : product.images;
}

export function thumbnailForColor(product, color) {
  const option = colorOptionFor(product);
  const linkedIds = new Set(product.variants
    .filter((variant) => colorOfVariant(variant, option) === color && variant.imageId)
    .map((variant) => variant.imageId));
  return product.images.find((image) => linkedIds.has(image.id) || image.colorLabel === color) || null;
}
