import crypto from 'node:crypto';
import {transaction} from './db.mjs';
import {deliverSheetEvent,retryDelay,sheetDeliveryEnabled,validateSheetEndpoint} from './sheet-sync.mjs';

const LEASE_SECONDS=60; // Longer than the 8-second transport timeout.
export async function claimSheetEvent(db) {
  return transaction(db,async client=>{
    const expired=await client.query(`UPDATE order_sheet_outbox SET state=CASE WHEN attempt_count >= attempt_limit THEN 'failed' ELSE 'pending' END,
      lease_token=NULL,lease_until=NULL,last_error='LEASE_EXPIRED',next_attempt_at=now(),updated_at=now()
      WHERE id IN (SELECT id FROM order_sheet_outbox WHERE state='processing' AND lease_until<=now()
        ORDER BY lease_until,id LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id,order_id,state,attempt_count`);
    for(const row of expired.rows){
      await client.query("UPDATE order_sheet_attempts SET outcome='lease_expired',finished_at=now(),error_code='LEASE_EXPIRED' WHERE event_id=$1 AND attempt_number=$2 AND outcome='processing'",[row.id,row.attempt_count]);
      await client.query('UPDATE orders SET sheet_sync_status=$1,sheet_sync_error=$2 WHERE id=$3',
        [row.state==='failed'?'failed':'pending','LEASE_EXPIRED',row.order_id]);
    }
    const token=crypto.randomUUID();
    const claimed=await client.query(`UPDATE order_sheet_outbox SET state='processing',attempt_count=attempt_count+1,
      lease_token=$1,lease_until=now()+($2 * INTERVAL '1 second'),updated_at=now()
      WHERE id=(SELECT id FROM order_sheet_outbox WHERE state='pending' AND next_attempt_at<=now()
      ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,[token,LEASE_SECONDS]);
    const event=claimed.rows[0];if(!event)return null;
    await client.query('INSERT INTO order_sheet_attempts(event_id,attempt_number,lease_token) VALUES($1,$2,$3)',[event.id,event.attempt_count,token]);
    await client.query("UPDATE orders SET sheet_sync_status='pending',sheet_sync_error=NULL WHERE id=$1",[event.order_id]);
    return event;
  });
}
export async function finishSheetAttempt(db,event,result) {
  return transaction(db,async client=>{
    const owned=await client.query("SELECT id FROM order_sheet_outbox WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_until>now() FOR UPDATE",[event.id,event.lease_token]);
    if(!owned.rowCount)return {state:'lease_lost'};
    const retry=!result.ok && result.retryable && event.attempt_count<event.attempt_limit;
    const state=result.ok?'delivered':retry?'pending':'failed';
    const delay=retry?retryDelay(event.attempt_count,result.retryAfter):0;
    await client.query(`UPDATE order_sheet_outbox SET state=$1,lease_token=NULL,lease_until=NULL,last_error=$2,
      next_attempt_at=now()+($3 * INTERVAL '1 second'),delivery_receipt=$4,delivered_at=$5,updated_at=now() WHERE id=$6`,
    [state,result.ok?null:result.errorCode,delay,result.ok?JSON.stringify(result.receipt):null,result.ok?new Date():null,event.id]);
    await client.query(`UPDATE order_sheet_attempts SET outcome=$1,finished_at=now(),http_status=$2,error_code=$3
      WHERE event_id=$4 AND attempt_number=$5 AND lease_token=$6`,
    [result.ok?'delivered':retry?'retrying':'failed',result.httpStatus,result.ok?null:result.errorCode,event.id,event.attempt_count,event.lease_token]);
    await client.query('UPDATE orders SET sheet_sync_status=$1,sheet_sync_error=$2,sheet_synced_at=$3,updated_at=now() WHERE id=$4',
      [result.ok?'synced':retry?'pending':'failed',result.ok?null:result.errorCode,result.ok?new Date():null,event.order_id]);
    return {state};
  });
}
export async function processNextSheetEvent(db,config,fetchImpl=globalThis.fetch) {
  if(!sheetDeliveryEnabled(config))return {state:'disabled'};
  validateSheetEndpoint(config);
  const event=await claimSheetEvent(db);if(!event)return {state:'idle'};
  const result=await deliverSheetEvent(config,event.payload,fetchImpl);
  return {eventId:event.id,...await finishSheetAttempt(db,event,result)};
}
export async function retryFailedSheetEvent(db,config,orderId) {
  if(!sheetDeliveryEnabled(config))throw Object.assign(new Error('Sheet synchronization is disabled or not configured'),{status:409});
  validateSheetEndpoint(config);
  return transaction(db,async client=>{
    const result=await client.query('SELECT id,state FROM order_sheet_outbox WHERE order_id=$1 FOR UPDATE',[orderId]);
    if(!result.rowCount)throw Object.assign(new Error('No creation event exists; historical and manual orders are not queued'),{status:409});
    if(result.rows[0].state!=='failed')throw Object.assign(new Error('Only failed events can be retried'),{status:409});
    await client.query("UPDATE order_sheet_outbox SET state='pending',attempt_limit=attempt_count+8,next_attempt_at=now(),last_error=NULL,updated_at=now() WHERE id=$1",[result.rows[0].id]);
    await client.query("UPDATE orders SET sheet_sync_status='pending',sheet_sync_error=NULL WHERE id=$1",[orderId]);
    return {id:orderId,sheetSyncStatus:'pending'};
  });
}
export async function sheetEventStatus(db,config,orderId) {
  const row=(await db.query(`SELECT id,state,attempt_count,next_attempt_at,lease_until,last_error,delivery_receipt,delivered_at
    FROM order_sheet_outbox WHERE order_id=$1`,[orderId])).rows[0];
  if(!row)return {state:'disabled',reason:'no_creation_event',canRetry:false};
  const enabled=sheetDeliveryEnabled(config);
  return {...row,state:row.state==='delivered'?'delivered':!enabled?'disabled':row.state==='processing'||row.state==='pending'&&row.attempt_count>0?'retrying':row.state,
    queueState:row.state,configured:enabled,canRetry:enabled&&row.state==='failed'};
}
