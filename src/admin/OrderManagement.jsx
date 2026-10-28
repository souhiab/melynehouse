import { useEffect, useRef, useState } from "react";
import { Plus, ShoppingBag } from "@phosphor-icons/react";

const money = (value) => new Intl.NumberFormat("ar-MA", { style: "currency", currency: "MAD" }).format(Number(value || 0));
const sources = { website: "الموقع", whatsapp: "واتساب", instagram: "إنستغرام", facebook: "فيسبوك", other: "مصدر آخر" };
const statusLabels = { new: "جديد", confirmed: "مؤكد", preparing: "قيد التجهيز", shipped: "شُحن", delivered: "سُلّم", cancelled: "ملغى" };
const transitions = { new: ["confirmed", "cancelled"], confirmed: ["preparing", "cancelled"], preparing: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [] };

export function OrdersPanel({ data, reload, goTo, api }) {
  const [statusError, setStatusError] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(data.orders);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const refreshPage = async (requestedPage = page) => {
    const result = await api(`/api/admin/orders?page=${requestedPage}`);
    setRows(result.orders); setPageSize(result.pageSize);
  };
  useEffect(() => {
    let current = true;
    setLoading(true);
    api(`/api/admin/orders?page=${page}`).then((result) => { if (current) { setRows(result.orders); setPageSize(result.pageSize); setStatusError(""); } }).catch((error) => { if (current) setStatusError(error.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page]);
  return <section>
    <div className="panel-title"><div><h1>جميع الطلبات</h1><p>{data.orderSummary?.total ?? "—"} طلب محفوظ محلياً. بيانات العملاء تظهر للمالك فقط.</p></div><button type="button" onClick={() => goTo("new-order")}><Plus size={20} /> طلب جديد</button></div>
    {statusError && <div className="owner-error" role="alert">{statusError}</div>}
    <div className="orders-table" role="region" aria-label="جميع الطلبات" tabIndex="0"><table><thead><tr><th>الطلب والمنتجات</th><th>العميل</th><th>المصدر</th><th>المجموع</th><th>الحالة</th><th>Google Sheet</th><th>التاريخ</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}>
      <td><strong dir="ltr">{order.order_number}</strong><div className="owner-order-items">{(order.items || []).map((item, index) => <div className="owner-order-item" key={`${order.id}-${index}`}>
        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" /> : <span className="owner-order-image-empty" aria-hidden="true"><ShoppingBag size={22} /></span>}
        <span><strong>{item.productSnapshot?.displayName || "منتج محفوظ"}</strong><small>{item.variantSnapshot?.selections?.map((selection) => `${selection.option}: ${selection.value}`).join(" · ") || item.variantSnapshot?.name || ""}</small><small>{item.quantity} × {money(item.unitPriceMad)}</small></span>
      </div>)}</div></td>
      <td>{order.customer?.name}<small>{order.customer?.phone}<br />{order.customer?.city}</small></td><td>{sources[order.source] || order.source || "—"}</td><td>{money(order.total_mad)}</td>
      <td><select aria-label={`حالة الطلب ${order.order_number}`} value={order.status} onChange={async (event) => { try { setStatusError(""); await api(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }); await Promise.all([reload(), refreshPage()]); } catch (error) { setStatusError(error.message); await refreshPage(); } }}>{Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status} disabled={status !== order.status && !transitions[order.status]?.includes(status)}>{label}</option>)}</select></td>
      <td><span className={`sync ${order.sheet_sync_status}`}>{order.sheet_sync_status}</span>{order.sheet_sync_status === "failed" && <button type="button" className="quiet" onClick={async () => { try { setStatusError(""); await api(`/api/admin/orders/${order.id}/retry-sheet-sync`, { method: "POST", body: "{}" }); await Promise.all([reload(), refreshPage()]); } catch (error) { setStatusError(error.message); } }}>إعادة المحاولة</button>}</td><td>{new Date(order.created_at).toLocaleString("ar-MA")}</td>
    </tr>)}</tbody></table>{!rows.length && !loading && <p className="empty-admin">لا توجد طلبات في هذه الصفحة.</p>}</div>
    {loading && <p role="status">جارٍ تحميل الطلبات…</p>}
    {Number(data.orderSummary?.total || 0) > pageSize && <nav className="owner-pagination" aria-label="صفحات الطلبات"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>السابق</button><span>الصفحة {page} من {Math.ceil(data.orderSummary.total / pageSize)}</span><button type="button" disabled={page >= Math.ceil(data.orderSummary.total / pageSize) || loading} onClick={() => setPage(page + 1)}>التالي</button></nav>}
  </section>;
}

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
      <div className="owner-form-grid"><label>الاسم<input required minLength="2" value={customer.name} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, name: event.target.value }); }} /></label><label>الهاتف<input required minLength="6" type="tel" dir="ltr" value={customer.phone} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, phone: event.target.value }); }} /></label><label>المدينة<input required minLength="2" value={customer.city} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, city: event.target.value }); }} /></label><label>العنوان<input required minLength="4" value={customer.address} onChange={(event) => { keyRef.current = null; setCustomer({ ...customer, address: event.target.value }); }} /></label><label>مصدر الطلب<select value={source} onChange={(event) => { keyRef.current = null; setSource(event.target.value); }}>{Object.entries(sources).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <h2>المنتجات</h2>{lines.map((line, index) => <div className="owner-manual-line" key={line.key}><label>المنتج {index + 1}<select required value={line.productId} onChange={(event) => updateLine(line.key, { productId: event.target.value, variantId: "" })}><option value="">اختر منتجاً</option>{products.map((product) => <option key={product.id} value={product.id}>{product.displayName || product.name}</option>)}</select></label><label>المقاس / اللون<select required value={line.variantId} onChange={(event) => updateLine(line.key, { variantId: event.target.value })}><option value="">اختر التوليفة</option>{variantsFor(line.productId).map((variant) => <option key={variant.id} value={variant.id}>{variant.selections.map((selection) => `${selection.option}: ${selection.value}`).join(" · ") || variant.name} — {money(variant.price.current)} ({variant.stockQuantity} متوفر)</option>)}</select></label><label>الكمية<input required type="number" min="1" max="99" step="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></label><button type="button" className="danger" disabled={lines.length === 1} onClick={() => updateLines(lines.filter((item) => item.key !== line.key))}>إزالة</button></div>)}
      <button type="button" className="quiet" onClick={() => updateLines([...lines, blankLine()])}><Plus size={18} /> إضافة منتج آخر</button>
      <label>ملاحظة داخلية<textarea value={note} onChange={(event) => { keyRef.current = null; setNote(event.target.value); }} maxLength="2000" rows="3" /></label>
      <p className="owner-editor-note">المبالغ المعروضة إرشادية؛ المجموع النهائي والمخزون يتحقق منهما الخادم عند الحفظ. التوليفات غير المتاحة أو غير مؤكدة المخزون لا تقبل الطلب.</p>
      <div className="form-actions"><button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ الطلب وحجز المخزون"}</button></div>
    </form>
  </section>;
}
