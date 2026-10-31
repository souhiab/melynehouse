import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, MagnifyingGlass, Plus, ShoppingBag, X } from "@phosphor-icons/react";
import { ORDER_SOURCES, ORDER_STATUSES, ORDER_TRANSITIONS, customerField, itemSelection, lineTotal, orderListState, productName, selectionValue, sourceLabel, statusLabel } from "./order-view-model.js";

const money = (value) => new Intl.NumberFormat("ar-MA", { style: "currency", currency: "MAD" }).format(Number(value || 0));
const dateTime = new Intl.DateTimeFormat("ar-MA", { timeZone: "Africa/Casablanca", dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("ar-MA", { timeZone: "Africa/Casablanca", dateStyle: "medium" });
const timeOnly = new Intl.DateTimeFormat("ar-MA", { timeZone: "Africa/Casablanca", timeStyle: "short" });
const formatDate = (value, formatter = dateTime) => value ? formatter.format(new Date(value)) : "—";

function CopyPhoneButton({ phone }) {
  const [feedback, setFeedback] = useState("");
  if (!phone || !String(phone).trim()) return null;
  const copy = async (event) => {
    event.stopPropagation();
    try { await navigator.clipboard.writeText(String(phone)); setFeedback("تم النسخ"); }
    catch { setFeedback("تعذر النسخ"); }
    window.setTimeout(() => setFeedback(""), 2000);
  };
  return <button type="button" className="owner-order-copy-phone" onClick={copy} aria-label="نسخ رقم الهاتف" title="نسخ رقم الهاتف">{feedback || "نسخ"}</button>;
}

function OrderThumbnail({ src }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span className="owner-order-image-empty" aria-hidden="true"><ShoppingBag size={23} /></span>;
}

function StatusBadge({ status }) {
  const tone = ORDER_STATUSES.find((item) => item.id === status)?.tone || "unknown";
  return <span className={`owner-order-status tone-${tone}`}>{statusLabel(status)}</span>;
}

function StatusSelect({ order, busy, onChange }) {
  return <select className="owner-order-status-select" aria-label={`تغيير حالة الطلب ${order.order_number}`} value={order.status} disabled={busy || !ORDER_TRANSITIONS[order.status]?.length}
    onClick={(event) => event.stopPropagation()} onChange={(event) => onChange(order, event.target.value)}>
    {ORDER_STATUSES.map((status) => <option key={status.id} value={status.id} disabled={status.id !== order.status && !ORDER_TRANSITIONS[order.status]?.includes(status.id)}>{status.label}</option>)}
  </select>;
}

function OrderProductSummary({ order }) {
  const first = order.items?.[0];
  return <div className="owner-order-product"><OrderThumbnail src={first?.thumbnailUrl} /><span className="owner-order-product-copy"><strong title={productName(first)}>{productName(first)}</strong><small dir="ltr">{order.order_number}</small><small>{first?.quantity > 1 ? `الكمية ${first.quantity} · ` : ""}{sourceLabel(order.source)}{order.items?.length > 1 ? ` · +${order.items.length - 1} منتج` : ""}</small></span></div>;
}

export function OrderDetail({ order, loading, error, onClose, onStatusChange, onRetrySheet, busy }) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const nodes = [...(panelRef.current?.querySelectorAll('button:not(:disabled), select:not(:disabled), a[href], input:not(:disabled)') || [])];
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = originalOverflow; previous?.focus?.(); };
  }, [onClose]);
  return <div className="owner-order-overlay"><button type="button" className="owner-order-backdrop" onClick={onClose} aria-label="إغلاق تفاصيل الطلب" />
    <aside ref={panelRef} className="owner-order-drawer" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" dir="rtl">
      <div className="owner-order-drawer-head"><div><span>تفاصيل الطلب</span><h2 id="order-detail-title" dir="ltr">{order?.order_number || "الطلب"}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label="إغلاق التفاصيل"><X size={22} /></button></div>
      {loading && <p role="status" className="owner-order-drawer-message">جارٍ تحميل التفاصيل…</p>}
      {error && <p role="alert" className="owner-error">{error}</p>}
      {order && <div className="owner-order-drawer-body">
        <div className="owner-order-detail-top"><div><small>تاريخ الطلب</small><strong>{formatDate(order.created_at)}</strong></div><div><small>المصدر</small><strong>{sourceLabel(order.source)}</strong></div></div>
        <section className="owner-order-detail-section"><h3>الحالة</h3><div className="owner-order-detail-status"><StatusBadge status={order.status} /><StatusSelect order={order} busy={busy} onChange={onStatusChange} /></div></section>
        <section className="owner-order-detail-section"><h3>العميل</h3><dl className="owner-order-detail-grid"><div><dt>الاسم الكامل</dt><dd>{customerField(order, "name")}</dd></div><div><dt>رقم الهاتف</dt><dd className="owner-order-phone"><b dir="ltr">{customerField(order, "phone")}</b><CopyPhoneButton phone={order.customer?.phone} /></dd></div><div><dt>المدينة</dt><dd>{customerField(order, "city")}</dd></div><div><dt>العنوان</dt><dd>{customerField(order, "address")}</dd></div></dl></section>
        <section className="owner-order-detail-section"><h3>المنتجات ({order.items?.length || 0})</h3><div className="owner-order-detail-items">{(order.items || []).map((item, index) => <article key={index} className="owner-order-detail-item"><OrderThumbnail src={item.thumbnailUrl} /><div><strong>{productName(item)}</strong><small>المقاس: {selectionValue(item, "size") || "—"} · اللون: {selectionValue(item, "color") || "—"}</small><small>الكمية: {item.quantity} × {money(item.unitPriceMad)}</small></div><b>{money(lineTotal(item))}</b></article>)}</div>
          <div className="owner-order-totals"><div><span>المجموع الفرعي المحفوظ</span><strong>{money(order.subtotal_mad)}</strong></div><div className="final"><span>الإجمالي المحفوظ</span><strong>{money(order.total_mad)}</strong></div></div></section>
        {order.customer_note && <section className="owner-order-detail-section"><h3>ملاحظات الطلب</h3><p className="owner-order-note">{order.customer_note}</p></section>}
        <section className="owner-order-detail-section"><h3>سجل الحالة</h3>{order.statusHistory?.length ? <ol className="owner-order-history">{order.statusHistory.map((entry, index) => <li key={index}><strong>من {statusLabel(entry.from)} إلى {statusLabel(entry.to)}</strong><small>{formatDate(entry.createdAt)}</small></li>)}</ol> : <p className="owner-order-muted">لا توجد تغييرات حالة مسجلة لهذا الطلب.</p>}</section>
        <div className="owner-order-sync"><span>نسخة Google Sheet: {order.sheet_sync_status || "—"}</span>{order.sheet_sync_status === "failed" && !order.created_by_admin && <button type="button" className="quiet" disabled={busy} onClick={() => onRetrySheet(order)}>إعادة المحاولة</button>}</div>
      </div>}
    </aside>
  </div>;
}

