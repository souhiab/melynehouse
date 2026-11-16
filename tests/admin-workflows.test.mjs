import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { setupTestSystem, csrfFrom } from "./admin-test-helpers.mjs";
import { createApp } from "../server/app.mjs";
import { createUploadBackup } from "../server/backup-uploads.mjs";
import { deriveProductStats } from "../src/admin/product-stats.js";

async function authenticated(system) {
  const agent = request.agent(system.app);
  const login = await agent.post("/api/admin/session").send({ email: system.email, password: system.password }).expect(200);
  return { agent, csrf: csrfFrom(login) };
}

test("authenticated owner can create, edit, reorder and recoverably archive a product", async (t) => {
  const system = await setupTestSystem(); t.after(async()=>{await system.db.end();await system.cleanup()}); const { agent, csrf } = await authenticated(system);
  const metrics = async () => {
    const [admin, publicCatalog] = await Promise.all([agent.get("/api/admin/products").expect(200), agent.get("/api/public/storefront").expect(200)]);
    return deriveProductStats(admin.body.products, publicCatalog.body.products);
  };
  assert.deepEqual(await metrics(), { total: 34, published: 34, draft: 0, visible: 34, variable: 34 });
  const payload = { sku:"TEST-1",slug:"test-owner-product",originalName:"منتج اختباري",displayName:"منتج اختباري",description:"وصف",descriptionHtml:null,priceMad:199,comparisonPriceMad:249,availability:"available",status:"published",categorySlugs:["kids"],options:[],variants:[],featured:false };
  const created = await agent.post("/api/admin/products").set("x-csrf-token",csrf).send(payload).expect(201);
  assert.deepEqual(await metrics(), { total: 35, published: 35, draft: 0, visible: 35, variable: 34 });
  await agent.put(`/api/admin/products/${created.body.id}`).set("x-csrf-token",csrf).send({...payload,displayName:"منتج معدل",priceMad:189}).expect(200);
  let publicData = await agent.get("/api/public/storefront").expect(200);
  assert.equal(publicData.body.products.find((product)=>product.id===created.body.id).displayName,"منتج معدل");
  await agent.put(`/api/admin/products/${created.body.id}`).set("x-csrf-token",csrf).send({...payload,displayName:"منتج معدل",priceMad:189,status:"hidden"}).expect(200);
  assert.deepEqual(await metrics(), { total: 35, published: 34, draft: 0, visible: 34, variable: 34 });
  publicData=await agent.get("/api/public/storefront").expect(200);assert.equal(publicData.body.products.some((product)=>product.id===created.body.id),false);
  await agent.put(`/api/admin/products/${created.body.id}`).set("x-csrf-token",csrf).send({...payload,displayName:"منتج معدل",priceMad:189,status:"published"}).expect(200);
  const kids = publicData.body.products.filter((product)=>product.categories.some((category)=>category.slug==="kids"));
  const reordered = [created.body.id,...kids.filter((product)=>product.id!==created.body.id).map((product)=>product.id)];
  await agent.put("/api/admin/product-order").set("x-csrf-token",csrf).send({scope:"category",categorySlug:"kids",orderedProductIds:reordered}).expect(204);
  publicData = await agent.get("/api/public/storefront").expect(200);
  assert.equal(publicData.body.products.find((product)=>product.id===created.body.id).categoryPositions.kids,1);
  await agent.post(`/api/admin/products/${created.body.id}/archive`).set("x-csrf-token",csrf).send({}).expect(200);
  assert.deepEqual(await metrics(), { total: 35, published: 34, draft: 0, visible: 34, variable: 34 });
  publicData = await agent.get("/api/public/storefront").expect(200);
  assert.equal(publicData.body.products.some((product)=>product.id===created.body.id),false);
  const adminData = await agent.get("/api/admin/products").expect(200);
  assert.equal(adminData.body.products.find((product)=>product.id===created.body.id).status,"archived");
  const audit=await system.db.query("SELECT action FROM admin_audit_log WHERE entity_id=$1 ORDER BY created_at",[created.body.id]);
  assert.deepEqual(audit.rows.map((row)=>row.action),["create","update","update","update","archive"]);
  await agent.post(`/api/admin/products/${created.body.id}/restore`).set("x-csrf-token",csrf).send({}).expect(200);
  const restored = await agent.get("/api/admin/products").expect(200);
  assert.equal(restored.body.products.find((product)=>product.id===created.body.id).status,"hidden");
});

