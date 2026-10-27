import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Eye,
  FileText,
  Image,
  List,
  ListNumbers,
  MagnifyingGlass,
  Package,
  Plus,
  SignOut,
  Storefront,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { colorOptionFor, colorOfVariant } from "../product-colors.js";
import { deriveProductStats, filterOwnerProducts } from "./product-stats.js";
import { readSidebarPreference, saveSidebarPreference } from "./sidebar-preference.js";
import "./admin.css";

const csrfToken = () => decodeURIComponent(
  document.cookie.split("; ").find((row) => row.startsWith("melyne_owner_csrf="))?.split("=").slice(1).join("=") || "",
);

async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
    ...(options.headers || {}),
  };
  if (!["GET", "HEAD"].includes(options.method || "GET")) headers["x-csrf-token"] = csrfToken();
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.details?.fieldErrors
      ? Object.values(body.details.fieldErrors).flat().filter(Boolean).join("، ")
      : "";
    throw new Error([body?.error || `Request failed (${response.status})`, detail].filter(Boolean).join(": "));
  }
  return body;
}

const money = (value) => new Intl.NumberFormat("ar-MA", { style: "currency", currency: "MAD" }).format(Number(value || 0));
const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 16) : "");
const fromInputDate = (value) => (value ? new Date(value).toISOString() : null);
const swap = (list, a, b) => {
  const copy = [...list];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
};

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await api("/api/admin/session", { method: "POST", body: JSON.stringify({ email, password }) });
      await onLogin();
    } catch (exception) {
      setError(exception.message);
    }
  };
  return (
    <main className="owner-login" dir="rtl">
      <form onSubmit={submit}>
        <img src="/images/brand/melyne-logo.png" alt="MELYNE" />
        <h1>لوحة مالكة المتجر</h1>
        <p>إدارة خاصة للمنتجات والواجهة والطلبات.</p>
        {error && <div className="owner-error" role="alert">{error}</div>}
        <label>البريد الإلكتروني<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>كلمة المرور<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button type="submit">تسجيل الدخول</button>
      </form>
    </main>
  );
}

function MoveButtons({ index, count, onMove, label }) {
  return (
    <span className="move-buttons">
      <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`نقل ${label} إلى أعلى`}><ArrowUp /></button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={`نقل ${label} إلى أسفل`}><ArrowDown /></button>
    </span>
  );
}

const optionKind = (option) => {
  const name = String(option?.key || option?.name || "").toLowerCase();
  if (name.includes("size") || name.includes("مقاس")) return "size";
  if (name.includes("color") || name.includes("colour") || name.includes("لون")) return "color";
  return null;
};

const selectionSignature = (selections) => selections
  .map((selection) => `${String(selection.optionKey || selection.option).toLowerCase()}=${selection.value}`)
  .sort()
  .join("|");

function buildVariants(options, previous, priceMad, comparisonPriceMad) {
  const active = options.filter((option) => Array.isArray(option.values) && option.values.length);
  if (!active.length) return [];
  const combinations = active.reduce(
    (sets, option) => sets.flatMap((set) => option.values.map((value) => [...set, {
      option: option.name,
      optionKey: option.key || option.name,
      value: value.label,
    }])),
    [[]],
  );
  const existing = new Map(previous.map((variant) => [selectionSignature(variant.selections), variant]));
  return combinations.map((selections) => {
    const match = existing.get(selectionSignature(selections));
    return match || {
      name: selections.map((selection) => `${selection.option} : ${selection.value}`).join(" | "),
      selections,
      priceMad: Number(priceMad || 0),
      comparisonPriceMad: comparisonPriceMad === "" || comparisonPriceMad == null ? null : Number(comparisonPriceMad),
      stockQuantity: null,
      available: true,
      imageId: null,
    };
  });
}

