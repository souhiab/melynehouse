import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import { newDb } from "pg-mem";
import { createApp } from "../server/app.mjs";
import { importCatalog } from "../server/import-catalog.mjs";
import { hashPassword } from "../server/security.mjs";
import { applyMigrations } from "../tests/admin-test-helpers.mjs";

if (!process.env.QA_ADMIN_PASSWORD) throw new Error("QA_ADMIN_PASSWORD is required for the isolated preview");
const memory=newDb({autoCreateForeignKeyIndices:true}); const adapter=memory.adapters.createPg(); const db=new adapter.Pool();
await applyMigrations(db, { emulated: true });
await importCatalog(db,path.resolve("data/products.json"));
await db.query("INSERT INTO admin_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)",[crypto.randomUUID(),process.env.QA_ADMIN_EMAIL||"owner@qa.local",await hashPassword(process.env.QA_ADMIN_PASSWORD),"QA owner"]);
const config={uploadRoot:path.resolve("var/qa-uploads"),backupRoot:path.resolve("var/qa-backups"),publicBaseUrl:"http://127.0.0.1:8790",allowedOrigins:["http://127.0.0.1:8790"],production:false,sessionSecret:"isolated-qa-session-secret-not-for-staging",googleSheetsWebhookUrl:null};
const app=await createApp({db,config}); app.use(express.static(path.resolve("dist/client"))); app.get("/*splat",(req,res)=>res.sendFile(path.resolve("dist/client/index.html")));
const server=app.listen(8790,"127.0.0.1",()=>console.log("Isolated MELYNE QA preview: http://127.0.0.1:8790"));
for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,async()=>{server.close();await db.end()});