test("draft editor fields persist privately and publish only after owner confirmation", async (t) => {
  const system = await setupTestSystem(); t.after(async()=>{await system.db.end();await system.cleanup()});
  const { agent, csrf } = await authenticated(system);
  const payload = {
    slug: "owner-editor-draft", originalName: "اسم أصلي", displayName: "فستان تجريبي",
    description: "الوصف الأصلي", shortDescription: "وصف مختصر", descriptionHtml: '<h2>تفاصيل</h2><p style="text-align: right">نص</p><img src=x onerror=alert(1)><script>alert(1)</script>',
    priceMad: 150, comparisonPriceMad: 180, costPriceMad: 70, tags: ["أطفال"],
    brandName: "MELYNE", modelName: "M1", supplierName: "مورد داخلي",
    badgeText: "جديد", badgeColor: "#386549", seoTitle: "عنوان البحث", metaDescription: "وصف البحث",
    weightKg: 0.25, widthCm: 12, heightCm: 20, depthCm: 3,
    availability: "available", status: "draft", categorySlugs: ["kids"], options: [], variants: [], featured: false,
  };
  const created = await agent.post("/api/admin/products").set("x-csrf-token", csrf).send(payload).expect(201);
  const id = created.body.id;
  let admin = (await agent.get("/api/admin/products").expect(200)).body.products.find((item) => item.id === id);
  assert.equal(admin.status, "draft");
  assert.equal(admin.costPriceMad, 70);
  assert.equal(admin.supplierName, "مورد داخلي");
  assert.equal(admin.seoTitle, "عنوان البحث");
  assert.equal(admin.descriptionHtml.includes("<script"), false);
  assert.equal((await agent.get("/api/public/storefront").expect(200)).body.products.some((item) => item.id === id), false);
  await agent.put(`/api/admin/products/${id}`).set("x-csrf-token", csrf).send({ ...payload, status: "published" }).expect(200);
  const published = (await agent.get("/api/public/storefront").expect(200)).body.products.find((item) => item.id === id);
  assert.equal(published.shortDescription, "وصف مختصر");
  assert.equal(published.badgeText, "جديد");
  assert.equal(published.costPriceMad, undefined);
  assert.equal(published.supplierName, undefined);
  assert.equal(JSON.stringify(published).includes("مورد داخلي"), false);
  admin = (await agent.get("/api/admin/products").expect(200)).body.products.find((item) => item.id === id);
  assert.equal(admin.weightKg, 0.25);
  assert.equal(admin.tags[0], "أطفال");
});

test("banner publishing, ordering and archival are reflected publicly", async (t) => {
  const system = await setupTestSystem(); t.after(async()=>{await system.db.end();await system.cleanup()}); const { agent, csrf } = await authenticated(system);
  const banner = {headingAr:"تشكيلة جديدة",supportingTextAr:"اختيارات موسمية",buttonLabelAr:"تسوق",destinationUrl:"/shop",desktopImageUrl:"/images/reference/hero-family-web.jpg",mobileImageUrl:null,imageAltAr:"أزياء MELYNE",status:"published",activeFrom:null,activeUntil:null};
  const created = await agent.post("/api/admin/banners").set("x-csrf-token",csrf).send(banner).expect(201);
  let publicData=await agent.get("/api/public/storefront").expect(200); assert.equal(publicData.body.banners.find((item)=>item.id===created.body.id).headingAr,"تشكيلة جديدة");
  await agent.put(`/api/admin/banners/${created.body.id}`).set("x-csrf-token",csrf).send({...banner,headingAr:"عنوان معدل"}).expect(200);
  publicData=await agent.get("/api/public/storefront").expect(200); assert.equal(publicData.body.banners.find((item)=>item.id===created.body.id).headingAr,"عنوان معدل");
  await agent.put(`/api/admin/banners/${created.body.id}`).set("x-csrf-token",csrf).send({...banner,headingAr:"عنوان معدل",status:"draft"}).expect(200);
  publicData=await agent.get("/api/public/storefront").expect(200); assert.equal(publicData.body.banners.some((item)=>item.id===created.body.id),false);
  await agent.put(`/api/admin/banners/${created.body.id}`).set("x-csrf-token",csrf).send({...banner,headingAr:"عنوان معدل",status:"published"}).expect(200);
  await agent.delete(`/api/admin/banners/${created.body.id}`).set("x-csrf-token",csrf).expect(204);
  publicData=await agent.get("/api/public/storefront").expect(200); assert.equal(publicData.body.banners.some((item)=>item.id===created.body.id),false);
});

