import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.mjs";

const config=loadConfig(); await fs.mkdir(config.backupRoot,{recursive:true});
const stamp=new Date().toISOString().replaceAll(":","-").replace(".","-"); const destination=path.join(config.backupRoot,`melyne-${stamp}.dump`);
const databaseUrl=new URL(config.databaseUrl); const password=decodeURIComponent(databaseUrl.password); databaseUrl.password="";
const child=spawn("pg_dump",["--dbname",databaseUrl.toString(),"--format=custom","--no-owner","--file",destination],{stdio:["ignore","inherit","inherit"],env:{...process.env,PGPASSWORD:password}});
const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve)});
if(code!==0) throw new Error(`pg_dump failed with exit code ${code}`);
console.log(`Encrypted-disk database backup created at ${destination}. Protect this file because it contains private orders.`);

