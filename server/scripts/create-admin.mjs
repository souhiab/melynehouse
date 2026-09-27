import crypto from "node:crypto";
import { loadConfig } from "../config.mjs";
import { createDatabase } from "../db.mjs";
import { hashPassword } from "../security.mjs";

const config=loadConfig(); const email=process.env.MELYNE_ADMIN_EMAIL; const password=process.env.MELYNE_ADMIN_PASSWORD;
if(!email||!password) throw new Error("Set MELYNE_ADMIN_EMAIL and MELYNE_ADMIN_PASSWORD in the process environment");
const db=createDatabase(config.databaseUrl);
try { const passwordHash=await hashPassword(password); await db.query(`INSERT INTO admin_users(id,email,password_hash) VALUES($1,lower($2),$3) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,disabled_at=NULL,updated_at=now()`,[crypto.randomUUID(),email,passwordHash]); console.log("Owner account created or updated without storing plaintext credentials"); } finally { await db.end(); }

