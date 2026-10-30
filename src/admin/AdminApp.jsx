import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CaretDown,
  ChartBar,
  CheckCircle,
  Eye,
  Factory,
  FileText,
  GearSix,
  House,
  Image,
  List,
  ListNumbers,
  MagnifyingGlass,
  Package,
  Plus,
  SignOut,
  ShoppingBag,
  Storefront,
  Tag,
  UploadSimple,
  Users,
  CreditCard,
  Warehouse,
  X,
} from "@phosphor-icons/react";
import { RichTextEditor } from "./RichTextEditor.jsx";
import { AnalyticsPanel, CollectionsPanel, DashboardPanel, MetadataPanel, StockPanel } from "./OwnerViews.jsx";
import { colorOptionFor, colorOfVariant } from "../product-colors.js";
import { deriveProductStats, filterOwnerProducts } from "./product-stats.js";
import { readSidebarPreference, saveSidebarPreference } from "./sidebar-preference.js";
import { buildVariants, optionValuesFromText, selectionSignature } from "./variant-lifecycle.js";
import { NewOrderPanel } from "./OrderManagement.jsx";
import { OrdersPanel } from "./OrdersDashboard.jsx";
import { ownerNavigation, ownerPathForTab, ownerSectionForTab, ownerTabFromPath } from "./owner-navigation.js";
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
const safeSlug = (value) => String(value).normalize("NFKC").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 100);
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

