import {loadConfig} from '../config.mjs';
import {createDatabase} from '../db.mjs';
import {processNextSheetEvent} from '../sheet-outbox.mjs';
import {sheetDeliveryEnabled} from '../sheet-sync.mjs';
import {pathToFileURL} from 'node:url';

export async function runWorker(){
  const config=loadConfig();
  if(!sheetDeliveryEnabled(config)){console.log('Sheet worker disabled; no delivery attempted');return;}
  const db=createDatabase(config.databaseUrl);
  let stop=false;
  const shutdown=()=>{stop=true;};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  try{
    do{
      const result=await processNextSheetEvent(db,config);
      console.log(JSON.stringify(result)); // Event ID/state only; no customer content.
      if(process.argv.includes('--once'))break;
      if(result.state==='idle')await new Promise(resolve=>setTimeout(resolve,1000));
    }while(!stop);
  }catch{console.error('Sheet worker stopped; inspect protected event diagnostics and database availability');process.exitCode=1;}
  finally{process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);await db.end();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runWorker();