test("COD submission revalidates server price and availability and keeps customer data private", async (t) => {
  const system = await setupTestSystem(); t.after(async()=>{await system.db.end();await system.cleanup()});
  const catalogResponse=await request(system.app).get("/api/public/storefront").expect(200);
  assert.equal(catalogResponse.headers["cache-control"],"no-store");
  const catalog=catalogResponse.body;
  const product=catalog.products.find((entry)=>entry.variants.some((variant)=>variant.availability==="available" && variant.stockQuantity>=2)); const variant=product.variants.find((entry)=>entry.availability==="available" && entry.stockQuantity>=2);
  const created=await request(system.app).post("/api/orders").set("idempotency-key",crypto.randomUUID()).send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},note:"",items:[{productId:product.id,variantId:variant.id,quantity:2}]}).expect(201);
  assert.equal(created.body.totalMad,variant.price.current*2);
  await request(system.app).post("/api/orders").set("idempotency-key",crypto.randomUUID()).send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},items:[{productId:product.id,quantity:1}]}).expect(409);
  const publicAgain=await request(system.app).get("/api/public/storefront").expect(200); assert.equal(JSON.stringify(publicAgain.body).includes("0600000000"),false);
  const {agent}=await authenticated(system); const orders=await agent.get("/api/admin/orders").expect(200); assert.equal(orders.body.orders[0].customer.phone,"0600000000");
  assert.equal(orders.body.summary.total,1); assert.equal(orders.body.summary.accepted,1); assert.equal(orders.body.summary.open,1);
  assert.equal(orders.body.summary.acceptedTotalMad,created.body.totalMad);
  await system.db.query("UPDATE product_variants SET available=false WHERE id=$1",[variant.id]);
  await request(system.app).post("/api/orders").set("idempotency-key",crypto.randomUUID()).send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},items:[{productId:product.id,variantId:variant.id,quantity:1}]}).expect(409);
});

test("COD checkout commits an outbox event without a synchronous webhook call", async (t) => {
  const calls=[];const secret="sheet-test-secret";
  const system=await setupTestSystem({configOverrides:{sheetSyncEnabled:true,googleSheetsWebhookUrl:"https://sheets.example.test/orders",googleSheetsWebhookSecret:secret},fetchImpl:async(url,options)=>{calls.push({url,options});throw new Error('Checkout must never send');}});
  t.after(async()=>{await system.db.end();await system.cleanup()});
  const catalog=(await request(system.app).get("/api/public/storefront").expect(200)).body;const product=catalog.products.find((entry)=>entry.variants.some((variant)=>variant.availability==="available" && variant.stockQuantity>=1));const variant=product.variants.find((entry)=>entry.availability==="available" && entry.stockQuantity>=1);
  const created=await request(system.app).post("/api/orders").set("idempotency-key",crypto.randomUUID()).send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},items:[{productId:product.id,variantId:variant.id,quantity:1}]}).expect(201);
  assert.equal(created.body.sheetSyncStatus,"pending");assert.equal(calls.length,0);
  const event=(await system.db.query('SELECT * FROM order_sheet_outbox WHERE order_id=$1',[created.body.id])).rows[0];
  assert.equal(event.state,'pending');assert.equal(event.payload.order.id,created.body.id);
  const row=await system.db.query("SELECT sheet_sync_status,sheet_synced_at FROM orders WHERE id=$1",[created.body.id]);assert.equal(row.rows[0].sheet_sync_status,"pending");assert.equal(row.rows[0].sheet_synced_at,null);
});

test("persistent upload root is separate from deployment output and survives a simulated redeploy", async (t) => {
  const system=await setupTestSystem(); t.after(async()=>{await system.db.end();await system.cleanup()});
  assert.equal(path.resolve(system.config.uploadRoot).startsWith(path.resolve("dist")),false);
  await fs.mkdir(system.config.uploadRoot,{recursive:true}); const sentinel=path.join(system.config.uploadRoot,"owner-upload.webp"); await fs.writeFile(sentinel,"persistent-upload");
  const deploy=path.join(system.tempRoot,"deployment"); await fs.mkdir(deploy); await fs.writeFile(path.join(deploy,"index.html"),"v1"); await fs.rm(deploy,{recursive:true}); await fs.mkdir(deploy); await fs.writeFile(path.join(deploy,"index.html"),"v2");
  assert.equal(await fs.readFile(sentinel,"utf8"),"persistent-upload");
});

