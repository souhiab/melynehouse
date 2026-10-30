import { useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { ORDER_SOURCES } from "./order-view-model.js";

const money = (value) => new Intl.NumberFormat("ar-MA", { style: "currency", currency: "MAD" }).format(Number(value || 0));

const blankLine = () => ({ key: crypto.randomUUID(), productId: "", variantId: "", quantity: 1 });

export function NewOrderPanel({ data, reload, goTo, api }) {
  const [customer, setCustomer] = useState({ name: "", phone: "", city: "", address: "" });
  const [source, setSource] = useState("whatsapp");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([blankLine]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(null);
  const products = data.products.filter((product) => product.status === "published" && product.availability === "available");
  const updateLines = (next) => { keyRef.current = null; setLines(next); };
  const updateLine = (key, change) => updateLines(lines.map((line) => line.key === key ? { ...line, ...change } : line));
  const variantsFor = (productId) => products.find((product) => product.id === productId)?.variants.filter((variant) => !variant.retired && variant.availability === "available" && Number.isInteger(variant.stockQuantity) && variant.stockQuantity > 0) || [];
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    keyRef.current ||= crypto.randomUUID();
    try {
      const items = lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity: Number(quantity) }));
      await api("/api/admin/orders", { method: "POST", headers: { "idempotency-key": keyRef.current }, body: JSON.stringify({ customer, source, note, items }) });
      await reload();
      goTo("orders");
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  return <section><div className="panel-title"><div><h1>طلب جديد</h1><p>إنشاء طلب دفع عند الاستلام محلياً. يتحقق الخادم من النشر والسعر والمخزون ويحجزه داخل معاملة واحدة. لا تتم مزامنة هذا الطلب مع Google Sheet.</p></div><button type="button" className="quiet" onClick={() => goTo("orders")}>جميع الطلبات</button></div>
    <form className="owner-editor owner-manual-order" onSubmit={submit}>{error && <div className="owner-error" role="alert">{error}</div>}
      <div className="owner-form-grid"><label>الاسم<input required minLength="2" value={customer.name} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, name: event.target.value }); }} /></label><label>الهاتف<input required minLength="6" type="tel" dir="ltr" value={customer.phone} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, phone: event.target.value }); }} /></label><label>المدينة<input required minLength="2" value={customer.city} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, city: event.target.value }); }} /></label><label>العنوان<input required minLength="4" value={customer.address} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, address: event.target.value }); }} /></label><label>مصدر الطلب<select value={source} onChange={(event) => { keyRef.current = null; setSource(event.target.value); }}>{ORDER_SOURCES.filter((item) => item.id !== "unknown").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      <h2>المنتجات</h2>{lines.map((line, index) => <div className="owner-manual-line" key={line.key}><label>المنتج {index + 1}<select required value={line.productId} onChange={(event) => updateLine(line.key, { productId: event.target.value, variantId: "" })}><option value="">اختر منتجاً</option>{products.map((product) => <option key={product.id} value={product.id}>{product.displayName || product.name}</option>)}</select></label><label>المقاس / اللون<select required value={line.variantId} onChange={(event) => updateLine(line.key, { variantId: event.target.value })}><option value="">اختر التوليفة</option>{variantsFor(line.productId).map((variant) => <option key={variant.id} value={variant.id}>{variant.selections.map((selection) => `${selection.option}: ${selection.value}`).join(" · ") || variant.name} — {money(variant.price.current)} ({variant.stockQuantity} متوفر)</option>)}</select></label><label>الكمية<input required type="number" min="1" max="99" step="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></label><button type="button" className="danger" disabled={lines.length === 1} onClick={() => updateLines(lines.filter((item) => item.key !== line.key))}>إزالة</button></div>)}
      <button type="button" className="quiet" onClick={() => updateLines([...lines, blankLine()])}><Plus size={18} /> إضافة منتج آخر</button>
      <label>ملاحظة داخلية<textarea value={note} onChange={(event) => { keyRef.current = null; setNote(event.target.value); }} maxLength="2000" rows="3" /></label>
      <p className="owner-editor-note">المبالغ المعروضة إرشادية؛ المجموع النهائي والمخزون يتحقق منهما الخادم عند الحفظ. التوليفات غير المتاحة أو غير مؤكدة المخزون لا تقبل الطلب.</p>
      <div className="form-actions"><button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ الطلب وحجز المخزون"}</button></div>
    </form>
  </section>;
}