function ProductEditor({ product, categories, onSaved, onCancel, onImagesChanged, onDirtyChange }) {
  const initial = product ? {
    id: product.id,
    sku: product.sku || "",
    slug: product.slug,
    originalName: product.name,
    displayName: product.displayName,
    description: product.description || "",
    descriptionHtml: product.descriptionHtml || "",
    shortDescription: product.shortDescription || "",
    costPriceMad: product.costPriceMad,
    tags: product.tags || [], brandName: product.brandName || "", modelName: product.modelName || "",
    supplierName: product.supplierName || "", badgeText: product.badgeText || "",
    badgeColor: product.badgeColor || "#386549", seoTitle: product.seoTitle || "",
    metaDescription: product.metaDescription || "", weightKg: product.weightKg,
    widthCm: product.widthCm, heightCm: product.heightCm, depthCm: product.depthCm,
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
      retired: Boolean(variant.retired),
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
    shortDescription: "", costPriceMad: null, tags: [], brandName: "", modelName: "",
    supplierName: "", badgeText: "", badgeColor: "#386549", seoTitle: "",
    metaDescription: "", weightKg: null, widthCm: null, heightCm: null, depthCm: null,
    priceMad: 0,
    comparisonPriceMad: null,
    availability: "available",
    status: "draft",
    categorySlugs: [categories[0]?.slug].filter(Boolean),
    options: [],
    variants: [],
    featured: false,
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const update = (key, value) => { setDirty(true); setForm((current) => ({ ...current, [key]: value })); };
  const cancel = () => { if (!dirty || window.confirm("هناك تغييرات غير محفوظة. هل تريد المغادرة؟")) onCancel(); };
  const optionValues = (kind) => form.options.find((option) => optionKind(option) === kind)?.values?.map((value) => value.label).join(", ") || "";
  const setOptionValues = (kind, text) => {
    setDirty(true);
    setForm((current) => {
      const old = current.options.find((option) => optionKind(option) === kind);
      const values = optionValuesFromText(text, old?.values, `owner-${kind}`);
      const nextOption = { id: old?.id || `owner-${kind}`, name: old?.name || (kind === "size" ? "Size" : "Color"), key: old?.key ?? (kind === "size" ? "size" : null), values };
      const options = [...current.options.filter((option) => optionKind(option) !== kind), nextOption];
      return { ...current, options, variants: buildVariants(options, current.variants, current.priceMad, current.comparisonPriceMad) };
    });
  };
  const addCustomOption = () => {
    const id = `owner-option-${crypto.randomUUID()}`;
    update("options", [...form.options, { id, key: id, name: "المادة", values: [] }]);
  };
  const changeCustomOption = (id, change) => {
    const options = form.options.map((option) => option.id === id ? { ...option, ...change } : option);
    update("options", options);
    update("variants", buildVariants(options, form.variants, form.priceMad, form.comparisonPriceMad));
  };
  const removeCustomOption = (id) => {
    if (!window.confirm("إزالة هذا الخيار وتوليفاته؟ قد تتطلب التوليفات المرتبطة بطلبات سابقة مراجعة.")) return;
    const options = form.options.filter((option) => option.id !== id);
    update("options", options);
    update("variants", buildVariants(options, form.variants, form.priceMad, form.comparisonPriceMad));
  };
  const updateVariant = (index, change) => update("variants", form.variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...change } : variant));
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    const retiringCount = product?.variants.filter((variant) => !variant.retired && !form.variants.some((item) => item.id === variant.id && !item.retired)).length || 0;
    if (retiringCount && !window.confirm(`سيُحال ${retiringCount} من توليفات المنتج إلى التقاعد. ستبقى الطلبات وحركات المخزون محفوظة، ولن يمكن شراء هذه التوليفات. هل تريد المتابعة؟`)) return;
    setBusy(true);
    setError("");
    try {
      const nextStatus = event.nativeEvent.submitter?.value === "draft" ? "draft" : form.status;
      const payload = {
        ...form,
        status: nextStatus,
        priceMad: Number(form.priceMad),
        comparisonPriceMad: form.comparisonPriceMad === "" || form.comparisonPriceMad == null ? null : Number(form.comparisonPriceMad),
        costPriceMad: form.costPriceMad === "" || form.costPriceMad == null ? null : Number(form.costPriceMad),
        weightKg: form.weightKg === "" || form.weightKg == null ? null : Number(form.weightKg),
        widthCm: form.widthCm === "" || form.widthCm == null ? null : Number(form.widthCm),
        heightCm: form.heightCm === "" || form.heightCm == null ? null : Number(form.heightCm),
        depthCm: form.depthCm === "" || form.depthCm == null ? null : Number(form.depthCm),
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
      setDirty(false);
      await onSaved();
    } catch (exception) {
      setError(exception.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="owner-editor owner-product-editor" onSubmit={save}>
      <div className="owner-editor-head"><div><h2>{product ? "تعديل المنتج" : "منتج جديد"}</h2><p>إدارة بيانات المنتج وصوره ومخزونه في مكان واحد.</p></div><button type="button" className="quiet" onClick={cancel}>رجوع</button></div>
      {error && <div className="owner-error" role="alert">{error}</div>}
      <details className="owner-editor-section" open><summary><Package size={24} /><span><strong>المعلومات العامة</strong><small>الأسماء والأسعار والتصنيف والصور</small></span></summary><div className="owner-editor-section-body owner-general-layout"><div>
        <div className="owner-form-grid">
          <label className="owner-field-wide">اسم المنتج<input value={form.displayName} onChange={(event) => { update("displayName", event.target.value); if (!product && !form.slug) update("slug", safeSlug(event.target.value)); }} required /></label>
          <label className="owner-field-wide">الاسم الأصلي<input value={form.originalName} onChange={(event) => update("originalName", event.target.value)} required /></label>
          <label>سعر البيع (MAD)<input type="number" min="0" step="0.01" value={form.priceMad} onChange={(event) => update("priceMad", event.target.value)} required /></label>
          <label>السعر قبل التخفيض (MAD)<input type="number" min="0" step="0.01" value={form.comparisonPriceMad ?? ""} onChange={(event) => update("comparisonPriceMad", event.target.value)} /></label>
          <label>سعر الشراء الداخلي (MAD)<input type="number" min="0" step="0.01" value={form.costPriceMad ?? ""} onChange={(event) => update("costPriceMad", event.target.value)} /><small>لا يظهر للعملاء.</small></label>
          <label>العلامة التجارية<input value={form.brandName} onChange={(event) => update("brandName", event.target.value)} placeholder="اختياري" /></label>
          <label>الموديل<input value={form.modelName} onChange={(event) => update("modelName", event.target.value)} placeholder="اختياري" /></label>
          <label>المورد (داخلي)<input value={form.supplierName} onChange={(event) => update("supplierName", event.target.value)} placeholder="اختياري" /></label>
          <label className="owner-field-wide">وسوم المنتج (مفصولة بفواصل)<input value={form.tags.join(", ")} onChange={(event) => update("tags", [...new Set(event.target.value.split(",").map((value) => value.trim()).filter(Boolean))])} /></label>
          <label>شارة المنتج<input maxLength="40" value={form.badgeText} onChange={(event) => update("badgeText", event.target.value)} placeholder="مثلاً: جديد" /></label>
          <label>لون الشارة<input type="color" value={form.badgeColor} onChange={(event) => update("badgeColor", event.target.value)} /></label>
        </div>
        <fieldset><legend>التصنيفات</legend><div className="check-row">{categories.map((category) => <label key={category.slug}><input type="checkbox" checked={form.categorySlugs.includes(category.slug)} onChange={(event) => update("categorySlugs", event.target.checked ? [...form.categorySlugs, category.slug] : form.categorySlugs.filter((value) => value !== category.slug))} />{category.name}</label>)}</div></fieldset>
        <label className="check"><input type="checkbox" checked={form.featured} onChange={(event) => update("featured", event.target.checked)} /> منتج مميز في الصفحة الرئيسية</label>
      </div><div className="owner-editor-images">{product ? <ImageManager product={product} onChanged={onImagesChanged} /> : <div className="owner-image-first-save"><Image size={42} /><strong>صور المنتج</strong><p>احفظ المنتج كمسودة أولاً، ثم أضف الصور من هذا القسم.</p></div>}</div></div></details>
      <details className="owner-editor-section"><summary><FileText size={24} /><span><strong>وصف المنتج</strong><small>وصف مختصر وتفاصيل غنية بالتنسيق</small></span></summary><div className="owner-editor-section-body">
        <label>وصف مختصر<textarea rows="3" maxLength="2000" value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} /></label>
        <label>الوصف الأصلي<textarea rows="4" value={form.description} onChange={(event) => update("description", event.target.value)} /></label>
        <div className="owner-rich-label">وصف المنتج بالتفصيل</div><RichTextEditor initialHtml={form.descriptionHtml} onChange={(html) => update("descriptionHtml", html)} />
      </div></details>
      <details className="owner-editor-section"><summary><ListNumbers size={24} /><span><strong>الخيارات والمتغيرات</strong><small>المقاسات والألوان وتوفر كل توليفة</small></span></summary><div className="owner-editor-section-body">
        <div className="owner-form-grid"><label>المقاسات (مفصولة بفواصل)<input value={optionValues("size")} onChange={(event) => setOptionValues("size", event.target.value)} /></label><label>الألوان (مفصولة بفواصل)<input value={optionValues("color")} onChange={(event) => setOptionValues("color", event.target.value)} /></label></div>
        <div className="owner-custom-options">{form.options.filter((option) => !optionKind(option)).map((option) => <div key={option.id} className="owner-custom-option"><label>اسم الخيار<input value={option.name} onChange={(event) => changeCustomOption(option.id, { name: event.target.value })} /></label><label>القيم (مفصولة بفواصل)<input value={option.values.map((value) => value.label).join(", ")} onChange={(event) => changeCustomOption(option.id, { values: optionValuesFromText(event.target.value, option.values, option.id) })} /></label><button type="button" className="danger" onClick={() => removeCustomOption(option.id)}>إزالة الخيار</button></div>)}<button type="button" className="quiet" onClick={addCustomOption}>+ إضافة خيار آخر مثل المادة</button></div>
        <p className="owner-editor-note">يُعاد استخدام معرّف التوليفة الموجودة عند بقاء خياراتها كما هي. المخزون غير المحدد لا يقبل طلبات.</p>
        <p className="owner-editor-note">المتاح مؤقتاً يمكن إيقافه دون حذف. نفاد المخزون يعني كمية صفر، أما التوليفة المتقاعدة فتبقى للطلبات وسجل المخزون ولا تظهر للشراء. إعادة تنشيطها تبدأ بحالة غير متاحة حتى تراجع مخزونها.</p>
        {form.variants.length > 0 && <div className="variant-table" role="region" aria-label="توليفات المنتج" tabIndex="0"><table><thead><tr><th>الحالة</th><th>التوليفة</th><th>السعر</th><th>السعر السابق</th><th>المخزون</th><th>صورة التوليفة</th><th>الإجراء</th></tr></thead><tbody>{form.variants.map((variant, index) => {
          const canRestore = variant.selections.every((selection) => form.options.some((option) => (option.key || option.name) === (selection.optionKey || selection.option) && option.values.some((value) => value.label === selection.value)));
          const state = variant.retired ? "متقاعدة" : !variant.available ? "غير متاحة مؤقتاً" : variant.stockQuantity == null ? "مخزون غير محدد" : Number(variant.stockQuantity) === 0 ? "نفد المخزون" : "نشطة ومتاحة";
          return <tr key={variant.id || selectionSignature(variant.selections)} className={variant.retired ? "owner-variant-retired" : ""}>
            <td><span className="owner-variant-state">{state}</span>{!variant.retired && <label className="check"><input type="checkbox" checked={variant.available} onChange={(event) => updateVariant(index, { available: event.target.checked })} aria-label={`توفر ${variant.name}`} /> متاحة</label>}</td>
            <td>{variant.name}</td>
            <td><input type="number" min="0" step="0.01" value={variant.priceMad} onChange={(event) => updateVariant(index, { priceMad: event.target.value })} aria-label={`سعر ${variant.name}`} disabled={variant.retired} /></td>
            <td><input type="number" min="0" step="0.01" value={variant.comparisonPriceMad ?? ""} onChange={(event) => updateVariant(index, { comparisonPriceMad: event.target.value })} aria-label={`السعر السابق ${variant.name}`} disabled={variant.retired} /></td>
            <td><input type="number" min="0" step="1" value={variant.stockQuantity ?? ""} onChange={(event) => updateVariant(index, { stockQuantity: event.target.value })} placeholder="غير محدد" aria-label={`مخزون ${variant.name}`} disabled={variant.retired} /></td>
            <td><select value={variant.imageId || ""} onChange={(event) => updateVariant(index, { imageId: event.target.value || null })} aria-label={`صورة ${variant.name}`} disabled={variant.retired}><option value="">بلا صورة</option>{product?.images.map((image, imageIndex) => <option key={image.id} value={image.id}>الصورة {imageIndex + 1}{image.colorLabel ? ` — ${image.colorLabel}` : ""}</option>)}</select></td>
            <td>{variant.retired ? <button type="button" className="quiet" disabled={!canRestore} title={canRestore ? "إعادة تنشيط كتوليفة غير متاحة" : "أعد قيم اللون والمقاس إلى الخيارات أولاً"} onClick={() => updateVariant(index, { retired: false, available: false })}>إعادة تنشيط</button> : <button type="button" className="danger" onClick={() => { if (window.confirm(`إحالة ${variant.name} إلى التقاعد؟ ستبقى الطلبات وحركات المخزون محفوظة.`)) updateVariant(index, { retired: true, available: false }); }}>إحالة للتقاعد</button>}</td>
          </tr>;
        })}</tbody></table></div>}
      </div></details>
      <details className="owner-editor-section"><summary><MagnifyingGlass size={24} /><span><strong>تحسين محركات البحث</strong><small>عنوان الصفحة والوصف والرابط</small></span></summary><div className="owner-editor-section-body owner-form-grid">
        <label>عنوان SEO<input maxLength="160" value={form.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} /></label>
        <label>الرابط المختصر<input dir="ltr" value={form.slug} onChange={(event) => update("slug", safeSlug(event.target.value))} readOnly={Boolean(product?.status === "published")} required />{product?.status === "published" && <small>رابط المنتج المنشور ثابت لحماية الروابط الحالية.</small>}</label>
        <label className="owner-field-wide">وصف نتائج البحث<textarea rows="3" maxLength="320" value={form.metaDescription} onChange={(event) => update("metaDescription", event.target.value)} /></label>
        <div className="owner-seo-preview"><small>معاينة نتيجة البحث</small><strong>{form.seoTitle || form.displayName || "اسم المنتج"}</strong><span>{form.metaDescription || form.shortDescription || "وصف المنتج سيظهر هنا."}</span><code>/products/{form.slug || "product"}</code></div>
      </div></details>
      <details className="owner-editor-section"><summary><Package size={24} /><span><strong>الخيارات المتقدمة</strong><small>المرجع والتوفر والقياسات الاختيارية</small></span></summary><div className="owner-editor-section-body owner-form-grid">
        <label>المرجع / SKU<input dir="ltr" value={form.sku} onChange={(event) => update("sku", event.target.value)} /></label>
        <label>التوفر<select value={form.availability} onChange={(event) => update("availability", event.target.value)}><option value="available">متوفر</option><option value="unavailable">غير متوفر</option></select></label>
        <label>الوزن (كغ)<input type="number" min="0" step="0.001" value={form.weightKg ?? ""} onChange={(event) => update("weightKg", event.target.value)} /></label>
        <label>العرض (سم)<input type="number" min="0" step="0.01" value={form.widthCm ?? ""} onChange={(event) => update("widthCm", event.target.value)} /></label>
        <label>الارتفاع (سم)<input type="number" min="0" step="0.01" value={form.heightCm ?? ""} onChange={(event) => update("heightCm", event.target.value)} /></label>
        <label>العمق (سم)<input type="number" min="0" step="0.01" value={form.depthCm ?? ""} onChange={(event) => update("depthCm", event.target.value)} /></label>
        <p className="owner-field-wide owner-editor-note">هذه القياسات معلومات داخلية فقط. لا يتم حساب رسوم الشحن منها حالياً. المخزون الفعلي يُدار لكل توليفة أعلاه.</p>
      </div></details>
      <div className="owner-save-bar"><button type="button" className="quiet" onClick={cancel}>إلغاء</button><span className="owner-save-spacer" /><label>الحالة<select value={form.status} onChange={(event) => update("status", event.target.value)}><option value="draft">مسودة</option><option value="published">منشور</option><option value="hidden">مخفي</option>{product?.status === "archived" && <option value="archived">مؤرشف</option>}</select></label><button type="submit" name="saveAction" value="draft" className="quiet" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ كمسودة"}</button><button type="submit" name="saveAction" value="selected" disabled={busy}>{busy ? "جارٍ الحفظ…" : form.status === "published" ? "نشر المنتج" : "حفظ المنتج"}</button></div>
    </form>
  );
}

