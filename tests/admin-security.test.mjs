import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { setupTestSystem, csrfFrom } from "./admin-test-helpers.mjs";

test("admin mutation endpoints require both an authenticated session and CSRF token", async (t)=>{
  const system=await setupTestSystem();t.after(async()=>{await system.db.end();await system.cleanup()});
  await request(system.app).post("/api/admin/products/x/archive").send({}).expect(401);
  const agent=request.agent(system.app); const login=await agent.post("/api/admin/session").send({email:system.email,password:system.password}).expect(200); const csrf=csrfFrom(login);
  await agent.post("/api/admin/products/x/archive").send({}).expect(403);
  await agent.post("/api/admin/products/x/archive").set("x-csrf-token",csrf).set("origin","http://evil.example").send({}).expect(403);
  const response=await agent.get("/api/admin/products").expect(200); assert.equal(response.body.products.length,34);
});

test("unsafe banner destinations are rejected", async(t)=>{
  const system=await setupTestSystem();t.after(async()=>{await system.db.end();await system.cleanup()});const agent=request.agent(system.app);const login=await agent.post("/api/admin/session").send({email:system.email,password:system.password}).expect(200);const csrf=csrfFrom(login);
  await agent.post("/api/admin/banners").set("x-csrf-token",csrf).send({headingAr:"عنوان",supportingTextAr:null,buttonLabelAr:"زر",destinationUrl:"javascript:alert(1)",desktopImageUrl:"/hero.jpg",mobileImageUrl:null,imageAltAr:"بديل",status:"published",activeFrom:null,activeUntil:null}).expect(400);
});

