import crypto from "node:crypto";

export async function syncOrderToSheet(db, config, orderId, fetchImpl = globalThis.fetch) {
  if (!config.googleSheetsWebhookUrl) {
    await db.query("UPDATE orders SET sheet_sync_status='disabled',sheet_sync_error=NULL,updated_at=now() WHERE id=$1",[orderId]);
    return { status: "disabled", error: null };
  }

  const orderResult=await db.query("SELECT id,order_number,status,currency,subtotal_mad,total_mad,customer,customer_note,created_at FROM orders WHERE id=$1",[orderId]);
  if (!orderResult.rowCount) throw Object.assign(new Error("Order not found"),{status:404});
  const itemsResult=await db.query("SELECT quantity,unit_price_mad,product_snapshot,variant_snapshot FROM order_items WHERE order_id=$1 ORDER BY created_at,id",[orderId]);
  const order=orderResult.rows[0];
  const payload=JSON.stringify({
    event:"melyne.cod_order.created",
    order:{...order,subtotal_mad:Number(order.subtotal_mad),total_mad:Number(order.total_mad),items:itemsResult.rows.map((item)=>({...item,unit_price_mad:Number(item.unit_price_mad)}))},
  });
  const signature=crypto.createHmac("sha256",config.googleSheetsWebhookSecret).update(payload).digest("hex");

  try {
    const response=await fetchImpl(config.googleSheetsWebhookUrl,{method:"POST",headers:{"content-type":"application/json","x-melyne-signature":`sha256=${signature}`},body:payload,signal:AbortSignal.timeout(8_000)});
    if (!response.ok) throw new Error(`Google Sheet webhook returned ${response.status}`);
    await db.query("UPDATE orders SET sheet_sync_status='synced',sheet_sync_error=NULL,sheet_synced_at=now(),updated_at=now() WHERE id=$1",[orderId]);
    return { status:"synced",error:null };
  } catch (error) {
    const message=String(error?.message||error).slice(0,1000);
    await db.query("UPDATE orders SET sheet_sync_status='failed',sheet_sync_error=$1,updated_at=now() WHERE id=$2",[message,orderId]);
    return { status:"failed",error:message };
  }
}
