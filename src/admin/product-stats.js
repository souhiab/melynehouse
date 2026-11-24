// The public storefront endpoint is the source of truth for what customers can see.
export function deriveProductStats(products, publicProducts) {
  return {
    total: products.length, // Includes archived records retained for order history.
    published: products.filter((product) => product.status === "published").length,
    draft: products.filter((product) => product.status === "draft").length,
    visible: publicProducts.length,
    variable: products.filter((product) => product.status !== "archived" && product.variants?.length > 1).length,
  };
}

export function filterOwnerProducts(products, query, status) {
  const normalized = query.trim().toLocaleLowerCase();
  return products.filter((product) => {
    if (status === 'variable') {
      if(product.status === 'archived' || !(product.variants?.length > 1)) return false;
    } else if (status !== "all" && product.status !== status) return false;
    if (!normalized) return true;
    return [product.displayName, product.name, product.sku, product.slug]
      .some((value) => String(value || "").toLocaleLowerCase().includes(normalized));
  });
}
