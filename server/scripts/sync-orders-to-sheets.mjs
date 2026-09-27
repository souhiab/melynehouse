import { loadConfig } from "../config.mjs";
import { createDatabase } from "../db.mjs";
import { syncOrderToSheet } from "../sheet-sync.mjs";

const config = loadConfig();
if (!config.googleSheetsWebhookUrl || !config.googleSheetsWebhookSecret) {
  throw new Error("Set GOOGLE_SHEETS_WEBHOOK_URL and GOOGLE_SHEETS_WEBHOOK_SECRET in the process environment");
}

const db = createDatabase(config.databaseUrl);
try {
  const pending = await db.query("SELECT id,order_number FROM orders WHERE sheet_sync_status IN ('pending','failed') ORDER BY created_at LIMIT 100");
  for (const order of pending.rows) {
    const result = await syncOrderToSheet(db, config, order.id);
    if (result.status === "synced") console.log(`Synced ${order.order_number}`);
    else console.error(`Failed ${order.order_number}: ${result.error}`);
  }
} finally {
  await db.end();
}
