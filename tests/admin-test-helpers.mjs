import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { newDb } from "pg-mem";
import { createApp } from "../server/app.mjs";
import { importCatalog } from "../server/import-catalog.mjs";
import { hashPassword } from "../server/security.mjs";

export async function applyMigrations(db, { emulated = false } = {}) {
  const directory=path.resolve("server/sql");
  const files=(await fs.readdir(directory)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  for(const file of files) {
    let sql=await fs.readFile(path.join(directory,file),"utf8");
    // PL/pgSQL triggers are verified by the real PostgreSQL suites, not pg-mem.
    if(emulated)sql=sql.replace(/-- REAL_POSTGRES_ONLY_START[\s\S]*?-- REAL_POSTGRES_ONLY_END/g,'');
    await db.query(sql);
  }
  // pg-mem assigns anonymous CHECK names differently from PostgreSQL. Migration
  // 004 drops PostgreSQL's products_status_check; remove pg-mem's stale copy.
  await db.query("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_constraint_4");
}

export async function setupTestSystem({ importProducts = true, configOverrides = {}, fetchImpl = globalThis.fetch } = {}) {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const db = new adapter.Pool();
  await applyMigrations(db, { emulated: true });
  if (importProducts) await importCatalog(db, path.resolve("data/products.json"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "melyne-admin-test-"));
  const config = {
    uploadRoot: path.join(tempRoot, "uploads"), backupRoot: path.join(tempRoot, "backups"),
    publicBaseUrl: "http://localhost", allowedOrigins: ["http://localhost"], production: false,
    sessionSecret: "test-secret-is-long-enough-for-session-hashes", googleSheetsWebhookUrl: null,
    googleSheetsWebhookSecret: null,
    ...configOverrides,
  };
  const email = "owner@example.test"; const password = "correct-horse-battery-staple";
  await db.query("INSERT INTO admin_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)", [crypto.randomUUID(), email, await hashPassword(password), "Owner"]);
  const app = await createApp({ db, config, fetchImpl });
  return { app, db, config, tempRoot, email, password, cleanup: () => fs.rm(tempRoot, { recursive: true, force: true }) };
}

export function csrfFrom(response) {
  const value = response.headers["set-cookie"].find((cookie) => cookie.startsWith("melyne_owner_csrf="));
  return decodeURIComponent(value.split(";")[0].split("=").slice(1).join("="));
}