test("owner can upload, preview, replace and reorder product images without breaking stable IDs", async(t)=>{
  const system=await setupTestSystem();t.after(async()=>{await system.db.end();await system.cleanup()});const {agent,csrf}=await authenticated(system);
  let admin=(await agent.get("/api/admin/products").expect(200)).body;const product=admin.products[0];const original=product.images[0];const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0]);
  const replaced=await agent.put(`/api/admin/products/${product.id}/images/${original.id}`).set("x-csrf-token",csrf).field("altText","صورة بديلة").attach("image",png,{filename:"replacement.png",contentType:"image/png"}).expect(200);
  assert.equal(replaced.body.id,original.id);assert.match(replaced.body.publicUrl,/^\/media\//);
  await request(system.app).get(replaced.body.publicUrl).expect(200);
  const restartedApp=await createApp({db:system.db,config:system.config});
  await request(restartedApp).get(replaced.body.publicUrl).expect(200);
  const added=await agent.post(`/api/admin/products/${product.id}/images`).set("x-csrf-token",csrf).field("altText","صورة إضافية").attach("image",png,{filename:"additional.png",contentType:"image/png"}).expect(201);
  const colorOption=product.options.find((option)=>/color|colour|لون/i.test(String(option.key||option.name||"")));
  const colorLabel=colorOption.values[0].label;
  await agent.put(`/api/admin/products/${product.id}/images/${added.body.id}/color`).set("x-csrf-token",csrf).send({colorLabel}).expect(200);
  await agent.put(`/api/admin/products/${product.id}/images/${added.body.id}/color`).set("x-csrf-token",csrf).send({colorLabel:"not-a-product-color"}).expect(400);
  const linkedImage=product.images.find((image)=>product.variants.some((variant)=>variant.imageId===image.id));
  const linkedColor=product.variants.find((variant)=>variant.imageId===linkedImage.id).selections.find((selection)=>selection.option===colorOption.name).value;
  const otherColor=colorOption.values.find((value)=>value.label!==linkedColor).label;
  await agent.put(`/api/admin/products/${product.id}/images/${linkedImage.id}/color`).set("x-csrf-token",csrf).send({colorLabel:otherColor}).expect(409);
  admin=(await agent.get("/api/admin/products").expect(200)).body;const updated=admin.products.find((item)=>item.id===product.id);const ordered=[added.body.id,...updated.images.filter((item)=>item.id!==added.body.id).map((item)=>item.id)];
  await agent.put(`/api/admin/products/${product.id}/image-order`).set("x-csrf-token",csrf).send({orderedImageIds:ordered}).expect(204);
  const publicData=(await agent.get("/api/public/storefront").expect(200)).body;const publicProduct=publicData.products.find((item)=>item.id===product.id);assert.equal(publicProduct.images[0].id,added.body.id);assert.equal(publicProduct.images[0].colorLabel,colorLabel);assert.ok(publicProduct.variants.every((variant)=>!variant.imageId||publicProduct.images.some((image)=>image.id===variant.imageId)));
  const backup=await createUploadBackup(system.config);assert.ok(backup.manifest.fileCount>=2);assert.equal(backup.manifest.files.every((file)=>/^[a-f0-9]{64}$/.test(file.sha256)),true);
  await agent.delete(`/api/admin/products/${product.id}/images/${added.body.id}`).set("x-csrf-token",csrf).expect(204);
  const afterArchive=(await agent.get("/api/admin/products").expect(200)).body.products.find((item)=>item.id===product.id);
  assert.equal(afterArchive.images.some((image)=>image.id===added.body.id),false);
  await agent.put(`/api/admin/products/${product.id}/image-order`).set("x-csrf-token",csrf).send({orderedImageIds:afterArchive.images.map((image)=>image.id)}).expect(204);
  await agent.delete(`/api/admin/products/${product.id}/images/${linkedImage.id}`).set("x-csrf-token",csrf).expect(409);
});

