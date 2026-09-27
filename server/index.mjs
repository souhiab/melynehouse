import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { createDatabase } from "./db.mjs";

const config=loadConfig();
const db=createDatabase(config.databaseUrl);
const app=await createApp({db,config});
const server=app.listen(config.port,"127.0.0.1",()=>console.log(`MELYNE API listening on http://127.0.0.1:${config.port}`));
const shutdown=async()=>{ server.close(); await db.end(); };
process.on("SIGINT",shutdown); process.on("SIGTERM",shutdown);