function ProductEditor({ product, categories, onSaved, onCancel }) {
  const initial = product ? {
    id: product.id,
    sku: product.sku || "",
    slug: product.slug,
    originalName: product.name,
    displayName: product.displayName,
    description: product.description || "",
    descriptionHtml: product.descriptionHtml || "",
    priceMad: product.price.current,
    comparisonPriceMad: product.price.comparison,
    availability: product.availability,
    status: product.status,
    categorySlugs: product.categories.map((category) => category.slug),
    options: product.options || [],
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      selections: variant.selections,
      priceMad: variant.price.current,
      comparisonPriceMad: variant.price.comparison,
      stockQuantity: variant.stockQuantity,
      available: variant.availability === "available",
      imageId: variant.imageId || null,
    })),
    featured: Boolean(product.featured),
  } : {
    sku: "",
    slug: "",
    originalName: "",
    displayName: "",
    description: "",
    descriptionHtml: "",
    priceMad: 0,
    comparisonPriceMad: null,
    availability: "available",
    status: "published",
    categorySlugs: [categories[0]?.slug].filter(Boolean),
    options: [],
    variants: [],
    featured: false,
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const optionValues = (kind) => form.options.find((option) => optionKind(option) === kind)?.values?.map((value) => value.label).join(", ") || "";
  const setOptionValues = (kind, text) => {
    const labels = [...new Set(text.split(",").map((value) => value.trim()).filter(Boolean))];
    setForm((current) => {
      const old = current.options.find((option) => optionKind(option) === kind);
      const values = labels.map((label, index) => old?.values?.find((value) => value.label === label) || {
        id: `owner-${kind}-${index}`,
        label,
        secondaryLabel: label,
      });
      const nextOption = { id: old?.id || `owner-${kind}`, name: old?.name || (kind === "size" ? "Size" : "Color"), key: old?.key ?? (kind === "size" ? "size" : null), values };
      const options = [...current.options.filter((option) => optionKind(option) !== kind), nextOption];
      return { ...current, options, variants: buildVariants(options, current.variants, current.priceMad, current.comparisonPriceMad) };
    });
  };
  const updateVariant = (index, change) => update("variants", form.variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...change } : variant));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        priceMad: Number(form.priceMad),
        comparisonPriceMad: form.comparisonPriceMad === "" || form.comparisonPriceMad == null ? null : Number(form.comparisonPriceMad),
        sku: form.sku || null,
        description: form.description || null,
        descriptionHtml: form.descriptionHtml || null,
        variants: form.variants.map((variant) => ({
          ...variant,
          priceMad: Number(variant.priceMad),
          comparisonPriceMad: variant.comparisonPriceMad === "" || variant.comparisonPriceMad == null ? null : Number(variant.comparisonPriceMad),
          stockQuantity: variant.stockQuantity === "" || variant.stockQuantity == null ? null : Number(variant.stockQuantity),
        })),
      };
      await api(product ? `/api/admin/products/${product.id}` : "/api/admin/products", {
        method: product ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await onSaved();
    } catch (exception) {
      setError(exception.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="owner-editor" onSubmit={save}>
      <div className="owner-editor-head"><h2>{product ? "تعديل المنتج" : "منتج جديد"}</h2><button type="button" className="quiet" onClick={onCancel}>إغلاق</button></div>
      {error && <div className="owner-error" role="alert">{error}</div>}
      <div className="owner-form-grid">
        <label>الاسم المعروض<input value={form.displayName} onChange={(event) => update("displayName", event.target.value)} required /></label>
        <label>الاسم الأصلي<input value={form.originalName} onChange={(event) => update("originalName", event.target.value)} required /></label>
        <label>الرابط المختصر<input dir="ltr" value={form.slug} onChange={(event) => update("slug", event.target.value)} required /></label>
        <label>SKU<input dir="ltr" value={form.sku} onChange={(event) => update("sku", event.target.value)} /></label>
        <label>السعر (MAD)<input type="number" min="0" step="0.01" value={form.priceMad} onChange={(event) => update("priceMad", event.target.value)} required /></label>
        <label>السعر قبل التخفيض<input type="number" min="0" step="0.01" value={form.comparisonPriceMad ?? ""} onChange={(event) => update("comparisonPriceMad", event.target.value)} /></label>
        <label>الظهور<select value={form.status} onChange={(event) => update("status", event.target.value)}><option value="published">منشور</option><option value="hidden">مخفي</option><option value="archived">مؤرشف</option></select></label>
        <label>التوفر<select value={form.availability} onChange={(event) => update("availability", event.target.value)}><option value="available">متوفر</option><option value="unavailable">غير متوفر</option></select></label>
        <label>المقاسات (مفصولة بفواصل)<input value={optionValues("size")} onChange={(event) => setOptionValues("size", event.target.value)} /></label>
        <label>الألوان (مفصولة بفواصل)<input value={optionValues("color")} onChange={(event) => setOptionValues("color", event.target.value)} /></label>
      </div>
      <label>الوصف<textarea rows="5" value={form.description} onChange={(event) => update("description", event.target.value)} /></label>
      <fieldset><legend>الفئات</legend><div className="check-row">{categories.map((category) => <label key={category.slug}><input type="checkbox" checked={form.categorySlugs.includes(category.slug)} onChange={(event) => update("categorySlugs", event.target.checked ? [...form.categorySlugs, category.slug] : form.categorySlugs.filter((value) => value !== category.slug))} />{category.name}</label>)}</div></fieldset>
      <label className="check"><input type="checkbox" checked={form.featured} onChange={(event) => update("featured", event.target.checked)} /> منتج مميز في الصفحة الرئيسية</label>
      {form.variants.length > 0 && (
        <fieldset>
          <legend>التوليفات ({form.variants.length})</legend>
          <div className="variant-table" role="region" aria-label="توليفات المنتج" tabIndex="0">
            <table>
              <thead><tr><th>متاح</th><th>التوليفة</th><th>السعر</th><th>السعر السابق</th><th>المخزون</th><th>صورة التوليفة</th></tr></thead>
              <tbody>{form.variants.map((variant, index) => <tr key={variant.id || selectionSignature(variant.selections)}><td><input type="checkbox" checked={variant.available} onChange={(event) => updateVariant(index, { available: event.target.checked })} aria-label={`توفر ${variant.name}`} /></td><td>{variant.name}</td><td><input type="number" min="0" step="0.01" value={variant.priceMad} onChange={(event) => updateVariant(index, { priceMad: event.target.value })} aria-label={`سعر ${variant.name}`} /></td><td><input type="number" min="0" step="0.01" value={variant.comparisonPriceMad ?? ""} onChange={(event) => updateVariant(index, { comparisonPriceMad: event.target.value })} aria-label={`السعر السابق ${variant.name}`} /></td><td><input type="number" min="0" step="1" value={variant.stockQuantity ?? ""} onChange={(event) => updateVariant(index, { stockQuantity: event.target.value })} placeholder="غير محدد" aria-label={`مخزون ${variant.name}`} /></td><td><select value={variant.imageId || ""} onChange={(event) => updateVariant(index, { imageId: event.target.value || null })} aria-label={`صورة ${variant.name}`}><option value="">بلا صورة</option>{product?.images.map((image, imageIndex) => <option key={image.id} value={image.id}>الصورة {imageIndex + 1}{image.colorLabel ? ` — ${image.colorLabel}` : ""}</option>)}</select></td></tr>)}</tbody>
            </table>
          </div>
        </fieldset>
      )}
      <button disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ المنتج"}</button>
    </form>
  );
}

function ImageManager({ product, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const colorOption = colorOptionFor(product);
  const upload = async (event, imageId = null) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("altText", product.displayName);
      await api(imageId ? `/api/admin/products/${product.id}/images/${imageId}` : `/api/admin/products/${product.id}/images`, { method: imageId ? "PUT" : "POST", body });
      await onChanged();
    } catch (exception) {
      setError(exception.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  const move = async (a, b) => {
    const images = swap(product.images, a, b);
    await api(`/api/admin/products/${product.id}/image-order`, { method: "PUT", body: JSON.stringify({ orderedImageIds: images.map((image) => image.id) }) });
    await onChanged();
  };
  const assignColor = async (imageId, colorLabel) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/products/${product.id}/images/${imageId}/color`, { method: "PUT", body: JSON.stringify({ colorLabel: colorLabel || null }) });
      await onChanged();
    } catch (exception) {
      setError(exception.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="image-manager">
      <h3>الصور وترتيبها</h3>
      {colorOption && <p>صور الألوان المرتبطة بالتوليفات تُحدَّد من جدول التوليفات. اربط صور المعرض الإضافية بلونها هنا.</p>}
      {error && <div className="owner-error" role="alert">{error}</div>}
      <div className="image-list">{product.images.map((image, index) => {
        const linkedColors = [...new Set(product.variants.filter((variant) => variant.imageId === image.id).map((variant) => colorOfVariant(variant, colorOption)).filter(Boolean))];
        return <article key={image.id}><img src={image.localOptimizedPath} alt={image.altText || product.displayName} />{colorOption && <label className="image-color-field">لون الصورة<select value={linkedColors[0] || image.colorLabel || ""} onChange={(event) => assignColor(image.id, event.target.value)} disabled={busy || linkedColors.length > 0} aria-label={`لون الصورة ${index + 1}`}><option value="">غير محدد</option>{colorOption.values.map((value) => <option key={value.id} value={value.label}>{value.label}</option>)}</select>{linkedColors.length > 0 && <small>مرتبط بالتوليفات</small>}</label>}<MoveButtons index={index} count={product.images.length} label={`الصورة ${index + 1}`} onMove={move} /><label className="upload-button"><UploadSimple /> استبدال<input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => upload(event, image.id)} disabled={busy} /></label></article>;
      })}</div>
      <label className="upload-button add"><Image /> إضافة صورة<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event)} disabled={busy} /></label>
    </div>
  );
}

function ProductsPanel({ data, reload }) {
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const editing = editingId === "new" ? "new" : data.products.find((product) => product.id === editingId);
  const stats = deriveProductStats(data.products, data.publicProducts);
  const shownProducts = useMemo(() => filterOwnerProducts(data.products, query, filterStatus), [data.products, query, filterStatus]);
  const statusLabels = { published: "منشور", hidden: "مخفي", archived: "مؤرشف" };
  const archive = async (product) => {
    if (!window.confirm(`أرشفة ${product.displayName}؟ سيبقى محفوظاً للطلبات السابقة.`)) return;
    setActionError(""); setMessage("");
    try {
      await api(`/api/admin/products/${product.id}/archive`, { method: "POST", body: "{}" });
      if (editingId === product.id) setEditingId(null);
      await reload();
      setMessage("تمت أرشفة المنتج ويمكن استعادته لاحقاً.");
    } catch (error) { setActionError(error.message); }
  };
  const restore = async (product) => {
    setActionError(""); setMessage("");
    try {
      await api(`/api/admin/products/${product.id}/restore`, { method: "POST", body: "{}" });
      await reload();
      setMessage("تمت استعادة المنتج كمخفي. انشره من صفحة التعديل عند الاستعداد.");
    } catch (error) { setActionError(error.message); }
  };
  const cards = [
    { key: "total", label: "إجمالي المنتجات", detail: "تشمل المؤرشفة", Icon: Package },
    { key: "published", label: "المنتجات المنشورة", detail: "حالتها منشور في الكتالوج", Icon: CheckCircle },
    { key: "draft", label: "المنتجات المسودة", detail: "لا توجد حالة مسودة للمنتجات حالياً", Icon: FileText },
    { key: "visible", label: "المنتجات الظاهرة في المتجر", detail: "حسب واجهة المتجر العامة", Icon: Eye },
  ];
  return (
    <section className="owner-products-page">
      <div className="panel-title owner-products-header"><div><h1>المنتجات</h1><p>إدارة المنتجات والأسعار والصور والتوفر في متجرك.</p></div><button type="button" onClick={() => { setEditingId("new"); setMessage(""); }}><Plus size={20} weight="bold" /> منتج جديد</button></div>
      {actionError && <div className="owner-error" role="alert">{actionError}</div>}
      {message && <div className="owner-success" role="status">{message}</div>}
      <div className="owner-stats-grid" aria-label="ملخص المنتجات">{cards.map(({ key, label, detail, Icon }) => <article className={`owner-stat-card owner-stat-${key}`} key={key}><span className="owner-stat-icon"><Icon size={25} weight="duotone" aria-hidden="true" /></span><div><span className="owner-stat-value">{stats[key] ?? "—"}</span><h2>{label}</h2><p>{detail}</p></div></article>)}</div>
      <p className="owner-stats-note">المنشور يعني حالة المنتج في قاعدة البيانات. الظاهر هو ما تعيده واجهة المتجر العامة؛ حالياً تشمل المنتجات المنشورة حتى لو نفد مخزونها. لا توجد حالة «مسودة» مستقلة للمنتجات، واستخدم «مخفي» لحفظ منتج دون نشره.</p>
      {editing && <ProductEditor product={editing === "new" ? null : editing} categories={data.categories} onCancel={() => setEditingId(null)} onSaved={async () => { setEditingId(null); await reload(); setMessage("تم حفظ المنتج بنجاح."); }} />}
      {editing && editing !== "new" && <ImageManager product={editing} onChanged={reload} />}
      <div className="owner-product-toolbar"><label className="owner-product-search"><span>البحث في المنتجات</span><span className="owner-search-field"><MagnifyingGlass size={19} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="الاسم أو SKU أو الرابط" /></span></label><label className="owner-product-filter">الحالة<select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="all">كل الحالات</option><option value="published">منشور</option><option value="hidden">مخفي</option><option value="archived">مؤرشف</option></select></label><span className="owner-product-count" role="status">عرض {shownProducts.length} من {data.products.length}</span></div>
      <div className="admin-list owner-products-list">{shownProducts.map((product) => <article key={product.id}>{product.images[0]?.localOptimizedPath ? <img src={product.images[0].localOptimizedPath} alt="" /> : <span className="owner-product-image-empty"><Package size={26} aria-hidden="true" /></span>}<div className="owner-product-copy"><strong>{product.displayName}</strong><small>{money(product.price.current)} · {product.sku || "بلا SKU"}</small></div><span className={`status-pill ${product.status}`}>{statusLabels[product.status] || product.status}</span><button type="button" className="quiet" onClick={() => { setEditingId(product.id); setMessage(""); }}>تعديل</button>{product.status === "archived" ? <button type="button" className="quiet" onClick={() => restore(product)}>استعادة</button> : <button type="button" className="danger" onClick={() => archive(product)}><Archive /> أرشفة</button>}</article>)}</div>
      {!shownProducts.length && <p className="owner-products-empty">لا توجد منتجات مطابقة. جرّب تغيير البحث أو الحالة.</p>}
    </section>
  );
}

function OrderingPanel({ data, reload }) {
  const [category, setCategory] = useState(data.categories[0]?.slug || "");
  const products = useMemo(() => data.products
    .filter((product) => product.categories.some((item) => item.slug === category) && product.status !== "archived")
    .sort((a, b) => (a.categoryPositions?.[category] ?? Number.MAX_SAFE_INTEGER) - (b.categoryPositions?.[category] ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)), [data, category]);
  const featured = useMemo(() => data.products
    .filter((product) => product.featured && product.status !== "archived")
    .sort((a, b) => (a.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (b.featuredOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)), [data]);
  const move = async (list, a, b, scope) => {
    const ordered = swap(list, a, b);
    await api("/api/admin/product-order", {
      method: "PUT",
      body: JSON.stringify(scope === "featured" ? { scope, orderedProductIds: ordered.map((product) => product.id) } : { scope, categorySlug: category, orderedProductIds: ordered.map((product) => product.id) }),
    });
    await reload();
  };
  return (
    <section>
      <div className="panel-title"><div><h1>ترتيب المنتجات</h1><p>ترتيب مستقل لكل فئة، وترتيب منفصل للمنتجات المميزة في الصفحة الرئيسية.</p></div></div>
      <div className="ordering-box"><h2>ترتيب الفئة</h2><label className="inline-field">الفئة<select value={category} onChange={(event) => setCategory(event.target.value)}>{data.categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><div className="admin-list">{products.map((product, index) => <article key={product.id}><img src={product.images[0]?.localOptimizedPath} alt="" /><div><strong>{product.displayName}</strong><small>{index + 1} · {money(product.price.current)}</small></div><MoveButtons index={index} count={products.length} label={product.displayName} onMove={(a, b) => move(products, a, b, "category")} /></article>)}</div></div>
      <div className="ordering-box"><h2>ترتيب المنتجات المميزة</h2><p>أضف أو أزل علامة «منتج مميز» من صفحة تعديل المنتج.</p><div className="admin-list featured-list">{featured.map((product, index) => <article key={product.id}><span className="order-number">{index + 1}</span><div><strong>{product.displayName}</strong></div><MoveButtons index={index} count={featured.length} label={product.displayName} onMove={(a, b) => move(featured, a, b, "featured")} /></article>)}</div></div>
    </section>
  );
}

const blankBanner = { headingAr: "", supportingTextAr: "", buttonLabelAr: "", destinationUrl: "", desktopImageUrl: "", mobileImageUrl: "", imageAltAr: "", status: "draft", activeFrom: null, activeUntil: null };

function BannersPanel({ data, reload }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => setDraft(editing ? { ...editing, activeFrom: toInputDate(editing.activeFrom), activeUntil: toInputDate(editing.activeUntil) } : null), [editing]);
  const upload = async (event, key) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("purpose", `banner-${key}`);
      const result = await api("/api/admin/uploads", { method: "POST", body });
      setDraft((value) => ({ ...value, [key]: result.publicUrl }));
    } catch (exception) {
      setError(exception.message);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const payload = { ...draft, activeFrom: fromInputDate(draft.activeFrom), activeUntil: fromInputDate(draft.activeUntil), supportingTextAr: draft.supportingTextAr || null, buttonLabelAr: draft.buttonLabelAr || null, destinationUrl: draft.destinationUrl || null, mobileImageUrl: draft.mobileImageUrl || null };
      await api(editing?.id ? `/api/admin/banners/${editing.id}` : "/api/admin/banners", { method: editing?.id ? "PUT" : "POST", body: JSON.stringify(payload) });
      setEditing(null);
      await reload();
    } catch (exception) {
      setError(exception.message);
    }
  };
  const move = async (a, b) => {
    const list = swap(data.banners, a, b);
    await api("/api/admin/banner-order", { method: "PUT", body: JSON.stringify({ orderedBannerIds: list.map((banner) => banner.id) }) });
    await reload();
  };
  return (
    <section>
      <div className="panel-title"><div><h1>واجهات الصفحة الرئيسية</h1><p>صور مستقلة للحاسوب والهاتف مع معاينة القص.</p></div><button onClick={() => setEditing(blankBanner)}><Plus /> واجهة جديدة</button></div>
      {draft && <form className="owner-editor" onSubmit={save}>
        {error && <div className="owner-error" role="alert">{error}</div>}
        <div className="owner-form-grid">
          <label>العنوان العربي<input value={draft.headingAr} onChange={(event) => setDraft({ ...draft, headingAr: event.target.value })} required /></label>
          <label>النص الداعم<input value={draft.supportingTextAr || ""} onChange={(event) => setDraft({ ...draft, supportingTextAr: event.target.value })} /></label>
          <label>نص الزر<input value={draft.buttonLabelAr || ""} onChange={(event) => setDraft({ ...draft, buttonLabelAr: event.target.value })} /></label>
          <label>وجهة الزر<input dir="ltr" value={draft.destinationUrl || ""} onChange={(event) => setDraft({ ...draft, destinationUrl: event.target.value })} placeholder="/shop أو https://..." /></label>
          <label>النص البديل للصورة<input value={draft.imageAltAr} onChange={(event) => setDraft({ ...draft, imageAltAr: event.target.value })} required /></label>
          <label>الحالة<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="draft">مسودة</option><option value="published">منشور</option><option value="archived">مؤرشف</option></select></label>
          <label>بداية العرض<input type="datetime-local" value={draft.activeFrom || ""} onChange={(event) => setDraft({ ...draft, activeFrom: event.target.value })} /></label>
          <label>نهاية العرض<input type="datetime-local" value={draft.activeUntil || ""} onChange={(event) => setDraft({ ...draft, activeUntil: event.target.value })} /></label>
        </div>
        <div className="banner-upload-row"><label className="upload-button"><UploadSimple /> صورة الحاسوب<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event, "desktopImageUrl")} /></label><label className="upload-button"><UploadSimple /> صورة الهاتف<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event, "mobileImageUrl")} /></label></div>
        {draft.desktopImageUrl && <div className="banner-previews"><figure><img src={draft.desktopImageUrl} alt="معاينة الحاسوب" /><figcaption>حاسوبي 16:7</figcaption></figure><figure className="mobile"><img src={draft.mobileImageUrl || draft.desktopImageUrl} alt="معاينة قص الهاتف" /><figcaption>هاتف 4:5 — قص مركزي</figcaption></figure></div>}
        <div className="form-actions"><button>حفظ</button><button type="button" className="quiet" onClick={() => setEditing(null)}>إلغاء</button></div>
      </form>}
      <div className="admin-list banners">{data.banners.map((banner, index) => <article key={banner.id}><img src={banner.desktopImageUrl} alt="" /><div><strong>{banner.headingAr}</strong><small>{banner.status} · {banner.destinationUrl || "بلا رابط"}</small></div><MoveButtons index={index} count={data.banners.length} label={banner.headingAr} onMove={move} /><button className="quiet" onClick={() => setEditing(banner)}>تعديل ومعاينة</button><button className="danger" disabled={banner.status === "archived"} onClick={async () => { if (!window.confirm("أرشفة هذه الواجهة؟")) return; await api(`/api/admin/banners/${banner.id}`, { method: "DELETE" }); await reload(); }}><Archive /> أرشفة</button></article>)}</div>
    </section>
  );
}

function OrdersPanel({ data, reload }) {
  const statuses = ["new", "confirmed", "preparing", "shipped", "delivered", "cancelled"];
  const allowed = { new: ["confirmed", "cancelled"], confirmed: ["preparing", "cancelled"], preparing: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [] };
  const [statusError, setStatusError] = useState("");
  return (
    <section>
      {statusError && <div className="owner-error" role="alert">{statusError}</div>}
      <div className="panel-title"><div><h1>طلبات الدفع عند الاستلام</h1><p>بيانات العملاء ظاهرة داخل هذه الصفحة المحمية فقط.</p></div></div>
      <div className="orders-table" role="region" aria-label="الطلبات" tabIndex="0"><table><thead><tr><th>الطلب</th><th>العميل</th><th>المجموع</th><th>الحالة</th><th>Google Sheet</th><th>التاريخ</th></tr></thead><tbody>{data.orders.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong></td><td>{order.customer.name}<small>{order.customer.phone}<br />{order.customer.city}</small></td><td>{money(order.total_mad)}</td><td><select value={order.status} onChange={async (event) => { try { setStatusError(""); await api(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }); await reload(); } catch (error) { setStatusError(error.message); await reload(); } }}>{statuses.map((status) => <option key={status} disabled={status !== order.status && !allowed[order.status]?.includes(status)}>{status}</option>)}</select></td><td><span className={`sync ${order.sheet_sync_status}`}>{order.sheet_sync_status}</span>{order.sheet_sync_status === "failed" && <button className="quiet" onClick={async () => { await api(`/api/admin/orders/${order.id}/retry-sheet-sync`, { method: "POST", body: "{}" }); await reload(); }}>إعادة المحاولة</button>}</td><td>{new Date(order.created_at).toLocaleString("ar-MA")}</td></tr>)}</tbody></table>{!data.orders.length && <p className="empty-admin">لا توجد طلبات بعد.</p>}</div>
    </section>
  );
}

export function AdminApp() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("products");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarPreference());
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const mobileCloseRef = useRef(null);
  const mobileWasOpen = useRef(false);
  const [data, setData] = useState({ products: [], publicProducts: [], categories: [], banners: [], orders: [] });
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const [products, storefront, banners, orders] = await Promise.all([api("/api/admin/products"), api("/api/public/storefront", { cache: "no-store" }), api("/api/admin/banners"), api("/api/admin/orders")]);
      setData({ products: products.products, publicProducts: storefront.products, categories: storefront.categories, banners: banners.banners, orders: orders.orders });
      setError("");
    } catch (exception) {
      setError(exception.message);
    }
  };
  const authenticate = async () => {
    try {
      setSession(await api("/api/admin/session"));
      await load();
    } catch {
      setSession(null);
    }
  };
  useEffect(() => { authenticate(); }, []);
  useEffect(() => { saveSidebarPreference(undefined, sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => {
    if (mobileOpen) { mobileCloseRef.current?.focus(); mobileWasOpen.current = true; }
    else if (mobileWasOpen.current) { mobileMenuRef.current?.focus(); mobileWasOpen.current = false; }
  }, [mobileOpen]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);
  if (session === undefined) return <main className="owner-loading">جارٍ التحقق…</main>;
  if (!session) return <Login onLogin={authenticate} />;
  const tabs = [
    ["products", "المنتجات", Package],
    ["ordering", "الترتيب", ListNumbers],
    ["banners", "الواجهات", Image],
    ["orders", "الطلبات", Storefront],
  ];
  return (
    <div className={`owner-app${sidebarCollapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`} dir="rtl">
      <header className="owner-mobile-bar" inert={mobileOpen ? true : undefined}><button ref={mobileMenuRef} type="button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? "إغلاق قائمة لوحة المالك" : "فتح قائمة لوحة المالك"} aria-controls="owner-sidebar" aria-expanded={mobileOpen}><List size={25} /></button><img src="/images/brand/melyne-logo.png" alt="MELYNE" /><span>{tabs.find(([id]) => id === tab)?.[1]}</span></header>
      {mobileOpen && <button type="button" className="owner-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة" />}
      <aside id="owner-sidebar" className="owner-sidebar"><div className="owner-sidebar-head"><img src="/images/brand/melyne-logo.png" alt="MELYNE" /><button type="button" className="owner-sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"} aria-controls="owner-sidebar" aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}><List size={22} /></button><button ref={mobileCloseRef} type="button" className="owner-mobile-close" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة"><X size={22} /></button></div><p className="owner-name">{session.displayName}</p><nav aria-label="أقسام لوحة المالك">{tabs.map(([id, label, Icon]) => <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setMobileOpen(false); }} aria-label={label} aria-current={tab === id ? "page" : undefined} title={label} data-tooltip={label}><Icon size={22} aria-hidden="true" /><span className="owner-nav-label">{label}</span></button>)}</nav><a href="/" target="_blank" rel="noreferrer" aria-label="عرض المتجر" title="عرض المتجر" data-tooltip="عرض المتجر"><Storefront size={22} aria-hidden="true" /><span className="owner-nav-label">عرض المتجر</span></a><button type="button" className="logout" onClick={async () => { await api("/api/admin/session", { method: "DELETE" }); setSession(null); }} aria-label="خروج" title="خروج" data-tooltip="خروج"><SignOut size={22} aria-hidden="true" /><span className="owner-nav-label">خروج</span></button></aside>
      <main inert={mobileOpen ? true : undefined}>{error && <div className="owner-error" role="alert">{error}</div>}{tab === "products" && <ProductsPanel data={data} reload={load} />}{tab === "ordering" && <OrderingPanel data={data} reload={load} />}{tab === "banners" && <BannersPanel data={data} reload={load} />}{tab === "orders" && <OrdersPanel data={data} reload={load} />}</main>
    </div>
  );
}
