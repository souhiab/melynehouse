import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import request from "supertest";
import { createApp } from "../server/app.mjs";
import { applyMigrations, csrfFrom } from "./admin-test-helpers.mjs";
import { hashPassword } from "../server/security.mjs";

const customer = { name: "Local Test", phone: "0600000000", city: "Rabat", address: "Test address only" };
const payload = (items) => ({ customer, items });
const post = (app, body, key = crypto.randomUUID()) => request(app).post("/api/orders").set("idempotency-key", key).send(body);
const count = async (db, table) => Number((await db.query(`SELECT COUNT(*) count FROM ${table}`)).rows[0].count);
const stock = async (db, id) => (await db.query("SELECT stock_quantity FROM product_variants WHERE id=$1", [id])).rows[0].stock_quantity;

test("real PostgreSQL order inventory, idempotency, rollback, concurrency and cancellation", { skip: !process.env.DATABASE_URL }, async (t) => {
  const base = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const server = (await base.query("SELECT inet_server_addr() host,current_database() database")).rows[0];
  assert.ok(["127.0.0.1", "::1"].includes(server.host), "Tests must connect only to loopback PostgreSQL");
  assert.equal(server.database, "melyne_dev", "Tests must use the local development database");
  const baseline = await Promise.all(["products", "product_variants", "product_images", "orders"].map((table) => count(base, table)));
  const schema = `phase1_test_${crypto.randomBytes(8).toString("hex")}`;
  assert.match(schema, /^phase1_test_[0-9a-f]{16}$/);
  await base.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`, max: 8 });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "melyne-phase1-test-"));
  t.after(async () => {
    await db.end();
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    const after = await Promise.all(["products", "product_variants", "product_images", "orders"].map((table) => count(base, table)));
    assert.deepEqual(after, baseline, "The existing local catalog and orders must stay untouched");
    await base.end();
    assert.ok(path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await applyMigrations(db);
  const productId = "phase1-test-product";
  const variants = ["phase1-size-a", "phase1-size-b", "phase1-zero", "phase1-unknown", "phase1-disabled"];
  await db.query("INSERT INTO products(id,slug,original_name,display_name,price_mad,availability,status) VALUES($1,$2,$3,$4,100,'available','published')", [productId, productId, "Test product", "Test product"]);
  for (const [index, id] of variants.entries()) {
    const quantity = [5, 3, 0, null, 5][index];
    await db.query("INSERT INTO product_variants(id,product_id,name,price_mad,stock_quantity,available) VALUES($1,$2,$3,$4,$5,$6)", [id, productId, id, index === 1 ? 125 : 100, quantity, index !== 4]);
  }
  const adminId = crypto.randomUUID();
  await db.query("INSERT INTO admin_users(id,email,password_hash) VALUES($1,$2,$3)", [adminId, "phase1-owner@example.test", await hashPassword("correct-horse-battery-staple")]);
  const app = await createApp({ db, config: { uploadRoot: path.join(tempRoot, "uploads"), backupRoot: path.join(tempRoot, "backups"), publicBaseUrl: "http://localhost", allowedOrigins: ["http://localhost"], production: false, sessionSecret: "phase1-test-secret-long-enough-123456", googleSheetsWebhookUrl: null, googleSheetsWebhookSecret: null, orderRateLimit: 1000 } });
  const owner = request.agent(app);
  const login = await owner.post("/api/admin/session").send({ email: "phase1-owner@example.test", password: "correct-horse-battery-staple" }).expect(200);
  const csrf = csrfFrom(login);
  const status = (id, value) => owner.patch(`/api/admin/orders/${id}`).set("x-csrf-token", csrf).send({ status: value });

  await t.test("single item, multiple variants and duplicate lines reserve once", async () => {
    const first = await post(app, payload([{ productId, variantId: variants[0], quantity: 1 }])).expect(201);
    assert.equal(first.body.totalMad, 100);
    assert.equal(await stock(db, variants[0]), 4);
    const second = await post(app, payload([
      { productId, variantId: variants[0], quantity: 1 },
      { productId, variantId: variants[1], quantity: 1 },
      { productId, variantId: variants[0], quantity: 2 },
    ])).expect(201);
    assert.equal(second.body.totalMad, 425);
    assert.equal(await stock(db, variants[0]), 1);
    assert.equal(await stock(db, variants[1]), 2);
    assert.equal(Number((await db.query("SELECT COUNT(*) count FROM order_items WHERE order_id=$1", [second.body.id])).rows[0].count), 2);
    assert.equal(Number((await db.query("SELECT SUM(quantity_delta) total FROM stock_movements WHERE order_id=$1", [second.body.id])).rows[0].total), -4);
  });

  await t.test("insufficient, zero, unknown and unavailable stock are rejected without writes", async () => {
    const before = await count(db, "orders");
    for (const [id, quantity] of [[variants[0], 2], [variants[2], 1], [variants[3], 1], [variants[4], 1]]) {
      await post(app, payload([{ productId, variantId: id, quantity }])).expect(409);
    }
    await post(app, payload([{ productId, variantId: variants[1], quantity: 2 }, { productId, variantId: variants[1], quantity: 1 }])).expect(409);
    assert.equal(await count(db, "orders"), before);
    assert.equal(await stock(db, variants[1]), 2);
  });

  await t.test("same request replays, changed payload conflicts, missing key is rejected", async () => {
    const key = crypto.randomUUID();
    const body = payload([{ productId, variantId: variants[0], quantity: 1 }]);
    const first = await post(app, body, key).expect(201);
    const replay = await post(app, body, key).expect(200);
    assert.equal(replay.body.id, first.body.id);
    assert.equal(replay.body.orderNumber, first.body.orderNumber);
    assert.equal(await stock(db, variants[0]), 0);
    await post(app, payload([{ productId, variantId: variants[1], quantity: 1 }]), key).expect(409);
    await request(app).post("/api/orders").send(body).expect(400);
    assert.equal(Number((await db.query("SELECT COUNT(*) count FROM stock_movements WHERE order_id=$1", [first.body.id])).rows[0].count), 1);
  });

  await t.test("failed item insert rolls back stock and idempotency claim", async () => {
    await db.query("CREATE FUNCTION fail_order_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional test failure'; END $$");
    await db.query("CREATE TRIGGER fail_order_item BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION fail_order_item()");
    const key = crypto.randomUUID();
    const body = payload([{ productId, variantId: variants[1], quantity: 1 }]);
    const before = await stock(db, variants[1]);
    await post(app, body, key).expect(500);
    assert.equal(await stock(db, variants[1]), before);
    assert.equal(Number((await db.query("SELECT COUNT(*) count FROM order_requests WHERE idempotency_key=$1", [key])).rows[0].count), 0);
    await db.query("DROP TRIGGER fail_order_item ON order_items");
    await post(app, body, key).expect(201);
    assert.equal(await stock(db, variants[1]), before - 1);
  });

  await t.test("concurrent orders cannot oversell the final item", async () => {
    const body = payload([{ productId, variantId: variants[1], quantity: 1 }]);
    assert.equal(await stock(db, variants[1]), 1);
    const results = await Promise.all([post(app, body), post(app, body)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal(await stock(db, variants[1]), 0);
  });

  await t.test("concurrent retries with the same key create only one order", async () => {
    await db.query("UPDATE product_variants SET stock_quantity=2 WHERE id=$1", [variants[1]]);
    const body = payload([{ productId, variantId: variants[1], quantity: 1 }]);
    const key = crypto.randomUUID();
    const results = await Promise.all([post(app, body, key), post(app, body, key)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
    assert.equal(results[0].body.id, results[1].body.id);
    assert.equal(await stock(db, variants[1]), 1);
  });

  await t.test("cancellation restores once and invalid transitions fail", async () => {
    await db.query("UPDATE product_variants SET stock_quantity=2 WHERE id=$1", [variants[0]]);
    const created = await post(app, payload([{ productId, variantId: variants[0], quantity: 2 }])).expect(201);
    assert.equal(await stock(db, variants[0]), 0);
    const cancelled = await Promise.all([status(created.body.id, "cancelled"), status(created.body.id, "cancelled")]);
    assert.deepEqual(cancelled.map((result) => result.status), [200, 200]);
    assert.equal(await stock(db, variants[0]), 2);
    await status(created.body.id, "cancelled").expect(200);
    assert.equal(await stock(db, variants[0]), 2);
    await status(created.body.id, "confirmed").expect(409);
    assert.equal(Number((await db.query("SELECT COUNT(*) count FROM stock_movements WHERE order_id=$1 AND reason='order_cancelled'", [created.body.id])).rows[0].count), 1);
    const shipped = await post(app, payload([{ productId, variantId: variants[0], quantity: 1 }])).expect(201);
    await status(shipped.body.id, "confirmed").expect(200);
    await status(shipped.body.id, "preparing").expect(200);
    await status(shipped.body.id, "shipped").expect(200);
    await status(shipped.body.id, "cancelled").expect(409);
    assert.equal(await stock(db, variants[0]), 1);
  });

  await t.test("legacy orders that never reserved stock do not inflate inventory", async () => {
    const id = crypto.randomUUID();
    const before = await stock(db, variants[0]);
    await db.query("INSERT INTO orders(id,order_number,subtotal_mad,total_mad,customer,sheet_sync_status) VALUES($1,$2,100,100,$3,'disabled')",
      [id, `MLY-LEGACY-${crypto.randomBytes(4).toString("hex")}`, JSON.stringify(customer)]);
    await status(id, "shipped").expect(409);
    await status(id, "cancelled").expect(200);
    assert.equal(await stock(db, variants[0]), before);
    const row = (await db.query("SELECT inventory_state FROM orders WHERE id=$1", [id])).rows[0];
    assert.equal(row.inventory_state, "not_reserved");
  });
});
