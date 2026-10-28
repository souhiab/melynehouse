export const ownerNavigation = [
  { heading: "الرئيسية", items: [
    { id: "dashboard", label: "لوحة التحكم", icon: "House", path: "/owner/dashboard" },
    { id: "analytics", label: "الإحصائيات", icon: "ChartBar", path: "/owner/analytics" },
  ] },
  { heading: "التجارة الإلكترونية", sections: [
    { id: "orders", label: "الطلبات", icon: "ShoppingBag", path: "/owner/orders", children: [
      { id: "orders", label: "جميع الطلبات", icon: "ShoppingBag", path: "/owner/orders" },
      { id: "new-order", label: "طلب جديد", icon: "Plus", path: "/owner/orders/new" },
      { id: "customers", label: "العملاء", icon: "Users", planned: true },
      { id: "payments", label: "المدفوعات", icon: "CreditCard", planned: true },
      { id: "invoices", label: "الفواتير", icon: "FileText", planned: true },
    ] },
    { id: "products", label: "المنتجات", icon: "Package", path: "/owner/products", children: [
      { id: "products", label: "جميع المنتجات", icon: "Package", path: "/owner/products" },
      { id: "add-product", label: "إضافة منتج", icon: "Plus", path: "/owner/products/new" },
      { id: "collections", label: "التصنيفات", icon: "Tag", path: "/owner/collections" },
      { id: "stock", label: "المخزون", icon: "Warehouse", path: "/owner/stock" },
      { id: "brands", label: "العلامات التجارية", icon: "Tag", path: "/owner/brands" },
      { id: "suppliers", label: "الموردون", icon: "Factory", path: "/owner/suppliers" },
    ] },
  ] },
  { heading: "إدارة المتجر", items: [
    { id: "ordering", label: "ترتيب المنتجات", icon: "ListNumbers", path: "/owner/ordering" },
    { id: "banners", label: "الواجهات", icon: "Image", path: "/owner/banners" },
  ] },
];

export const ownerItems = ownerNavigation.flatMap((group) => [
  ...(group.items || []),
  ...(group.sections || []).flatMap((section) => [section, ...section.children]),
]);

export function ownerTabFromPath(pathname) {
  if (pathname === "/owner" || pathname === "/owner/") return "products";
  return ownerItems.find((item) => item.path === pathname)?.id || "products";
}

export function ownerPathForTab(tab) {
  return ownerItems.find((item) => item.id === tab && item.path)?.path || "/owner/products";
}

export function ownerSectionForTab(tab) {
  return ownerNavigation.flatMap((group) => group.sections || []).find((section) => section.children.some((item) => item.id === tab))?.id || null;
}
