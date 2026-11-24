import { AnalyticsHome } from "./AnalyticsHome.jsx";
import { DashboardHome } from "./DashboardHome.jsx";
import { ChartBar, Package, WarningCircle } from "@phosphor-icons/react";

const money = (value) => new Intl.NumberFormat("ar-MA", { style: "currency", currency: "MAD" }).format(Number(value || 0));

export function DashboardPanel({goTo}) { return <DashboardHome goTo={goTo}/>; }

export function AnalyticsPanel() { return <AnalyticsHome/>; }

export function CollectionsPanel({ data }) {
  return <section className="owner-simple-panel"><div className="panel-title"><div><h1>التصنيفات</h1><p>التصنيفات الموجودة في قاعدة البيانات؛ اختر تصنيفات المنتج من محرر المنتجات.</p></div></div><div className="owner-simple-list">{data.categories.map((category) => <article key={category.slug}><strong>{category.name}</strong><span>{data.products.filter((product) => product.status !== "archived" && product.categories.some((item) => item.slug === category.slug)).length} منتج غير مؤرشف</span></article>)}</div></section>;
}

export function StockPanel({ data }) {
  const rows = data.products.filter((product) => product.status !== "archived").flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ variant }) => variant.stockQuantity == null || variant.stockQuantity <= 5 || variant.availability !== "available");
  return <section className="owner-simple-panel"><div className="panel-title"><div><h1>المخزون</h1><p>التوليفات التي مخزونها غير محدد أو منخفض أو غير متاحة. عدّل الكمية من محرر المنتج.</p></div></div><div className="owner-simple-list">{rows.map(({ product, variant }) => <article key={variant.id}><strong>{product.displayName} — {variant.name}</strong><span>{variant.stockQuantity == null ? "غير محدد — الطلب محظور" : `${variant.stockQuantity} متوفر`}{variant.availability !== "available" ? " · غير متاح" : ""}</span></article>)}{!rows.length && <p>لا توجد توليفات تحتاج مراجعة.</p>}</div></section>;
}

export function MetadataPanel({ data, kind }) {
  const isBrand = kind === "brands";
  const field = isBrand ? "brandName" : "supplierName";
  const counts = new Map();
  data.products.filter((product) => product.status !== "archived").forEach((product) => {
    const value = product[field]?.trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return <section className="owner-simple-panel"><div className="panel-title"><div><h1>{isBrand ? "العلامات التجارية" : "الموردون"}</h1><p>تُدار هذه البيانات من محرر المنتج؛ لا توجد سجلات منفصلة للجهات حالياً.</p></div></div><div className="owner-simple-list">{[...counts].sort((a, b) => a[0].localeCompare(b[0], "ar")).map(([name, count]) => <article key={name}><strong>{name}</strong><span>{count} منتج</span></article>)}{!counts.size && <p>لا توجد بيانات محفوظة بعد.</p>}</div></section>;
}
