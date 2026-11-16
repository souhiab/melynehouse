import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import request from 'supertest';
import {applyMigrations,csrfFrom} from './admin-test-helpers.mjs';
import {hashPassword} from '../server/security.mjs';
import {createApp} from '../server/app.mjs';
import {createOrder,changeOrderStatus} from '../server/order-service.mjs';
import {processNextSheetEvent,claimSheetEvent,finishSheetAttempt,retryFailedSheetEvent,sheetEventStatus} from '../server/sheet-outbox.mjs';
import {signSheetBody,retryDelay,deliverSheetEvent,validateSheetEndpoint} from '../server/sheet-sync.mjs';
import {createSheetReceiver} from '../server/sheet-receiver-contract.mjs';
import {mapSheetEvent} from '../server/sheet-mapping.mjs';
import {transaction} from '../server/db.mjs';

test('transactional outbox and mock receiver on real isolated PostgreSQL',{skip:!process.env.DATABASE_URL},async t=>{
  const base=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const server=(await base.query('SELECT inet_server_addr()::text host,current_database() name')).rows[0];
  assert.ok(['127.0.0.1/32','::1/128'].includes(server.host));assert.equal(server.name,'melyne_dev');
  const tables=['products','product_variants','product_images','orders','order_items','stock_movements','order_sheet_outbox'];
  const baseline=async()=>Promise.all(tables.map(async table=>(await base.query(`SELECT count(*)::int count,md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY id::text),'')) fingerprint FROM ${table} t`)).rows[0]));
  const before=await baseline();
  const schema=`sheet_foundation_${crypto.randomBytes(8).toString('hex')}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const db=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`,max:12});
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'melyne-outbox-'));
  t.after(async()=>{await db.end();await base.query(`DROP SCHEMA ${schema} CASCADE`);assert.deepEqual(await baseline(),before);await base.end();await fs.rm(directory,{recursive:true,force:true});});
  await applyMigrations(db);
  await db.query("INSERT INTO products(id,slug,sku,original_name,display_name,price_mad) VALUES('p','p','SKU-P','Original product','Product',100),('q','q',NULL,'Other product','Other',125)");
  for(const [id,p,price] of [['a','p',100],['b','p',110],['c','q',125]])await db.query("INSERT INTO product_variants(id,product_id,name,selections,price_mad,stock_quantity) VALUES($1,$2,$1,$3,$4,1000)",[id,p,JSON.stringify([{option:'Color',value:id==='a'?'Black':'Green'},{option:'Size',value:'M'}]),price]);
  const config={uploadRoot:path.join(directory,'uploads'),backupRoot:path.join(directory,'backups'),publicBaseUrl:'http://localhost',allowedOrigins:['http://localhost'],production:false,sessionSecret:'synthetic-outbox-test-session-only',googleSheetsWebhookUrl:'https://mock.example.test/orders',googleSheetsWebhookSecret:'synthetic-sheet-test-secret',sheetSyncEnabled:true,sheetSyncAllowedOrigin:'https://mock.example.test',orderRateLimit:1000};
  const input={customer:{name:'Synthetic customer',phone:'0600000000',city:'Rabat',address:'Synthetic address'},note:'',items:[{productId:'p',variantId:'a',quantity:1},{productId:'p',variantId:'b',quantity:2},{productId:'q',variantId:'c',quantity:1}]};
  let checkoutCalls=0;
  const app=await createApp({db,config,fetchImpl:async()=>{checkoutCalls++;throw new Error('Network must not occur in checkout');}});
  const submit=(key=crypto.randomUUID(),body=input)=>request(app).post('/api/orders').set('idempotency-key',key).send(body);
  const eventFor=async id=>(await db.query('SELECT * FROM order_sheet_outbox WHERE order_id=$1',[id])).rows[0];
  const fresh=async()=>{const order=await createOrder(db,config,input,crypto.randomUUID());return eventFor(order.id);};
  const count=async table=>Number((await db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n);
  const makeDue=async id=>db.query("UPDATE order_sheet_outbox SET next_attempt_at=now()-INTERVAL '1 second' WHERE id=$1",[id]);
  // Synthetic durable receiver storage only. No Google client or operational Sheet is used.
  await db.query('CREATE TABLE mock_sheet_orders(order_id uuid PRIMARY KEY,event_id uuid UNIQUE NOT NULL,payload_hash text NOT NULL,payload jsonb NOT NULL,receipt_id text NOT NULL,persisted_at timestamptz NOT NULL DEFAULT now())');
  const persist=async(event,hash)=>transaction(db,async client=>{
    const inserted=await client.query(`INSERT INTO mock_sheet_orders(order_id,event_id,payload_hash,payload,receipt_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING RETURNING *`,[event.order.id,event.eventId,hash,JSON.stringify(event),`mock:${event.eventId}`]);
    const row=inserted.rows[0]||(await client.query('SELECT * FROM mock_sheet_orders WHERE order_id=$1',[event.order.id])).rows[0];
    if(row.event_id!==event.eventId||row.payload_hash!==hash)throw Object.assign(new Error('Conflict'),{code:'EVENT_CONFLICT'});
    return {schemaVersion:1,eventId:event.eventId,orderId:event.order.id,result:inserted.rowCount?'persisted':'already_persisted',receiptId:row.receipt_id,persistedAt:new Date(row.persisted_at).toISOString()};
  });
  const receive=createSheetReceiver({secret:config.googleSheetsWebhookSecret,persistCreation:persist});
  const mockFetch=async(_url,options)=>{const r=await receive(options.body,options.headers['x-melyne-signature']);return new Response(r.body,{status:r.status,headers:r.headers});};
  const drain=async()=>{for(let i=0;i<100;i++){const r=await processNextSheetEvent(db,config,mockFetch);if(r.state==='idle')return;}throw new Error('Unexpected backlog');};
  let first;

  await t.test('checkout commits snapshots and one event; duplicate concurrent submission replays without network',async()=>{
    const key=crypto.randomUUID();const results=await Promise.all([submit(key),submit(key)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].body.id,results[1].body.id);
    first=await eventFor(results[0].body.id);assert.equal(await count('order_sheet_outbox'),1);assert.equal(checkoutCalls,0);
    assert.equal(results[0].body.sheetSyncStatus,'pending');
    assert.equal(first.payload.order.totalMad,445);assert.equal(first.payload.order.items.length,3);
    assert.equal(first.payload.order.source,'website');assert.equal(first.payload.order.status,'new');
    assert.equal(first.payload.order.items[0].productSnapshot.sku,'SKU-P');
    const itemIds=(await db.query('SELECT id FROM order_items WHERE order_id=$1',[first.order_id])).rows.map(r=>r.id).sort();
    assert.deepEqual(first.payload.order.items.map(item=>item.id).sort(),itemIds);
    const saved=(await db.query('SELECT created_at FROM orders WHERE id=$1',[first.order_id])).rows[0];
    assert.equal(first.payload.order.createdAt,new Date(saved.created_at).toISOString());
  });
  await t.test('outbox insert failure rolls back order, inventory, items and idempotency together',async()=>{
    const baseline=await Promise.all(['orders','order_items','stock_movements','order_requests','order_sheet_outbox'].map(count));
    const stock=(await db.query("SELECT stock_quantity FROM product_variants WHERE id='a'")).rows[0].stock_quantity;
    await db.query("CREATE FUNCTION fail_sheet_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic outbox rollback'; END $$");
    await db.query('CREATE TRIGGER fail_sheet_test BEFORE INSERT ON order_sheet_outbox FOR EACH ROW EXECUTE FUNCTION fail_sheet_test()');
    await assert.rejects(createOrder(db,config,input,crypto.randomUUID()),/Synthetic outbox rollback/);
    assert.deepEqual(await Promise.all(['orders','order_items','stock_movements','order_requests','order_sheet_outbox'].map(count)),baseline);
    assert.equal((await db.query("SELECT stock_quantity FROM product_variants WHERE id='a'")).rows[0].stock_quantity,stock);
    await db.query('DROP TRIGGER fail_sheet_test ON order_sheet_outbox');
  });
  await t.test('payload is immutable; later edits and cancellation cannot change the creation event',async()=>{
    await assert.rejects(db.query("UPDATE order_sheet_outbox SET payload='{}' WHERE id=$1",[first.id]),/immutable/);
    await db.query("UPDATE products SET original_name='Later name',sku='LATER' WHERE id='p'");
    await db.query("UPDATE product_variants SET price_mad=999 WHERE id='a'");
    await changeOrderStatus(db,first.order_id,'cancelled',null,'synthetic');
    const after=await eventFor(first.order_id);assert.deepEqual(after.payload,first.payload);
    assert.equal(after.payload.order.items[0].unitPriceMad,100);assert.equal(after.payload.order.items[0].productSnapshot.originalName,'Original product');
    assert.equal(await count('order_sheet_outbox'),1);
  });
  await t.test('signed acknowledgement delivers; arbitrary 200 and wrong signatures do not',async()=>{
    const result=await processNextSheetEvent(db,config,mockFetch);assert.equal(result.state,'delivered');
    assert.equal((await eventFor(first.order_id)).delivery_receipt.eventId,first.id);
    const bad=await fresh();
    const r=await processNextSheetEvent(db,config,async()=>new Response('{}',{status:200}));assert.equal(r.state,'failed');
    assert.equal((await eventFor(bad.order_id)).last_error,'INVALID_ACK_SIGNATURE');
    await assert.rejects(retryFailedSheetEvent(db,config,first.order_id),/Only failed/);
    const tampered={...first.payload,eventId:crypto.randomUUID()};
    const invalid=await deliverSheetEvent(config,tampered,async()=>new Response(JSON.stringify(first.delivery_receipt||{}),{status:200}));assert.equal(invalid.ok,false);
    const wrong=JSON.stringify({...((await eventFor(first.order_id)).delivery_receipt),eventId:crypto.randomUUID()});
    const mismatched=await deliverSheetEvent(config,first.payload,async()=>new Response(wrong,{status:200,headers:{'x-melyne-receipt-signature':signSheetBody(config.googleSheetsWebhookSecret,wrong)}}));
    assert.equal(mismatched.errorCode,'INVALID_ACK');
    await retryFailedSheetEvent(db,config,bad.order_id);await drain();
  });
  await t.test('receiver deduplicates concurrent deliveries and persists receipts across receiver recreation',async()=>{
    const newEvent=await fresh();const newRaw=JSON.stringify(newEvent.payload);const newSignature=signSheetBody(config.googleSheetsWebhookSecret,newRaw);
    const concurrent=await Promise.all([receive(newRaw,newSignature),receive(newRaw,newSignature)]);
    assert.deepEqual(concurrent.map(r=>JSON.parse(r.body).result).sort(),['already_persisted','persisted']);
    await drain();
    const n=await count('mock_sheet_orders');const raw=JSON.stringify(first.payload);const signature=signSheetBody(config.googleSheetsWebhookSecret,raw);
    const results=await Promise.all([receive(raw,signature),receive(raw,signature)]);
    assert.ok(results.every(r=>JSON.parse(r.body).result==='already_persisted'));assert.equal(await count('mock_sheet_orders'),n);
    const restarted=createSheetReceiver({secret:config.googleSheetsWebhookSecret,persistCreation:persist});
    assert.equal(JSON.parse((await restarted(raw,signature)).body).receiptId,JSON.parse(results[0].body).receiptId);
    const changed=JSON.stringify({...first.payload,order:{...first.payload.order,totalMad:100}});
    assert.equal((await restarted(changed,signSheetBody(config.googleSheetsWebhookSecret,changed))).status,409);
    assert.equal((await receive(raw,'sha256=invalid')).status,401);
  });
  await t.test('concurrent claims send different events and stale leases cannot complete',async()=>{
    await drain();const a=await fresh();const b=await fresh();
    const [x,y]=await Promise.all([claimSheetEvent(db),claimSheetEvent(db)]);
    assert.deepEqual([x.id,y.id].sort(),[a.id,b.id].sort());assert.notEqual(x.lease_token,y.lease_token);
    assert.equal(await claimSheetEvent(db),null);
    await db.query("UPDATE order_sheet_outbox SET lease_until=now()-INTERVAL '1 second' WHERE id=$1",[x.id]);
    const recovered=await claimSheetEvent(db);assert.equal(recovered.id,x.id);assert.notEqual(recovered.lease_token,x.lease_token);
    assert.equal((await finishSheetAttempt(db,x,{ok:false,errorCode:'OLD',retryable:false})).state,'lease_lost');
    for(const event of [recovered,y])await finishSheetAttempt(db,event,await deliverSheetEvent(config,event.payload,mockFetch));
    assert.equal((await db.query("SELECT outcome FROM order_sheet_attempts WHERE event_id=$1 AND attempt_number=1",[x.id])).rows[0].outcome,'lease_expired');
  });
  await t.test('outage backoff does not block newer orders; 429 honors Retry-After',async()=>{
    const old=await fresh();
    assert.equal((await processNextSheetEvent(db,config,async()=>new Response('',{status:503}))).state,'pending');
    let row=await eventFor(old.order_id);assert.ok(new Date(row.next_attempt_at)-Date.now()>25000);
    const newer=await fresh();assert.equal((await processNextSheetEvent(db,config,mockFetch)).eventId,newer.id);
    await makeDue(old.id);
    await processNextSheetEvent(db,config,async()=>new Response('',{status:429,headers:{'retry-after':'120'}}));
    row=await eventFor(old.order_id);assert.ok(new Date(row.next_attempt_at)-Date.now()>115000);
    assert.equal(retryDelay(100,'999999'),86400);
    assert.ok(retryDelay(1,new Date(Date.now()+180000).toUTCString())>=178);
    await makeDue(old.id);await drain();
  });
  await t.test('401/403 fail safely, network timeout retries, manual retry keeps payload and history',async()=>{
    for(const status of [401,403,500,503]){
      const event=await fresh();const r=await processNextSheetEvent(db,config,async()=>new Response('',{status}));
      assert.equal(r.state,status<500?'failed':'pending');
      const row=await eventFor(event.order_id);assert.equal(row.last_error,`HTTP_${status}`);
      if(status<500)await retryFailedSheetEvent(db,config,event.order_id);else await makeDue(event.id);
      await drain();
      assert.deepEqual((await eventFor(event.order_id)).payload,event.payload);
    }
    const timed=await fresh();await processNextSheetEvent(db,config,async()=>{throw new DOMException('sensitive remote URL','TimeoutError');});
    assert.equal((await eventFor(timed.order_id)).last_error,'NETWORK_OR_TIMEOUT');await makeDue(timed.id);await drain();
  });
  await t.test('lost acknowledgement retries the same event without a second receiver row',async()=>{
    const event=await fresh();const n=await count('mock_sheet_orders');
    await processNextSheetEvent(db,config,async(url,options)=>{await mockFetch(url,options);throw new Error('Synthetic lost acknowledgement');});
    assert.equal(await count('mock_sheet_orders'),n+1);await makeDue(event.id);
    await processNextSheetEvent(db,config,mockFetch);const delivered=await eventFor(event.order_id);
    assert.equal(delivered.state,'delivered');assert.equal(delivered.delivery_receipt.result,'already_persisted');
    assert.equal(await count('mock_sheet_orders'),n+1);
    await assert.rejects(db.query('DELETE FROM order_sheet_outbox WHERE id=$1',[event.id]),/retained/);
  });
  await t.test('bounded attempts terminate, authorized retry grants a new budget without a new event',async()=>{
    const event=await fresh();await db.query('UPDATE order_sheet_outbox SET attempt_limit=1 WHERE id=$1',[event.id]);
    assert.equal((await processNextSheetEvent(db,config,async()=>new Response('',{status:503}))).state,'failed');
    const admin=crypto.randomUUID();await db.query('INSERT INTO admin_users(id,email,password_hash) VALUES($1,$2,$3)',[admin,'outbox@example.test',await hashPassword('synthetic-test-password')]);
    const owner=request.agent(app);const login=await owner.post('/api/admin/session').send({email:'outbox@example.test',password:'synthetic-test-password'}).expect(200);const csrf=csrfFrom(login);
    const url=`/api/admin/orders/${event.order_id}/retry-sheet-sync`;
    await request(app).post(url).expect(401);await owner.post(url).expect(403);
    const detail=(await owner.get(`/api/admin/orders/${event.order_id}`).expect(200)).body;assert.equal(detail.sheetSync.canRetry,true);
    await owner.post(url).set('x-csrf-token',csrf).expect(200);await owner.post(url).set('x-csrf-token',csrf).expect(409);
    await drain();assert.equal((await eventFor(event.order_id)).attempt_count,2);
    await owner.post(url).set('x-csrf-token',csrf).expect(409);
    assert.equal((await sheetEventStatus(db,config,event.order_id)).state,'delivered');
  });
  await t.test('disabled worker leaves new events untouched; manual orders do not enqueue',async()=>{
    const n=await count('order_sheet_outbox');const disabled={...config,sheetSyncEnabled:false};
    const order=await createOrder(db,disabled,input,crypto.randomUUID());assert.equal(order.sheetSyncStatus,'disabled');
    assert.equal((await processNextSheetEvent(db,disabled,()=>{throw new Error('No send');})).state,'disabled');
    assert.equal((await eventFor(order.id)).attempt_count,0);
    const manual=await createOrder(db,config,input,crypto.randomUUID(),'whatsapp',{manual:true});
    assert.equal(manual.sheetSyncStatus,'disabled');assert.equal(await eventFor(manual.id),undefined);assert.equal(await count('order_sheet_outbox'),n+1);
    await drain();
  });
  await t.test('configurable mapping preserves all items and literal formula-like customer text',async()=>{
    const event=structuredClone(first.payload);event.order.customer.name='=IMPORTXML("private")';event.order.customer.phone='+212600000000';
    assert.throws(()=>mapSheetEvent(event),/Approved/);
    const rows=mapSheetEvent(event,{mode:'items',columns:[{header:'Approved name',field:'customerName'},{header:'Approved item',field:'itemId'},{header:'Approved total',field:'orderTotalMad'}]});
    assert.equal(rows.length,3);assert.deepEqual(rows[0].values[0].userEnteredValue,{stringValue:event.order.customer.name});
    assert.equal(rows[0].values[2].userEnteredValue.numberValue,445);assert.equal(rows[1].values[2].userEnteredValue.stringValue,'');
    assert.equal(JSON.stringify(rows).includes('formulaValue'),false);
  });
  await t.test('actual local worker process can restart and deliver through a synthetic HTTP receiver',async()=>{
    const mock=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const result=await receive(raw,req.headers['x-melyne-signature']);res.writeHead(result.status,result.headers);res.end(result.body);});
    await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
    const run=()=>new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['server/scripts/sheet-sync-worker.mjs','--once'],{cwd:process.cwd(),windowsHide:true,
        env:{...process.env,PGOPTIONS:`-c search_path=${schema}`,SHEET_SYNC_ENABLED:'true',SHEET_SYNC_ALLOW_LOOPBACK_MOCK:'true',GOOGLE_SHEETS_WEBHOOK_URL:`http://127.0.0.1:${mock.address().port}/orders`,GOOGLE_SHEETS_WEBHOOK_SECRET:config.googleSheetsWebhookSecret}});
      let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error('Synthetic worker process failed')));
    });
    try{
      for(let i=0;i<2;i++){const event=await fresh();const output=await run();assert.ok(output.includes('delivered'));assert.equal((await eventFor(event.order_id)).state,'delivered');}
      const abandoned=await fresh();const claim=await claimSheetEvent(db);assert.equal(claim.id,abandoned.id);
      await db.query("UPDATE order_sheet_outbox SET lease_until=now()-INTERVAL '1 second' WHERE id=$1",[claim.id]);
      assert.ok((await run()).includes('delivered'));assert.equal((await eventFor(abandoned.order_id)).attempt_count,2);
    }finally{await new Promise(resolve=>mock.close(resolve));}
    assert.throws(()=>validateSheetEndpoint({...config,production:true,googleSheetsWebhookUrl:'http://127.0.0.1/'}),/HTTPS/);
    assert.throws(()=>validateSheetEndpoint({...config,sheetSyncAllowedOrigin:'https://other.example.test'}),/HTTPS/);
  });
});