function ImageManager({ product, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const colorOption = colorOptionFor(product);
  const upload = async (files, imageId = null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    let uploaded = false;
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("image", file);
        body.append("altText", product.displayName);
        await api(imageId ? `/api/admin/products/${product.id}/images/${imageId}` : `/api/admin/products/${product.id}/images`, { method: imageId ? "PUT" : "POST", body });
        uploaded = true;
      }
      await onChanged();
    } catch (exception) {
      setError(exception.message);
      if (uploaded) await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const move = async (a, b) => {
    setBusy(true); setError("");
    try { const images = swap(product.images, a, b); await api(`/api/admin/products/${product.id}/image-order`, { method: "PUT", body: JSON.stringify({ orderedImageIds: images.map((image) => image.id) }) }); await onChanged(); }
    catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
  };
  const makeMain = async (imageId) => {
    setBusy(true); setError("");
    try { const ids = [imageId, ...product.images.filter((image) => image.id !== imageId).map((image) => image.id)]; await api(`/api/admin/products/${product.id}/image-order`, { method: "PUT", body: JSON.stringify({ orderedImageIds: ids }) }); await onChanged(); }
    catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
  };
  const remove = async (imageId) => {
    if (!window.confirm("أرشفة هذه الصورة؟ ستبقى محفوظة في التخزين ولن تظهر في المعرض.")) return;
    setBusy(true); setError("");
    try { await api(`/api/admin/products/${product.id}/images/${imageId}`, { method: "DELETE" }); await onChanged(); }
    catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
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
      <label className="owner-image-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files); }}><UploadSimple size={30} /><strong>اسحب الصور هنا أو اختر ملفات</strong><small>PNG أو JPG أو WebP، حتى 10 MB لكل صورة</small><input type="file" multiple accept="image/png,image/webp,image/jpeg" onChange={(event) => { upload(event.target.files); event.target.value = ""; }} disabled={busy} /></label>
      <div className="image-list">{product.images.map((image, index) => {
        const linkedColors = [...new Set(product.variants.filter((variant) => variant.imageId === image.id).map((variant) => colorOfVariant(variant, colorOption)).filter(Boolean))];
        return <article key={image.id}><a href={image.localOriginalPath || image.localOptimizedPath} target="_blank" rel="noreferrer" aria-label={`معاينة الصورة ${index + 1}`}><img src={image.localOptimizedPath} alt={image.altText || product.displayName} /></a>{index === 0 && <small>الصورة الرئيسية</small>}{colorOption && <label className="image-color-field">لون الصورة<select value={linkedColors[0] || image.colorLabel || ""} onChange={(event) => assignColor(image.id, event.target.value)} disabled={busy || linkedColors.length > 0} aria-label={`لون الصورة ${index + 1}`}><option value="">غير محدد</option>{colorOption.values.map((value) => <option key={value.id} value={value.label}>{value.label}</option>)}</select>{linkedColors.length > 0 && <small>مرتبط بالتوليفات</small>}</label>}<MoveButtons index={index} count={product.images.length} label={`الصورة ${index + 1}`} onMove={move} />{index > 0 && <button type="button" className="quiet" onClick={() => makeMain(image.id)} disabled={busy}>تعيين رئيسية</button>}<label className="upload-button"><UploadSimple /> استبدال<input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => { upload(event.target.files, image.id); event.target.value = ""; }} disabled={busy} /></label><button type="button" className="danger" onClick={() => remove(image.id)} disabled={busy}>أرشفة الصورة</button></article>;
      })}</div>
    </div>
  );
}

