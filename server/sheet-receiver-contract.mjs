import crypto from 'node:crypto';
import { z } from 'zod';
import {signSheetBody,validSheetSignature} from './sheet-sync.mjs';
import {verifiedReceipt} from './sheet-event.mjs';

const selection=z.object({option:z.string(),optionKey:z.string().nullable().optional(),value:z.string()});
const eventSchema=z.object({eventId:z.uuid(),eventType:z.literal('melyne.cod_order.created'),schemaVersion:z.literal(1),
  order:z.object({id:z.uuid(),orderNumber:z.string().min(1),createdAt:z.iso.datetime(),status:z.literal('new'),source:z.literal('website'),currency:z.literal('MAD'),
    customer:z.object({name:z.string(),phone:z.string(),city:z.string(),address:z.string()}).strict(),note:z.string().nullable(),
    subtotalMad:z.number().nonnegative(),totalMad:z.number().nonnegative(),
    items:z.array(z.object({id:z.uuid(),quantity:z.number().int().positive(),unitPriceMad:z.number().nonnegative(),
      productSnapshot:z.object({id:z.string(),originalName:z.string(),displayName:z.string(),sku:z.string().nullable()}).strict(),
      variantSnapshot:z.object({id:z.string(),name:z.string(),selections:z.array(selection)}).strict()}).strict()).min(1)
  }).strict()}).strict();

// Framework-independent contract. persistCreation MUST atomically deduplicate event/order IDs,
// persist the mapped destination rows, and return a durable receipt after verification.
// This project does not provide a production Google persistence adapter yet.
export function createSheetReceiver({secret,persistCreation}) {
  if(!secret||typeof persistCreation!=='function')throw new Error('Receiver secret and persistence adapter required');
  return async function receive(raw,signature){
    if(typeof raw!=='string'||Buffer.byteLength(raw)>1024*1024)return {status:413,body:'{"error":"BODY_LIMIT"}',headers:{}};
    if(!validSheetSignature(secret,raw,signature))return {status:401,body:'{"error":"INVALID_SIGNATURE"}',headers:{}};
    let event;try{event=eventSchema.parse(JSON.parse(raw));}catch{return {status:400,body:'{"error":"INVALID_EVENT"}',headers:{}};}
    try{
      const hash=crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
      const value=await persistCreation(event,hash);
      const receipt=verifiedReceipt(value,event);
      if(!receipt)throw new Error('Invalid adapter receipt');
      const body=JSON.stringify(receipt);
      return {status:200,body,headers:{'content-type':'application/json','x-melyne-receipt-signature':signSheetBody(secret,body)}};
    }catch(error){return {status:error.code==='EVENT_CONFLICT'?409:503,body:JSON.stringify({error:error.code==='EVENT_CONFLICT'?'EVENT_CONFLICT':'PERSISTENCE_UNAVAILABLE'}),headers:{}};}
  };
}
