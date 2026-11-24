import {storeModules,storeTab} from './store-modules.js';
import {marketingModules,marketingTab} from './marketing-modules.js';
export const ownerNavigation = [
  { heading: "MELYNE", items: [{id:"team",label:"\u0627\u0644\u0641\u0631\u064a\u0642",icon:"Users",path:"/owner/team"}] },
  { heading: "الرئيسية", items: [
    { id: "dashboard", label: "لوحة التحكم", icon: "House", path: "/owner/dashboard" },
    { id: "analytics", label: "الإحصائيات", icon: "ChartBar", path: "/owner/analytics" },
    { id: "team-analytics", label: "إحصائيات الفريق", icon: "Users", path: "/owner/analytics/team" },
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
  {heading:'التسويق',sections:[{id:'marketing',label:'التسويق',icon:'Megaphone',path:'/owner/marketing',children:marketingModules.map(item=>({id:marketingTab(item.key),label:item.label,icon:'Tag',marketingModule:item,path:'/owner/marketing/'+item.key}))}]},
  {heading:'المتجر',sections:[{id:'store',label:'المتجر',icon:'Storefront',path:'/owner/store',children:storeModules.map(item=>({id:storeTab(item.key),label:item.label,icon:item.icon,path:'/owner/store/'+item.key}))}]},
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

export function canAccessOwnerTab(role,tab) {
 if(role==='super_admin')return true;
 if(role==='products_marketing')return tab==='store'||storeModules.some(item=>storeTab(item.key)===tab)||tab==='marketing'||marketingModules.some(item=>marketingTab(item.key)===tab)||['products','add-product','collections','stock','brands','suppliers','ordering','banners'].includes(tab);
 return ['confirmation','follow_up'].includes(role)&&['orders','new-order'].includes(tab);
}

export function ownerLandingTab(role,pathname){
 const tab=ownerTabFromPath(pathname);
 return canAccessOwnerTab(role,tab)?tab:role==='products_marketing'?'products':'orders';
}