const initialFilters = { search: "", status: "", source: "", dateFrom: "", dateTo: "", sort: "newest" };

export function OrdersPanel({ data, reload, goTo, api }) {
  const [filters, setFilters] = useState(initialFilters);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(data.orders || []);
  const [summary, setSummary] = useState(data.orderSummary || { total: 0, statusCounts: {} });
  const [filteredTotal, setFilteredTotal] = useState(data.orderSummary?.total || 0);
  const [pageSize, setPageSize] = useState(50);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { const timer = setTimeout(() => { setPage(1); setFilters((current) => current.search === searchText.trim() ? current : { ...current, search: searchText.trim() }); }, 320); return () => clearTimeout(timer); }, [searchText]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), sort: filters.sort });
    for (const key of ["search", "status", "source", "dateFrom", "dateTo"]) if (filters[key]) params.set(key, filters[key]);
    setLoading(true); setError("");
    api(`/api/admin/orders?${params}`).then((result) => { if (!active) return; const list = orderListState(result); setRows(list.orders); setSummary(list.summary); setFilteredTotal(list.filteredTotal); setPageSize(list.pageSize); if (list.outdatedApi) setError("واجهة الطلبات متصلة بإصدار قديم من الخادم. أعد تشغيل خادم API المحلي لتفعيل البحث والصفحات."); })
      .catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, page, filters, refresh]);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setDetailLoading(true); setDetailError("");
    api(`/api/admin/orders/${selectedId}`).then((result) => { if (active) setDetail(result); })
      .catch((failure) => { if (active) setDetailError(failure.message); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [api, selectedId, refresh]);

  const updateFilter = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
  const closeDetail = useCallback(() => { setSelectedId(null); setDetail(null); setDetailError(""); }, []);
  const openDetail = (id) => { setDetail(null); setSelectedId(id); };
  const changeStatus = async (order, next) => {
    if (next === order.status) return;
    if (next === "cancelled" && !window.confirm(`إلغاء الطلب ${order.order_number}؟ سيُعاد المخزون المحجوز مرة واحدة إذا كان مؤهلاً، وسيبقى الطلب محفوظاً.`)) return;
    setBusyId(order.id); setError(""); setDetailError("");
    try { await api(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) }); setRefresh((value) => value + 1); await reload(); }
    catch (failure) { setError(failure.message); setDetailError(failure.message); setRefresh((value) => value + 1); }
    finally { setBusyId(null); }
  };
  const retrySheet = async (order) => {
    setBusyId(order.id);
    try { await api(`/api/admin/orders/${order.id}/retry-sheet-sync`, { method: "POST", body: "{}" }); setRefresh((value) => value + 1); await reload(); }
    catch (failure) { setDetailError(failure.message); }
    finally { setBusyId(null); }
  };
  const clearFilters = () => { setSearchText(""); setPage(1); setFilters(initialFilters); };
  const selectedSummary = rows.find((order) => order.id === selectedId);
  return <section className="owner-orders-page">
    <div className="owner-orders-header"><div><span className="owner-orders-eyebrow">الطلبات / إدارة المتجر</span><h1>إدارة الطلبات</h1><p>عرض ومتابعة وإدارة طلبات المتجر</p></div><button type="button" className="owner-orders-add" onClick={() => goTo("new-order")}><Plus size={19} aria-hidden="true" /> طلب جديد</button></div>
    <div className="owner-order-stats" aria-label="ملخص الطلبات">{[
      ["إجمالي الطلبات", summary.total], ["قيد الانتظار", summary.statusCounts?.new], ["مؤكد", summary.statusCounts?.confirmed],
      ["لا يرد", summary.statusCounts?.no_response], ["ملغى", summary.statusCounts?.cancelled],
    ].map(([label, value], index) => <article key={label} className={`owner-order-stat stat-${index}`}><span>{label}</span><strong>{Number(value || 0).toLocaleString("ar-MA")}</strong></article>)}</div>
    <div className="owner-order-toolbar"><label className="owner-order-search"><span>بحث في الطلبات</span><div><MagnifyingGlass size={18} aria-hidden="true" /><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="الاسم، المدينة، الهاتف أو رقم الطلب" /></div></label>
      <label>الحالة<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">كل الحالات</option>{ORDER_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
      <label>المصدر<select value={filters.source} onChange={(event) => updateFilter("source", event.target.value)}><option value="">كل المصادر</option>{ORDER_SOURCES.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
      <label>من<input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(event) => updateFilter("dateFrom", event.target.value)} /></label>
      <label>إلى<input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => updateFilter("dateTo", event.target.value)} /></label>
      <button type="button" className="owner-order-clear" onClick={clearFilters}>مسح الفلاتر</button></div>
    <div className="owner-order-list-head"><strong>الطلبات <span>{filteredTotal.toLocaleString("ar-MA")}</span></strong><span>{loading ? "جارٍ التحديث…" : `عرض ${rows.length} من ${filteredTotal} طلب`}</span></div>
    {error && <div role="alert" className="owner-error">{error}</div>}
    <div className="owner-orders-table" role="region" aria-label="قائمة الطلبات" tabIndex="0"><table><thead><tr><th>المنتج</th><th>الاسم الكامل</th><th>رقم الهاتف</th><th>المدينة</th><th>حالة الطلب</th><th>المبلغ الإجمالي</th><th>المقاس</th><th>اللون</th><th><button type="button" className="owner-order-sort" onClick={() => updateFilter("sort", filters.sort === "newest" ? "oldest" : "newest")} aria-label={`ترتيب حسب تاريخ الطلب: ${filters.sort === "newest" ? "الأحدث أولاً" : "الأقدم أولاً"}`}>تاريخ الطلب {filters.sort === "newest" ? <ArrowDown size={15} /> : <ArrowUp size={15} />}</button></th></tr></thead><tbody>{rows.map((order) => <tr key={order.id} tabIndex="0" aria-label={`تفاصيل الطلب ${order.order_number}`} onClick={() => openDetail(order.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); openDetail(order.id); } }}><td><OrderProductSummary order={order} /></td><td title={customerField(order, "name")}>{customerField(order, "name")}</td><td><div className="owner-order-phone" onClick={(event) => event.stopPropagation()}><b dir="ltr" title={customerField(order, "phone")}>{customerField(order, "phone")}</b><CopyPhoneButton phone={order.customer?.phone} /></div></td><td title={customerField(order, "city")}>{customerField(order, "city")}</td><td><div className="owner-order-status-cell" onClick={(event) => event.stopPropagation()}><StatusBadge status={order.status} /><StatusSelect order={order} busy={busyId === order.id} onChange={changeStatus} /></div></td><td className="owner-order-price">{money(order.total_mad)}</td><td title={itemSelection(order, "size")}>{itemSelection(order, "size")}</td><td title={itemSelection(order, "color")}>{itemSelection(order, "color")}</td><td><time dateTime={order.created_at}>{formatDate(order.created_at, dateOnly)}<small>{formatDate(order.created_at, timeOnly)}</small></time></td></tr>)}</tbody></table></div>
    <div className="owner-order-mobile-list">{rows.map((order) => <article key={order.id} className="owner-order-mobile-card">
      <button type="button" className="owner-order-mobile-open" onClick={() => openDetail(order.id)} aria-label={`تفاصيل الطلب ${order.order_number}`}><OrderProductSummary order={order} /></button>
      <div className="owner-order-mobile-priority"><StatusBadge status={order.status} /><strong>{money(order.total_mad)}</strong></div>
      <div className="owner-order-mobile-customer"><span className="owner-order-mobile-field"><small>الاسم الكامل</small><strong>{customerField(order, "name")}</strong></span><span className="owner-order-mobile-field"><small>رقم الهاتف</small><span className="owner-order-phone"><b dir="ltr" title={customerField(order, "phone")}>{customerField(order, "phone")}</b><CopyPhoneButton phone={order.customer?.phone} /></span></span></div>
      <div className="owner-order-mobile-delivery"><span className="owner-order-mobile-field"><small>المدينة</small><span>{customerField(order, "city")}</span></span><span className="owner-order-mobile-field"><small>المقاس</small><span>{itemSelection(order, "size")}</span></span><span className="owner-order-mobile-field"><small>اللون</small><span>{itemSelection(order, "color")}</span></span></div>
      <div className="owner-order-mobile-footer"><time dateTime={order.created_at}>{formatDate(order.created_at, dateOnly)}<small>{formatDate(order.created_at, timeOnly)}</small></time><div className="owner-order-mobile-actions"><StatusSelect order={order} busy={busyId === order.id} onChange={changeStatus} /><button type="button" className="owner-order-mobile-details" onClick={() => openDetail(order.id)}>عرض التفاصيل</button></div></div>
    </article>)}</div>
    {!rows.length && !loading && <div className="owner-order-empty">لا توجد طلبات تطابق البحث أو الفلاتر الحالية.</div>}
    {loading && <p className="owner-order-loading" role="status">جارٍ تحميل الطلبات…</p>}
    {filteredTotal > pageSize && <nav className="owner-pagination" aria-label="صفحات الطلبات"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>السابق</button><span>الصفحة {page} من {Math.ceil(filteredTotal / pageSize)}</span><button type="button" disabled={page >= Math.ceil(filteredTotal / pageSize) || loading} onClick={() => setPage(page + 1)}>التالي</button></nav>}
    {selectedId && <OrderDetail order={detail || selectedSummary} loading={detailLoading} error={detailError} onClose={closeDetail} onStatusChange={changeStatus} onRetrySheet={retrySheet} busy={busyId === selectedId} />}
  </section>;
}
