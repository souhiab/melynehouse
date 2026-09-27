import path from "node:path";
import { loadConfig } from "../config.mjs";
import { createDatabase } from "../db.mjs";
import { importCatalog } from "../import-catalog.mjs";

const config=loadConfig(); const db=createDatabase(config.databaseUrl);
try { const result=await importCatalog(db,path.resolve(config.projectRoot,"data","products.json"),{allowUpdate:process.argv.includes("--update")}); console.log(JSON.stringify(result,null,2)); } finally { await db.end(); }

