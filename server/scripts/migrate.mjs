import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.mjs";
import { createDatabase } from "../db.mjs";

const config=loadConfig(); const db=createDatabase(config.databaseUrl);
try {
  const sqlDirectory=path.resolve(import.meta.dirname,"..","sql");
  const files=(await fs.readdir(sqlDirectory)).filter((name)=>/^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const sql=await fs.readFile(path.join(sqlDirectory,file),"utf8");
    await db.query(sql);
    console.log(`Applied PostgreSQL migration ${file}`);
  }
} finally { await db.end(); }

