import crypto from 'node:crypto';
import {z} from 'zod';
import {rateLimit} from 'express-rate-limit';
import {transaction} from './db.mjs';
const modules=['discounts','upsells','reviews','facebook','tiktok','linkedin','twitter','snapchat','google-ads'];
const base={notes:z.string().max(2000).optional()};
export function marketingSchema(module){
 if(module==='discounts')return z.object({...base,enabled:z.boolean().default(false),code:z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/),amount:z.coerce.number().positive().max(100)}).strict();
 if(module==='upsells')return z.object({...base,enabled:z.boolean().default(false),productIds:z.string().max(2000).default('')}).strict();
 if(module==='reviews')return z.object({...base,enabled:z.boolean().default(false),moderation:z.string().max(500).optional()}).strict();
 if(modules.includes(module))return z.object({...base,identifier:z.string().trim().regex(/^[A-Za-z0-9_-]{1,150}$/),...(module==='google-ads'?{conversionLabel:z.string().trim().regex(/^[A-Za-z0-9_-]{1,150}$/)}:{})}).strict();
 return null;
}
export async function couponDiscount(client,code,subtotalCents){
 if(!code)return {discountCents:0,code:null};
 const config=(await client.query("SELECT config FROM marketing_settings WHERE module='discounts' FOR SHARE")).rows[0]?.config;
 if(!config?.enabled||String(config.code).toUpperCase()!==String(code).trim().toUpperCase())throw Object.assign(new Error('رمز الخصم غير صالح أو غير مفعل'),{status:400});
 return {discountCents:Math.min(subtotalCents,Math.round(subtotalCents*Number(config.amount)/100)),code:String(config.code).toUpperCase()};
}
export function installPublicMarketing(app,db,wrap){
 app.get('/api/public/marketing',wrap(async(req,res)=>{
  const rows=(await db.query("SELECT module,config FROM marketing_settings WHERE module IN ('upsells','reviews')")).rows;
  const values=Object.fromEntries(rows.map(row=>[row.module,row.config]));
  res.setHeader('cache-control','no-store').json({upsellProductIds:values.upsells?.enabled?String(values.upsells.productIds||'').split(/[\s,]+/).filter(Boolean):[],reviewsEnabled:values.reviews?.enabled===true});
 }));
 app.post('/api/public/coupon-quote',rateLimit({windowMs:60_000,limit:30}),wrap(async(req,res)=>{
  const input=z.object({code:z.string().trim().min(1).max(40),items:z.array(z.object({productId:z.string().max(200),variantId:z.string().max(200),quantity:z.number().int().min(1).max(99)}).strict()).min(1).max(50)}).strict().safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Invalid coupon request'});
  const result=await transaction(db,async client=>{let subtotalCents=0;for(const item of input.data.items){const row=(await client.query("SELECT v.price_mad FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND p.id=$2 AND p.status='published' AND p.availability='available' AND v.available=true AND v.retired_at IS NULL",[item.variantId,item.productId])).rows[0];if(!row)throw Object.assign(new Error('Product unavailable'),{status:400});subtotalCents+=Math.round(Number(row.price_mad)*100)*item.quantity;}const discount=await couponDiscount(client,input.data.code,subtotalCents);return {code:discount.code,subtotalMad:subtotalCents/100,discountMad:discount.discountCents/100,totalMad:(subtotalCents-discount.discountCents)/100};});res.json(result);
 }));
 app.get('/api/public/products/:id/reviews',wrap(async(req,res)=>{
  const enabled=(await db.query("SELECT config FROM marketing_settings WHERE module='reviews'")).rows[0]?.config?.enabled;
  if(!enabled)return res.json({reviews:[]});
  const reviews=(await db.query("SELECT r.id,r.author_name,r.rating,r.body,r.created_at FROM product_reviews r JOIN products p ON p.id=r.product_id WHERE r.product_id=$1 AND r.status='published' AND p.status='published' ORDER BY r.created_at DESC,r.id LIMIT 100",[req.params.id])).rows;res.json({reviews});
 }));
 app.post('/api/public/products/:id/reviews',rateLimit({windowMs:3600_000,limit:5}),wrap(async(req,res)=>{
  const parsed=z.object({authorName:z.string().trim().min(2).max(80),rating:z.number().int().min(1).max(5),body:z.string().trim().min(5).max(2000)}).strict().safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'أدخل اسماً وتقييماً ونصاً صالحاً'});
  await transaction(db,async client=>{const enabled=(await client.query("SELECT config FROM marketing_settings WHERE module='reviews' FOR SHARE")).rows[0]?.config?.enabled;if(!enabled)throw Object.assign(new Error('Reviews are disabled'),{status:403});if(!(await client.query("SELECT id FROM products WHERE id=$1 AND status='published'",[req.params.id])).rowCount)throw Object.assign(new Error('Product not found'),{status:404});const v=parsed.data;await client.query('INSERT INTO product_reviews(id,product_id,author_name,rating,body) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),req.params.id,v.authorName,v.rating,v.body]);});res.status(201).json({pending:true});
 }));
}
export function installAdminMarketing(app,db,wrap,audit){
 app.get('/api/admin/marketing/review-list',wrap(async(req,res)=>res.json({reviews:(await db.query('SELECT r.*,p.display_name FROM product_reviews r JOIN products p ON p.id=r.product_id ORDER BY r.created_at DESC,r.id LIMIT 200')).rows})));
 app.patch('/api/admin/marketing/reviews/:id',wrap(async(req,res)=>{
  const parsed=z.object({status:z.enum(['published','rejected','pending'])}).strict().safeParse(req.body);
  if(!parsed.success||!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({error:'Invalid review status'});
  await transaction(db,async client=>{if(!(await client.query('UPDATE product_reviews SET status=$1,moderated_by=$2,moderated_at=now() WHERE id=$3 RETURNING id',[parsed.data.status,req.admin.user_id,req.params.id])).rowCount)throw Object.assign(new Error('Review not found'),{status:404});await audit(client,req.admin.user_id,'moderate_review','review',req.params.id,{status:parsed.data.status});});res.json({saved:true});
 }));
 app.get('/api/admin/marketing/:module',wrap(async(req,res)=>{
  if(!modules.includes(req.params.module))return res.status(404).json({error:'Unknown module'});
  res.json({config:(await db.query('SELECT config FROM marketing_settings WHERE module=$1',[req.params.module])).rows[0]?.config||{}});
 }));
 app.put('/api/admin/marketing/:module',wrap(async(req,res)=>{
  const schema=marketingSchema(req.params.module),parsed=schema?.safeParse(req.body.config);
  if(!parsed?.success)return res.status(400).json({error:'إعدادات غير صالحة: تحقق من الرمز والنسبة والمعرّفات'});
  await transaction(db,async client=>{if(req.params.module==='upsells'){const ids=[...new Set(parsed.data.productIds.split(/[\s,]+/).filter(Boolean))];if(ids.length>12)throw Object.assign(new Error('اختر 12 منتجاً كحد أقصى'),{status:400});for(const id of ids)if(!(await client.query("SELECT id FROM products WHERE id=$1 AND status='published'",[id])).rowCount)throw Object.assign(new Error('اختر منتجات منشورة فقط'),{status:400});parsed.data.productIds=ids.join(',');}
   await client.query('INSERT INTO marketing_settings(module,config,updated_by) VALUES($1,$2,$3) ON CONFLICT(module) DO UPDATE SET config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=now()',[req.params.module,JSON.stringify(parsed.data),req.admin.user_id]);await audit(client,req.admin.user_id,'configure_marketing','marketing',req.params.module,{enabled:parsed.data.enabled===true});});res.json({saved:true});
 }));
}
