const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const statuses = new Set(["new", "no_response", "confirmed", "preparing", "shipped", "delivered", "cancelled"]);
const sources = new Set(["website", "whatsapp", "instagram", "facebook", "tiktok", "phone", "other", "unknown"]);

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseOrderFilters(query = {}) {
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw badRequest("Invalid order page");
  const search = String(query.search || "").trim();
  if (search.length > 120) throw badRequest("Order search is too long");
  const status = String(query.status || "");
  const source = String(query.source || "");
  const dateFrom = String(query.dateFrom || "");
  const dateTo = String(query.dateTo || "");
  const sort = String(query.sort || "newest");
  if (status && !statuses.has(status)) throw badRequest("Invalid order status filter");
  if (source && !sources.has(source)) throw badRequest("Invalid order source filter");
  if (dateFrom && !validDate(dateFrom)) throw badRequest("Invalid start date");
  if (dateTo && !validDate(dateTo)) throw badRequest("Invalid end date");
  if (dateFrom && dateTo && dateFrom > dateTo) throw badRequest("Start date must be before end date");
  if (!["newest", "oldest"].includes(sort)) throw badRequest("Invalid order sort");
  return { page, search, status, source, dateFrom, dateTo, sort };
}

function filterSql(filters) {
  const conditions = [];
  const values = [];
  const add = (value) => { values.push(value); return `$${values.length}`; };
  if (filters.search) {
    const value = add(`%${filters.search}%`);
    conditions.push(`(o.order_number ILIKE ${value} OR o.customer::text ILIKE ${value} OR EXISTS (
      SELECT 1 FROM order_items oi WHERE oi.order_id=o.id AND oi.product_snapshot::text ILIKE ${value}))`);
  }
  if (filters.status) conditions.push(`o.status=${add(filters.status)}`);
  if (filters.source) conditions.push(`o.source=${add(filters.source)}`);
  if (filters.dateFrom) conditions.push(`o.created_at >= (${add(filters.dateFrom)}::date AT TIME ZONE 'Africa/Casablanca')`);
  if (filters.dateTo) conditions.push(`o.created_at < ((${add(filters.dateTo)}::date + INTERVAL '1 day') AT TIME ZONE 'Africa/Casablanca')`);
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

const orderColumns = "o.id,o.order_number,o.status,o.source,o.created_by_admin,o.currency,o.subtotal_mad,o.total_mad,o.customer,o.customer_note,o.sheet_sync_status,o.sheet_sync_error,o.sheet_synced_at,o.created_at";

async function attachItems(db, orders) {
  const ids = orders.map((order) => order.id);
  if (!ids.length) return [];
  const items = (await db.query(`SELECT oi.order_id,oi.product_id,oi.quantity,oi.unit_price_mad,oi.product_snapshot,oi.variant_snapshot,pi.public_url AS thumbnail_url
    FROM order_items oi LEFT JOIN product_variants pv ON pv.id=oi.variant_id LEFT JOIN product_images pi ON pi.id=pv.image_id
    WHERE oi.order_id=ANY($1::uuid[]) ORDER BY oi.created_at,oi.id`, [ids])).rows;
  const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
  const images = productIds.length ? (await db.query("SELECT product_id,public_url FROM product_images WHERE product_id=ANY($1::text[]) AND archived_at IS NULL ORDER BY sort_position,id", [productIds])).rows : [];
  const firstImage = new Map();
  for (const image of images) if (!firstImage.has(image.product_id)) firstImage.set(image.product_id, image.public_url);
  const byOrder = new Map(ids.map((id) => [id, []]));
  for (const item of items) byOrder.get(item.order_id)?.push({
    quantity: item.quantity, unitPriceMad: Number(item.unit_price_mad), productSnapshot: item.product_snapshot,
    variantSnapshot: item.variant_snapshot, thumbnailUrl: item.thumbnail_url || firstImage.get(item.product_id) || null,
  });
  return orders.map((order) => ({ ...order, subtotal_mad: Number(order.subtotal_mad), total_mad: Number(order.total_mad), items: byOrder.get(order.id) || [] }));
}

export async function listAdminOrders(db, query) {
  const filters = parseOrderFilters(query);
  const pageSize = 50;
  const { where, values } = filterSql(filters);
  const direction = filters.sort === "oldest" ? "ASC" : "DESC";
  const [result, matching, totals, grouped] = await Promise.all([
    db.query(`SELECT ${orderColumns} FROM orders o ${where} ORDER BY o.created_at ${direction},o.id ${direction} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, (filters.page - 1) * pageSize]),
    db.query(`SELECT COUNT(*) AS total FROM orders o ${where}`, values),
    db.query("SELECT COUNT(*) AS total, SUM(CASE WHEN status <> 'cancelled' THEN 1 ELSE 0 END) AS accepted, SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS open, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_mad ELSE 0 END),0) AS accepted_total_mad FROM orders"),
    db.query("SELECT status,COUNT(*) AS total FROM orders GROUP BY status"),
  ]);
  const total = totals.rows[0];
  return {
    orders: await attachItems(db, result.rows), page: filters.page, pageSize, filteredTotal: Number(matching.rows[0].total),
    summary: { total: Number(total.total), accepted: Number(total.accepted), open: Number(total.open), acceptedTotalMad: Number(total.accepted_total_mad),
      statusCounts: Object.fromEntries(grouped.rows.map((row) => [row.status, Number(row.total)])) },
  };
}

export async function getAdminOrder(db, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw badRequest("Invalid order ID");
  const result = await db.query(`SELECT ${orderColumns} FROM orders o WHERE o.id=$1`, [id]);
  if (!result.rowCount) throw Object.assign(new Error("Order not found"), { status: 404 });
  const [order] = await attachItems(db, result.rows);
  const history = (await db.query("SELECT created_at,details FROM admin_audit_log WHERE entity_type='order' AND entity_id=$1 AND action='status_change' ORDER BY created_at,id", [id])).rows;
  return { ...order, statusHistory: history.map((event) => ({ createdAt: event.created_at, from: event.details?.from || null, to: event.details?.to || null })) };
}
