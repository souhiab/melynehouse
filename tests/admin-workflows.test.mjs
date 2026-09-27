import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { setupTestSystem, csrfFrom } from "./admin-test-helpers.mjs";
import { createApp } from "../server/app.mjs";
import { createUploadBackup } from "../server/backup-uploads.mjs";

async function authenticated(system) {
  const agent = request.agent(system.app);
  const login = await agent.post("/api/admin/session").send({ email: system.email, password: system.password }).expect(200);
  return { agent, csrf: csrfFrom(login) };
}

test("authenticated owner can create, edit, reorder and recoverably archive a product", async (t) => {
  const system = await setupTestSystem(); t.after(async()=>{await system.db.end();await system.cleanup()}); const { agent, csrf } = await authenticated(system);
  const payload = { sku:"TEST-1",slug:"test-owner-product",originalName:"منتج اختباري",displayName:"منتج اختباري",description:"وصف",descriptionHtml:null,priceMad:199,comparisonPriceMad:249,availability:"available",status:"published",categorySlugs:["kids"],options:[],variants:[],featured:false };
  const created = await agent.post("/api/admin/products").set("x-csrf-token",csrf).send(payload).expect(201);
  await agent.put(`/api/admin/products/${created.body.id}`).set("x-csrf-token",csrf).send({...payload,displayName:"منتج معدل",priceMad:189}).expect(200);
  let publicData = await agent.get("/api/public/storefront").expect(200);
  assert.equal(publicData.body.products.find((product)=>product.id===created.body.id).displayName,"منتج معدل");
  await agent.put(`/api/admin/products/${created.body.id}`).set("x-csrf-token",csrf).send({...payload,displayName:"منتج معدل",priceMad:189,status:"hidden"}).expect(200);
  publicData=await agent.get("/api/public/storefront").expect(200);assert.equal(publicData.body.products.some((product)=>product.id===created.body.id),false);
  await agent.put(`/api/admin/products/${created.body.id}`).set("x-csrf-token",csrf).send({...payload,displayName:"منتج معدل",priceMad:189,status:"published"}).expect(200);
  const kids = publicData.body.products.filter((product)=>product.categories.some((category)=>category.slug==="kids"));
  const reordered = [created.body.id,...kids.filter((product)=>product.id!==created.body.id).map((product)=>product.id)];
  await agent.put("/api/admin/product-order").set("x-csrf-token",csrf).send({scope:"category",categorySlug:"kids",orderedProductIds:reordered}).expect(204);
  publicData = await agent.get("/api/public/storefront").expect(200);
  assert.equal(publicData.body.products.find((product)=>product.id===created.body.id).categoryPositions.kids,1);
  await agent.post(`/api/admin/products/${created.body.id}/archive`).set("x-csrf-token",csrf).send({}).expect(200);
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
  const catalog=(await request(system.app).get("/api/public/storefront").expect(200)).body;
  const product=catalog.products.find((entry)=>entry.variants.some((variant)=>variant.availability==="available")); const variant=product.variants.find((entry)=>entry.availability==="available");
  const created=await request(system.app).post("/api/orders").send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},note:"",items:[{productId:product.id,variantId:variant.id,quantity:2}]}).expect(201);
  assert.equal(created.body.totalMad,variant.price.current*2);
  await request(system.app).post("/api/orders").send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},items:[{productId:product.id,quantity:1}]}).expect(409);
  const publicAgain=await request(system.app).get("/api/public/storefront").expect(200); assert.equal(JSON.stringify(publicAgain.body).includes("0600000000"),false);
  const {agent}=await authenticated(system); const orders=await agent.get("/api/admin/orders").expect(200); assert.equal(orders.body.orders[0].customer.phone,"0600000000");
  await system.db.query("UPDATE product_variants SET available=false WHERE id=$1",[variant.id]);
  await request(system.app).post("/api/orders").send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},items:[{productId:product.id,variantId:variant.id,quantity:1}]}).expect(409);
});

test("COD order copy is signed server-side and records Google Sheet synchronization status", async (t) => {
  const calls=[];const secret="sheet-test-secret";
  const system=await setupTestSystem({configOverrides:{googleSheetsWebhookUrl:"https://sheets.example.test/orders",googleSheetsWebhookSecret:secret},fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200}}});
  t.after(async()=>{await system.db.end();await system.cleanup()});
  const catalog=(await request(system.app).get("/api/public/storefront").expect(200)).body;const product=catalog.products.find((entry)=>entry.variants.some((variant)=>variant.availability==="available"));const variant=product.variants.find((entry)=>entry.availability==="available");
  const created=await request(system.app).post("/api/orders").send({customer:{name:"عميلة اختبار",phone:"0600000000",city:"الرباط",address:"عنوان خاص"},items:[{productId:product.id,variantId:variant.id,quantity:1}]}).expect(201);
  assert.equal(created.body.sheetSyncStatus,"synced");assert.equal(calls.length,1);assert.equal(calls[0].url,"https://sheets.example.test/orders");
  const expected=`sha256=${crypto.createHmac("sha256",secret).update(calls[0].options.body).digest("hex")}`;assert.equal(calls[0].options.headers["x-melyne-signature"],expected);
  const row=await system.db.query("SELECT sheet_sync_status,sheet_synced_at FROM orders WHERE id=$1",[created.body.id]);assert.equal(row.rows[0].sheet_sync_status,"synced");assert.ok(row.rows[0].sheet_synced_at);
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
  admin=(await agent.get("/api/admin/products").expect(200)).body;const updated=admin.products.find((item)=>item.id===product.id);const ordered=[added.body.id,...updated.images.filter((item)=>item.id!==added.body.id).map((item)=>item.id)];
  await agent.put(`/api/admin/products/${product.id}/image-order`).set("x-csrf-token",csrf).send({orderedImageIds:ordered}).expect(204);
  const publicData=(await agent.get("/api/public/storefront").expect(200)).body;const publicProduct=publicData.products.find((item)=>item.id===product.id);assert.equal(publicProduct.images[0].id,added.body.id);assert.ok(publicProduct.variants.every((variant)=>!variant.imageId||publicProduct.images.some((image)=>image.id===variant.imageId)));
  const backup=await createUploadBackup(system.config);assert.ok(backup.manifest.fileCount>=2);assert.equal(backup.manifest.files.every((file)=>/^[a-f0-9]{64}$/.test(file.sha256)),true);
});

