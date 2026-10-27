import crypto from "node:crypto";
import { transaction } from "./db.mjs";

const conflict = (message) => Object.assign(new Error(message), { status: 409 });
const transitions = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function combineOrderLines(items) {
  const combined = new Map();
  for (const item of items) {
    const key = `${item.productId}\0${item.variantId || ""}`;
    const current = combined.get(key);
    if (current) current.quantity += item.quantity;
    else combined.set(key, { productId: item.productId, variantId: item.variantId || null, quantity: item.quantity });
  }
  const lines = [...combined.values()].sort((a, b) => a.productId.localeCompare(b.productId) || String(a.variantId).localeCompare(String(b.variantId)));
  if (lines.some((item) => item.quantity > 99)) throw conflict("Requested quantity exceeds the per-variant limit");
  return lines;
}

export function orderRequestHash(input, lines) {
  return crypto.createHash("sha256").update(JSON.stringify({ customer: input.customer, note: input.note, items: lines })).digest("hex");
}

export async function createOrder(db, config, input, idempotencyKey) {
  const lines = combineOrderLines(input.items);
  const requestHash = orderRequestHash(input, lines);
  return transaction(db, async (client) => {
    // The conflicting UPDATE locks the key until the first transaction commits or rolls back.
    const claim = (await client.query(`INSERT INTO order_requests(idempotency_key,request_hash)
      VALUES($1,$2) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      RETURNING request_hash,order_id`, [idempotencyKey, requestHash])).rows[0];
    if (claim.request_hash !== requestHash) throw conflict("Idempotency key was already used for a different order");
    if (claim.order_id) {
      const existing = (await client.query("SELECT id,order_number,total_mad,sheet_sync_status FROM orders WHERE id=$1", [claim.order_id])).rows[0];
      if (!existing) throw new Error("Committed order is missing");
      return { id: existing.id, orderNumber: existing.order_number, totalMad: Number(existing.total_mad), sheetSyncStatus: existing.sheet_sync_status, replayed: true };
    }

    // Parent rows first, then variant rows, always in stable order. Admin edits use the same
    // parent-before-variant order; no external calls occur while these locks are held.
    const products = new Map();
    for (const productId of [...new Set(lines.map((line) => line.productId))].sort()) {
      const product = (await client.query("SELECT id,display_name,status,availability FROM products WHERE id=$1 FOR UPDATE", [productId])).rows[0];
      if (!product || product.status !== "published" || product.availability !== "available") throw conflict("A selected product is no longer available");
      products.set(productId, product);
    }

    const checked = [];
    let subtotalCents = 0;
    for (const line of lines) {
      // A null stock quantity means unverified inventory, never unlimited inventory.
      if (!line.variantId) throw conflict("A stocked product variant must be selected");
      const variant = (await client.query("SELECT id,product_id,name,selections,price_mad,available,stock_quantity FROM product_variants WHERE id=$1 FOR UPDATE", [line.variantId])).rows[0];
      if (!variant || variant.product_id !== line.productId || !variant.available || variant.stock_quantity == null || variant.stock_quantity < line.quantity) {
        throw conflict("A selected variant is unavailable or has insufficient verified stock");
      }
      const reduced = await client.query(`UPDATE product_variants SET stock_quantity=$1,updated_at=now()
        WHERE id=$2 AND product_id=$3 AND available=true AND stock_quantity IS NOT NULL AND stock_quantity >= $4 RETURNING id`,
      [variant.stock_quantity - line.quantity, line.variantId, line.productId, line.quantity]);
      if (!reduced.rowCount) throw conflict("A selected variant no longer has enough stock");
      const unitCents = Math.round(Number(variant.price_mad) * 100);
      subtotalCents += unitCents * line.quantity;
      checked.push({ line, variant, product: products.get(line.productId), unitCents });
    }

    const id = crypto.randomUUID();
    const orderNumber = `MLY-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const syncStatus = config.googleSheetsWebhookUrl ? "pending" : "disabled";
    const total = (subtotalCents / 100).toFixed(2);
    await client.query(`INSERT INTO orders(id,order_number,subtotal_mad,total_mad,customer,customer_note,sheet_sync_status,idempotency_key,request_hash,inventory_state)
      VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,'reserved')`,
    [id, orderNumber, total, JSON.stringify(input.customer), input.note || null, syncStatus, idempotencyKey, requestHash]);
    for (const { line, variant, product, unitCents } of checked) {
      await client.query(`INSERT INTO order_items(id,order_id,product_id,variant_id,quantity,unit_price_mad,product_snapshot,variant_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [crypto.randomUUID(), id, product.id, variant.id, line.quantity, (unitCents / 100).toFixed(2), JSON.stringify({ id: product.id, displayName: product.display_name }), JSON.stringify({ id: variant.id, name: variant.name, selections: variant.selections })]);
      await client.query("INSERT INTO stock_movements(id,order_id,variant_id,quantity_delta,reason) VALUES($1,$2,$3,$4,'order_reserved')",
        [crypto.randomUUID(), id, variant.id, -line.quantity]);
    }
    await client.query("UPDATE order_requests SET order_id=$1 WHERE idempotency_key=$2", [id, idempotencyKey]);
    return { id, orderNumber, totalMad: Number(total), sheetSyncStatus: syncStatus, replayed: false };
  });
}

export async function changeOrderStatus(db, orderId, nextStatus, adminUserId, requestId) {
  if (!Object.hasOwn(transitions, nextStatus)) throw Object.assign(new Error("Invalid order status"), { status: 400 });
  return transaction(db, async (client) => {
    const order = (await client.query("SELECT id,status,inventory_state FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
    if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });
    if (order.status === nextStatus) return { id: orderId, status: nextStatus, unchanged: true };
    if (!transitions[order.status]?.includes(nextStatus)) throw conflict(`Cannot change order from ${order.status} to ${nextStatus}`);

    let inventoryState = order.inventory_state;
    if (nextStatus === "cancelled" && inventoryState === "reserved") {
      const items = (await client.query("SELECT variant_id,quantity FROM order_items WHERE order_id=$1 ORDER BY variant_id", [orderId])).rows;
      for (const item of items) {
        if (!item.variant_id) throw conflict("Order inventory cannot be restored automatically; review the item history");
        const restored = await client.query("UPDATE product_variants SET stock_quantity=stock_quantity+$1,updated_at=now() WHERE id=$2 AND stock_quantity IS NOT NULL RETURNING id", [item.quantity, item.variant_id]);
        if (!restored.rowCount) throw conflict("Order inventory cannot be restored automatically; review the variant");
        await client.query("INSERT INTO stock_movements(id,order_id,variant_id,quantity_delta,reason) VALUES($1,$2,$3,$4,'order_cancelled')",
          [crypto.randomUUID(), orderId, item.variant_id, item.quantity]);
      }
      inventoryState = "restored";
    }
    await client.query("UPDATE orders SET status=$1,inventory_state=$2,updated_at=now() WHERE id=$3", [nextStatus, inventoryState, orderId]);
    await client.query("INSERT INTO admin_audit_log(id,admin_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'status_change','order',$3,$4)",
      [crypto.randomUUID(), adminUserId, orderId, JSON.stringify({ from: order.status, to: nextStatus, inventoryState, requestId })]);
    return { id: orderId, status: nextStatus, unchanged: false };
  });
}