function ProductsPanel({ data, reload, startNew = false, onDirtyChange, onDone }) {
  const [editingId, setEditingId] = useState(startNew ? "new" : null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const editing = editingId === "new" ? "new" : data.products.find((product) => product.id === editingId);
  const stats = deriveProductStats(data.products, data.publicProducts);
  const shownProducts = useMemo(() => filterOwnerProducts(data.products, query, filterStatus).filter((product) => filterCategory === "all" || product.categories.some((category) => category.slug === filterCategory)), [data.products, query, filterStatus, filterCategory]);
  const pageCount = Math.max(1, Math.ceil(shownProducts.length / 12));
  const pageProducts = shownProducts.slice((Math.min(page, pageCount) - 1) * 12, Math.min(page, pageCount) * 12);
  const statusLabels = { draft: "مسودة", published: "منشور", hidden: "مخفي", archived: "مؤرشف" };
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
    { key: "draft", label: "المنتجات المسودة", detail: "محفوظة دون ظهور للمتسوقين", Icon: FileText },
    { key: "visible", label: "المنتجات الظاهرة في المتجر", detail: "حسب واجهة المتجر العامة", Icon: Eye },
    { key: "variable", label: "المنتجات متعددة الخيارات", detail: "أكثر من توليفة غير مؤرشفة", Icon: ListNumbers },
  ];
  return (
    <section className="owner-products-page">
      <div className="panel-title owner-products-header"><div><h1>المنتجات</h1><p>إدارة المنتجات والأسعار والصور والتوفر في متجرك.</p></div>{!editing && <button type="button" onClick={() => { setEditingId("new"); setMessage(""); }}><Plus size={20} weight="bold" /> منتج جديد</button>}</div>
      {actionError && <div className="owner-error" role="alert">{actionError}</div>}
      {message && <div className="owner-success" role="status">{message}</div>}
      {!editing && <><div className="owner-stats-grid" aria-label="ملخص المنتجات">{cards.map(({ key, label, detail, Icon }) => <article className={`owner-stat-card owner-stat-${key}`} key={key}><span className="owner-stat-icon"><Icon size={25} weight="duotone" aria-hidden="true" /></span><div><span className="owner-stat-value">{stats[key] ?? "—"}</span><h2>{label}</h2><p>{detail}</p></div></article>)}</div><p className="owner-stats-note">الإجمالي يشمل المؤرشف. الظاهر هو ما تعيده واجهة المتجر العامة؛ المنتج المنشور قد يظهر حتى إن نفد مخزونه. المسودات والمخفية والمؤرشفة لا تظهر للعملاء.</p></>}
      {editing && <ProductEditor key={editing === "new" ? "new" : editing.id} product={editing === "new" ? null : editing} categories={data.categories} onCancel={() => { setEditingId(null); onDone?.(); }} onImagesChanged={reload} onDirtyChange={onDirtyChange} onSaved={async () => { setEditingId(null); await reload(); setMessage("تم حفظ المنتج بنجاح."); onDone?.(); }} />}
      {!editing && <><div className="owner-product-toolbar"><label className="owner-product-search"><span>البحث في المنتجات</span><span className="owner-search-field"><MagnifyingGlass size={19} aria-hidden="true" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="الاسم أو SKU أو الرابط" /></span></label><label className="owner-product-filter">الحالة<select value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }}><option value="all">كل الحالات</option><option value="draft">مسودة</option><option value="published">منشور</option><option value="hidden">مخفي</option><option value="archived">مؤرشف</option></select></label><label className="owner-product-filter">التصنيف<select value={filterCategory} onChange={(event) => { setFilterCategory(event.target.value); setPage(1); }}><option value="all">كل التصنيفات</option>{data.categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select></label><span className="owner-product-count" role="status">عرض {shownProducts.length} من {data.products.length}</span></div>
      <div className="admin-list owner-products-list">{pageProducts.map((product) => <article key={product.id}>{product.images[0]?.localOptimizedPath ? <img src={product.images[0].localOptimizedPath} alt="" /> : <span className="owner-product-image-empty"><Package size={26} aria-hidden="true" /></span>}<div className="owner-product-copy"><strong>{product.displayName}</strong><small>{money(product.price.current)} · {product.sku || "بلا SKU"} · {product.variants.length} توليفة · {product.categories.map((category) => category.name).join("، ")}</small></div><span className={`status-pill ${product.status}`}>{statusLabels[product.status] || product.status}</span><button type="button" className="quiet" onClick={() => { setEditingId(product.id); setMessage(""); }}>تعديل</button>{product.status === "archived" ? <button type="button" className="quiet" onClick={() => restore(product)}>استعادة</button> : <button type="button" className="danger" onClick={() => archive(product)}><Archive /> أرشفة</button>}</article>)}</div>
      {!shownProducts.length && <p className="owner-products-empty">لا توجد منتجات مطابقة. جرّب تغيير البحث أو الفلاتر.</p>}
      {pageCount > 1 && <nav className="owner-pagination" aria-label="صفحات المنتجات"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button><span>الصفحة {Math.min(page, pageCount)} من {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>التالي</button></nav>}</>}
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


const ownerIcons = { House, ChartBar, ShoppingBag, Users, CreditCard, FileText, Package, Plus, Tag, Warehouse, Factory, ListNumbers, Image };

function OwnerNavButton({ item, active, onNavigate, sub = false }) {
  const Icon = ownerIcons[item.icon];
  if (item.planned) return <button type="button" className="owner-nav-planned owner-subitem" disabled title={`${item.label} — غير متاح حالياً`} aria-label={`${item.label} — غير متاح حالياً`}><Icon size={20} aria-hidden="true" /><span className="owner-nav-label">{item.label} <small>قريباً</small></span></button>;
  return <button type="button" className={`${active ? "active" : ""}${sub ? " owner-subitem" : ""}`} onClick={() => onNavigate(item.id)} aria-label={item.label} aria-current={active ? "page" : undefined} title={item.label} data-tooltip={item.label}><Icon size={22} aria-hidden="true" /><span className="owner-nav-label">{item.label}</span></button>;
}

function OwnerNavSection({ section, tab, expanded, onToggle, onNavigate }) {
  const Icon = ownerIcons[section.icon];
  const childActive = section.children.some((child) => child.id === tab);
  return <div className="owner-nav-section"><div className="owner-nav-parent">
    <button type="button" className={childActive ? "section-current" : ""} onClick={() => onNavigate(section.id)} aria-label={section.label} title={section.label} data-tooltip={section.label}><Icon size={22} aria-hidden="true" /><span className="owner-nav-label">{section.label}</span></button>
    <button type="button" className="owner-section-expand" aria-label={expanded ? `طي أقسام ${section.label}` : `توسيع أقسام ${section.label}`} aria-expanded={expanded} aria-controls={`owner-${section.id}-subnav`} onClick={() => onToggle(section.id)}><CaretDown size={17} aria-hidden="true" /></button>
  </div><div id={`owner-${section.id}-subnav`} className={`owner-section-subnav${expanded ? " is-open" : ""}`} aria-hidden={!expanded} inert={!expanded ? true : undefined}>{section.children.map((child) => <OwnerNavButton key={child.id} item={child} active={tab === child.id} onNavigate={onNavigate} sub />)}</div></div>;
}

export function AdminApp() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState(() => ownerTabFromPath(window.location.pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarPreference());
  const [openSections, setOpenSections] = useState(() => ({ orders: ownerSectionForTab(ownerTabFromPath(window.location.pathname)) === "orders", products: ownerSectionForTab(ownerTabFromPath(window.location.pathname)) !== "orders" }));
  const [editorDirty, setEditorDirty] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const mobileCloseRef = useRef(null);
  const mobileWasOpen = useRef(false);
  const [data, setData] = useState({ products: [], publicProducts: [], categories: [], banners: [], orders: [], orderSummary: null });
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const [products, storefront, banners, orders] = await Promise.all([api("/api/admin/products"), api("/api/public/storefront", { cache: "no-store" }), api("/api/admin/banners"), api("/api/admin/orders")]);
      setData({ products: products.products, publicProducts: storefront.products, categories: storefront.categories, banners: banners.banners, orders: orders.orders, orderSummary: orders.summary });
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
    const onPopState = () => {
      const nextTab = ownerTabFromPath(window.location.pathname);
      setTab(nextTab);
      const section = ownerSectionForTab(nextTab);
      if (section) setOpenSections((current) => ({ ...current, [section]: true }));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
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
  const labels = Object.fromEntries(ownerNavigation.flatMap((group) => [...(group.items || []), ...(group.sections || []).flatMap((section) => section.children)]).map((item) => [item.id, item.label]));
  const goTo = (id) => {
    if (editorDirty && id !== tab && !window.confirm("هناك تغييرات غير محفوظة في المنتج. هل تريد المغادرة؟")) return;
    const path = ownerPathForTab(id);
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setTab(id);
    const section = ownerSectionForTab(id);
    if (section) setOpenSections((current) => ({ ...current, [section]: true }));
    setMobileOpen(false);
  };
  const toggleSection = (id) => setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  return (
    <div className={`owner-app${sidebarCollapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`} dir="rtl">
      <header className="owner-mobile-bar" inert={mobileOpen ? true : undefined}><button ref={mobileMenuRef} type="button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? "إغلاق قائمة لوحة المالك" : "فتح قائمة لوحة المالك"} aria-controls="owner-sidebar" aria-expanded={mobileOpen}><List size={25} /></button><img src="/images/brand/melyne-logo.png" alt="MELYNE" /><span>{labels[tab]}</span></header>
      {mobileOpen && <button type="button" className="owner-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة" />}
      <aside id="owner-sidebar" className="owner-sidebar"><div className="owner-sidebar-head"><img src="/images/brand/melyne-logo.png" alt="MELYNE" /><button type="button" className="owner-sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"} aria-controls="owner-sidebar" aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}><List size={22} /></button><button ref={mobileCloseRef} type="button" className="owner-mobile-close" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة"><X size={22} /></button></div><p className="owner-name">{session.displayName}</p><nav aria-label="أقسام لوحة المالك">
        {ownerNavigation.map((group) => <div className="owner-nav-group-block" key={group.heading}><span className="owner-nav-group">{group.heading}</span>{group.items?.map((item) => <OwnerNavButton key={item.id} item={item} active={tab === item.id} onNavigate={goTo} />)}{group.sections?.map((section) => <OwnerNavSection key={section.id} section={section} tab={tab} expanded={Boolean(openSections[section.id])} onToggle={toggleSection} onNavigate={goTo} />)}</div>)}
        <a href="/" target="_blank" rel="noreferrer" aria-label="عرض المتجر" title="عرض المتجر" data-tooltip="عرض المتجر"><Storefront size={22} aria-hidden="true" /><span className="owner-nav-label">عرض المتجر</span></a><button type="button" disabled title="إعدادات المتجر تحتاج تطويراً لاحقاً"><GearSix size={22} aria-hidden="true" /><span className="owner-nav-label">إعدادات المتجر</span></button>
      </nav><button type="button" className="logout" onClick={async () => { if (editorDirty && !window.confirm("هناك تغييرات غير محفوظة. هل تريد تسجيل الخروج؟")) return; await api("/api/admin/session", { method: "DELETE" }); setSession(null); }} aria-label="خروج" title="خروج" data-tooltip="خروج"><SignOut size={22} aria-hidden="true" /><span className="owner-nav-label">خروج</span></button></aside>
      <main inert={mobileOpen ? true : undefined}>{error && <div className="owner-error" role="alert">{error}</div>}{tab === "dashboard" && <DashboardPanel data={data} goTo={goTo} />}{tab === "analytics" && <AnalyticsPanel data={data} />}{["products", "add-product"].includes(tab) && <ProductsPanel key={tab} data={data} reload={load} startNew={tab === "add-product"} onDirtyChange={setEditorDirty} onDone={tab === "add-product" ? () => { setEditorDirty(false); window.history.pushState({}, "", ownerPathForTab("products")); setTab("products"); } : undefined} />}{tab === "collections" && <CollectionsPanel data={data} />}{tab === "stock" && <StockPanel data={data} />}{["brands", "suppliers"].includes(tab) && <MetadataPanel data={data} kind={tab} />}{tab === "ordering" && <OrderingPanel data={data} reload={load} />}{tab === "banners" && <BannersPanel data={data} reload={load} />}{tab === "orders" && <OrdersPanel data={data} reload={load} goTo={goTo} api={api} />}{tab === "new-order" && <NewOrderPanel data={data} reload={load} goTo={goTo} api={api} />}</main>
    </div>
  );
}
