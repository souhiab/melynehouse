import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { loadProducts, reorderProducts, saveProduct } from "./catalog-repository.mjs";
import { transaction } from "./db.mjs";
import { bannerSchema, imageColorSchema, loginSchema, manualOrderSchema, orderSchema, parse, productSchema } from "./validation.mjs";
import { cookieOptions, randomToken, tokenHash, verifyPassword } from "./security.mjs";
import { retryFailedSheetEvent, sheetEventStatus } from "./sheet-outbox.mjs";
import { changeOrderStatus, createOrder } from "./order-service.mjs";
import { getAdminOrder, listAdminOrders } from "./order-list.mjs";

const SESSION_COOKIE = "melyne_owner_session";
const CSRF_COOKIE = "melyne_owner_csrf";
const SESSION_AGE = 8 * 60 * 60 * 1000;

function asyncRoute(handler) { return (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next); }
function makeId() { return crypto.randomUUID(); }
function cleanFilename(name) { return path.basename(name).normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(-120) || "upload"; }
function sha256File(filePath) { return new Promise((resolve,reject)=>{ const hash=crypto.createHash("sha256"); const stream=fs.createReadStream(filePath); stream.on("error",reject); stream.on("data",chunk=>hash.update(chunk)); stream.on("end",()=>resolve(hash.digest("hex"))); }); }

async function validateImageMagic(filePath) {
  const handle = await fsp.open(filePath,"r"); const buffer=Buffer.alloc(16); await handle.read(buffer,0,16,0); await handle.close();
  const jpeg=buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WEBP";
  if (!jpeg&&!png&&!webp) throw Object.assign(new Error("Only JPEG, PNG and WebP image uploads are accepted"),{status:400});
  if (jpeg) return {extension:"jpg",contentType:"image/jpeg"};
  if (png) return {extension:"png",contentType:"image/png"};
  return {extension:"webp",contentType:"image/webp"};
}

async function finalizeImageUpload(file) {
  const kind=await validateImageMagic(file.path);
  const stem=path.basename(file.filename,path.extname(file.filename));
  const finalPath=path.join(path.dirname(file.path),`${stem}.${kind.extension}`);
  if (file.path!==finalPath) await fsp.rename(file.path,finalPath);
  file.path=finalPath; file.filename=path.basename(finalPath); file.mimetype=kind.contentType;
  return file;
}

async function recordUpload(db,config,req,file,checksum) {
  const id=makeId(); const publicUrl=`/media/${req.uploadRelativeDirectory.replaceAll("\\","/")}/${file.filename}`;
  await db.query("INSERT INTO upload_assets(id,storage_key,public_url,original_name,content_type,byte_size,checksum_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,path.relative(config.uploadRoot,file.path),publicUrl,file.originalname,file.mimetype,file.size,checksum,req.admin?.user_id||null]);
  return {id,publicUrl};
}

async function audit(db,adminUserId,action,entityType,entityId,details={}) {
  await db.query("INSERT INTO admin_audit_log(id,admin_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)",[makeId(),adminUserId||null,action,entityType,entityId||null,JSON.stringify(details)]);
}

async function loadBanners(db, admin=false) {
  const where = admin ? "" : "WHERE status='published' AND (active_from IS NULL OR active_from<=now()) AND (active_until IS NULL OR active_until>now())";
  const result=await db.query(`SELECT * FROM banners ${where} ORDER BY sort_position,id`);
  return result.rows.map(row=>({id:row.id,headingAr:row.heading_ar,supportingTextAr:row.supporting_text_ar,buttonLabelAr:row.button_label_ar,destinationUrl:row.destination_url,desktopImageUrl:row.desktop_image_url,mobileImageUrl:row.mobile_image_url,imageAltAr:row.image_alt_ar,status:row.status,sortPosition:row.sort_position,activeFrom:row.active_from,activeUntil:row.active_until}));
}

export async function createApp({ db, config, fetchImpl=globalThis.fetch }) {
  await fsp.mkdir(config.uploadRoot,{recursive:true});
  const app=express();
  app.disable("x-powered-by");
  app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));
  app.use(express.json({limit:"1mb"})); app.use(cookieParser());
  app.use((req,res,next)=>{ const requestId=req.get("x-request-id")||makeId(); req.requestId=requestId; res.setHeader("x-request-id",requestId); next(); });
  app.use("/media",express.static(config.uploadRoot,{fallthrough:false,index:false,maxAge:config.production?"1d":0}));
  app.use((req,res,next)=>{ if (!["GET","HEAD","OPTIONS"].includes(req.method)) { const origin=req.get("origin"); if (origin&&!config.allowedOrigins.includes(origin)) return res.status(403).json({error:"Origin is not allowed"}); } next(); });

  const storage=multer.diskStorage({destination(req,file,callback){ const date=new Date(); const relative=path.join(String(date.getUTCFullYear()),String(date.getUTCMonth()+1).padStart(2,"0")); const target=path.join(config.uploadRoot,relative); fs.mkdirSync(target,{recursive:true}); req.uploadRelativeDirectory=relative; callback(null,target); },filename(req,file,callback){ callback(null,`${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${cleanFilename(file.originalname)}`); }});
  const upload=multer({storage,limits:{fileSize:10*1024*1024,files:1}});

  const authenticate=asyncRoute(async(req,res,next)=>{ const token=req.cookies[SESSION_COOKIE]; if(!token) return res.status(401).json({error:"Authentication required"}); const result=await db.query(`SELECT s.*,u.email,u.display_name FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL`,[tokenHash(token,config.sessionSecret)]); if(!result.rowCount) return res.status(401).json({error:"Session expired"}); req.admin=result.rows[0]; next(); });
  const csrf=(req,res,next)=>{ if(["GET","HEAD","OPTIONS"].includes(req.method)) return next(); const value=req.get("x-csrf-token"); const cookie=req.cookies[CSRF_COOKIE]; if(!value||!cookie||value!==cookie||tokenHash(value,config.sessionSecret)!==req.admin.csrf_hash) return res.status(403).json({error:"CSRF validation failed"}); next(); };

  app.get("/api/health",asyncRoute(async(req,res)=>{ await db.query("SELECT 1"); res.json({status:"ok",database:"postgresql"}); }));
  app.get("/api/public/storefront",asyncRoute(async(req,res)=>{ const [products,banners,categories]=await Promise.all([loadProducts(db),loadBanners(db),db.query("SELECT id,slug,name,sort_position FROM categories ORDER BY sort_position,id")]); products.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)); const featured=products.filter(p=>p.featured).sort((a,b)=>(a.featuredOrder??Number.MAX_SAFE_INTEGER)-(b.featuredOrder??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id)); res.setHeader("cache-control","no-store"); res.json({products,featuredProducts:featured,banners,categories:categories.rows}); }));

  app.post("/api/orders",rateLimit({windowMs:60_000,limit:config.orderRateLimit??12,standardHeaders:"draft-8",legacyHeaders:false}),asyncRoute(async(req,res)=>{
    const key=req.get("idempotency-key");
    if(!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw Object.assign(new Error("A UUID Idempotency-Key header is required"),{status:400});
    const input=parse(orderSchema,req.body);
    const order=await createOrder(db,config,input,key);
    if(order.replayed) { res.setHeader("cache-control","no-store"); return res.status(200).json(order); }
    res.setHeader("cache-control","no-store");
    return res.status(201).json(order);
  }));

  const loginLimiter=rateLimit({windowMs:15*60_000,limit:8,standardHeaders:"draft-8",legacyHeaders:false});
  app.post("/api/admin/session",loginLimiter,asyncRoute(async(req,res)=>{ const input=parse(loginSchema,req.body); const result=await db.query("SELECT * FROM admin_users WHERE lower(email)=lower($1) AND disabled_at IS NULL",[input.email]); if(!result.rowCount||!(await verifyPassword(input.password,result.rows[0].password_hash))) return res.status(401).json({error:"Invalid email or password"}); const token=randomToken(); const csrfToken=randomToken(); const expires=new Date(Date.now()+SESSION_AGE); await db.query("INSERT INTO admin_sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,$4)",[tokenHash(token,config.sessionSecret),result.rows[0].id,tokenHash(csrfToken,config.sessionSecret),expires]); await audit(db,result.rows[0].id,"login","admin_session",null,{requestId:req.requestId}); res.cookie(SESSION_COOKIE,token,cookieOptions(config,SESSION_AGE)); res.cookie(CSRF_COOKIE,csrfToken,{httpOnly:false,sameSite:"strict",secure:config.production,path:"/",maxAge:SESSION_AGE}); res.json({email:result.rows[0].email,displayName:result.rows[0].display_name}); }));
  app.get("/api/admin/session",authenticate,(req,res)=>res.json({email:req.admin.email,displayName:req.admin.display_name}));
  app.delete("/api/admin/session",authenticate,csrf,asyncRoute(async(req,res)=>{ await audit(db,req.admin.user_id,"logout","admin_session",null,{requestId:req.requestId}); await db.query("DELETE FROM admin_sessions WHERE token_hash=$1",[req.admin.token_hash]); res.clearCookie(SESSION_COOKIE); res.clearCookie(CSRF_COOKIE); res.status(204).end(); }));

  app.use("/api/admin",authenticate,csrf,(req,res,next)=>{ res.setHeader("cache-control","no-store"); next(); });
  app.get("/api/admin/products",asyncRoute(async(req,res)=>res.json({products:await loadProducts(db,{includeUnpublished:true})})));
  app.post("/api/admin/categories",asyncRoute(async(req,res)=>{
    if(typeof req.body.name!=="string")throw Object.assign(new Error("اسم الفئة مطلوب"),{status:400});
    const name=req.body.name.normalize('NFKC').trim().replace(/\s+/g,' ');
    if(!name||name.length>120)throw Object.assign(new Error("اسم الفئة غير صالح"),{status:400});
    const slug=name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'');
    if(!slug)throw Object.assign(new Error("اسم الفئة غير صالح"),{status:400});
    const category=await transaction(db,async client=>{
      await client.query('LOCK TABLE categories IN SHARE ROW EXCLUSIVE MODE');
      const rows=(await client.query('SELECT id,name,slug FROM categories')).rows;
      if(rows.some(row=>row.name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()===name.toLowerCase()||row.slug===slug))throw Object.assign(new Error("هذه الفئة موجودة بالفعل"),{status:409});
      const result=await client.query('INSERT INTO categories(id,name,slug,sort_position) VALUES($1,$2,$3,(SELECT COALESCE(MAX(sort_position),0)+1 FROM categories)) RETURNING id,name,slug',[makeId(),name,slug]);
      return result.rows[0];
    });
    await audit(db,req.admin.user_id,'create','category',category.id,{requestId:req.requestId});
    res.status(201).json(category);
  }));
  app.post("/api/admin/products",asyncRoute(async(req,res)=>{ const input=parse(productSchema,req.body); const id=await saveProduct(db,input); await audit(db,req.admin.user_id,"create","product",id,{requestId:req.requestId}); res.status(201).json({id}); }));
  app.put("/api/admin/products/:id",asyncRoute(async(req,res)=>{ const input=parse(productSchema,req.body); const id=await saveProduct(db,input,req.params.id); await audit(db,req.admin.user_id,"update","product",id,{requestId:req.requestId}); res.json({id}); }));
  app.post("/api/admin/products/:id/archive",asyncRoute(async(req,res)=>{ const result=await db.query("UPDATE products SET status='archived',archived_at=now(),featured=false,updated_at=now() WHERE id=$1 RETURNING id",[req.params.id]); if(!result.rowCount) throw Object.assign(new Error("Product not found"),{status:404}); await audit(db,req.admin.user_id,"archive","product",req.params.id,{requestId:req.requestId}); res.json({id:req.params.id,status:"archived"}); }));
  app.post("/api/admin/products/:id/restore",asyncRoute(async(req,res)=>{ const result=await db.query("UPDATE products SET status='hidden',archived_at=NULL,updated_at=now() WHERE id=$1 AND status='archived' RETURNING id",[req.params.id]); if(!result.rowCount) throw Object.assign(new Error("Archived product not found"),{status:404}); await audit(db,req.admin.user_id,"restore","product",req.params.id,{requestId:req.requestId}); res.json({id:req.params.id,status:"hidden"}); }));
  app.put("/api/admin/product-order",asyncRoute(async(req,res)=>{ await reorderProducts(db,req.body.scope,req.body.orderedProductIds,req.body.categorySlug||null); await audit(db,req.admin.user_id,"reorder","products",req.body.categorySlug||req.body.scope,{scope:req.body.scope,orderedProductIds:req.body.orderedProductIds,requestId:req.requestId}); res.status(204).end(); }));

  app.post("/api/admin/products/:id/images",upload.single("image"),asyncRoute(async(req,res)=>{ if(!req.file) throw Object.assign(new Error("Image is required"),{status:400}); await finalizeImageUpload(req.file); const checksum=await sha256File(req.file.path); const id=makeId(); const asset=await transaction(db,async(client)=>{ const product=await client.query("SELECT id FROM products WHERE id=$1",[req.params.id]); if(!product.rowCount) throw Object.assign(new Error("Product not found"),{status:404}); const saved=await recordUpload(client,config,req,req.file,checksum); const position=Number((await client.query("SELECT COALESCE(MAX(sort_position),0)+1 position FROM product_images WHERE product_id=$1",[req.params.id])).rows[0].position); await client.query("INSERT INTO product_images(id,product_id,storage_key,public_url,alt_text,sort_position,content_type,byte_size,checksum_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,req.params.id,path.relative(config.uploadRoot,req.file.path),saved.publicUrl,req.body.altText||"",position,req.file.mimetype,req.file.size,checksum]); return saved; }); req.keepUploadedFile=true; await audit(db,req.admin.user_id,"upload_image","product",req.params.id,{imageId:id,assetId:asset.id,requestId:req.requestId}); res.status(201).json({id,publicUrl:asset.publicUrl,checksum}); }));
  app.put("/api/admin/products/:id/images/:imageId",upload.single("image"),asyncRoute(async(req,res)=>{ if(!req.file) throw Object.assign(new Error("Image is required"),{status:400}); await finalizeImageUpload(req.file); const checksum=await sha256File(req.file.path); const asset=await transaction(db,async(client)=>{ const saved=await recordUpload(client,config,req,req.file,checksum); const result=await client.query("UPDATE product_images SET original_public_url=COALESCE(original_public_url,public_url),storage_key=$1,public_url=$2,alt_text=$3,content_type=$4,byte_size=$5,checksum_sha256=$6,updated_at=now() WHERE id=$7 AND product_id=$8 RETURNING id",[path.relative(config.uploadRoot,req.file.path),saved.publicUrl,req.body.altText||"",req.file.mimetype,req.file.size,checksum,req.params.imageId,req.params.id]); if(!result.rowCount) throw Object.assign(new Error("Product image not found"),{status:404}); return saved; }); req.keepUploadedFile=true; await audit(db,req.admin.user_id,"replace_image","product",req.params.id,{imageId:req.params.imageId,assetId:asset.id,requestId:req.requestId}); res.json({id:req.params.imageId,publicUrl:asset.publicUrl,checksum}); }));
  app.put("/api/admin/products/:id/image-order",asyncRoute(async(req,res)=>{ const ids=req.body.orderedImageIds; if(!Array.isArray(ids)||new Set(ids).size!==ids.length) throw Object.assign(new Error("Image ordering must contain unique IDs"),{status:400}); await transaction(db,async(client)=>{ const existing=(await client.query("SELECT id FROM product_images WHERE product_id=$1 AND archived_at IS NULL ORDER BY id",[req.params.id])).rows.map(row=>row.id); if(existing.length!==ids.length||existing.some(id=>!ids.includes(id))) throw Object.assign(new Error("Image ordering must include every active product image exactly once"),{status:400}); await client.query("UPDATE product_images SET sort_position=sort_position+100000 WHERE product_id=$1 AND archived_at IS NULL",[req.params.id]); for(let i=0;i<ids.length;i+=1) await client.query("UPDATE product_images SET sort_position=$1,updated_at=now() WHERE id=$2 AND product_id=$3",[i+1,ids[i],req.params.id]); }); await audit(db,req.admin.user_id,"reorder_images","product",req.params.id,{orderedImageIds:ids,requestId:req.requestId}); res.status(204).end(); }));
  app.delete("/api/admin/products/:id/images/:imageId",asyncRoute(async(req,res)=>{
    await transaction(db,async(client)=>{
      const linked=await client.query("SELECT id FROM product_variants WHERE product_id=$1 AND image_id=$2 LIMIT 1",[req.params.id,req.params.imageId]);
      if(linked.rowCount) throw Object.assign(new Error("Image is assigned to a variant; reassign that variant first"),{status:409});
      const result=await client.query("UPDATE product_images SET sort_position=(SELECT COALESCE(MAX(sort_position),0)+1 FROM product_images WHERE product_id=$2),archived_at=now(),updated_at=now() WHERE id=$1 AND product_id=$2 AND archived_at IS NULL RETURNING id",[req.params.imageId,req.params.id]);
      if(!result.rowCount) throw Object.assign(new Error("Product image not found"),{status:404});
    });
    await audit(db,req.admin.user_id,"archive_image","product",req.params.id,{imageId:req.params.imageId,requestId:req.requestId});
    res.status(204).end();
  }));
  app.put("/api/admin/products/:id/images/:imageId/color",asyncRoute(async(req,res)=>{
    const {colorLabel}=parse(imageColorSchema,req.body);
    await transaction(db,async(client)=>{
      const product=(await client.query("SELECT options FROM products WHERE id=$1",[req.params.id])).rows[0];
      if(!product) throw Object.assign(new Error("Product not found"),{status:404});
      const colorOption=product.options?.find(option=>/color|colour|لون/i.test(String(option.key||option.name||"")));
      if(colorLabel && !colorOption?.values?.some(value=>value.label===colorLabel)) throw Object.assign(new Error("Color must match a product color option"),{status:400});
      const image=(await client.query("SELECT source_metadata FROM product_images WHERE id=$1 AND product_id=$2 AND archived_at IS NULL FOR UPDATE",[req.params.imageId,req.params.id])).rows[0];
      if(!image) throw Object.assign(new Error("Product image not found"),{status:404});
      const references=(await client.query("SELECT selections FROM product_variants WHERE product_id=$1 AND image_id=$2",[req.params.id,req.params.imageId])).rows;
      if(colorLabel && references.some(({selections})=>selections.some(selection=>(selection.option===colorOption.name||selection.optionKey===colorOption.key)&&selection.value!==colorLabel))) throw Object.assign(new Error("This image is linked to a variant of another color"),{status:409});
      const metadata={...(image.source_metadata||{})};
      if(colorLabel) metadata.colorLabel=colorLabel; else delete metadata.colorLabel;
      await client.query("UPDATE product_images SET source_metadata=$1,updated_at=now() WHERE id=$2",[JSON.stringify(metadata),req.params.imageId]);
    });
    await audit(db,req.admin.user_id,"assign_image_color","product",req.params.id,{imageId:req.params.imageId,colorLabel,requestId:req.requestId});
    res.json({id:req.params.imageId,colorLabel});
  }));

  app.get("/api/admin/banners",asyncRoute(async(req,res)=>res.json({banners:await loadBanners(db,true)})));
  app.post("/api/admin/banners",asyncRoute(async(req,res)=>{ const value=parse(bannerSchema,req.body); const id=makeId(); const position=Number((await db.query("SELECT COALESCE(MAX(sort_position),0)+1 position FROM banners")).rows[0].position); await db.query("INSERT INTO banners(id,heading_ar,supporting_text_ar,button_label_ar,destination_url,desktop_image_url,mobile_image_url,image_alt_ar,status,sort_position,active_from,active_until,archived_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[id,value.headingAr,value.supportingTextAr||null,value.buttonLabelAr||null,value.destinationUrl||null,value.desktopImageUrl,value.mobileImageUrl||null,value.imageAltAr,value.status,position,value.activeFrom||null,value.activeUntil||null,value.status==="archived"?new Date():null]); await audit(db,req.admin.user_id,"create","banner",id,{requestId:req.requestId}); res.status(201).json({id}); }));
  app.put("/api/admin/banners/:id",asyncRoute(async(req,res)=>{ const value=parse(bannerSchema,req.body); const result=await db.query("UPDATE banners SET heading_ar=$1,supporting_text_ar=$2,button_label_ar=$3,destination_url=$4,desktop_image_url=$5,mobile_image_url=$6,image_alt_ar=$7,status=$8,active_from=$9,active_until=$10,archived_at=$11,updated_at=now() WHERE id=$12 RETURNING id",[value.headingAr,value.supportingTextAr||null,value.buttonLabelAr||null,value.destinationUrl||null,value.desktopImageUrl,value.mobileImageUrl||null,value.imageAltAr,value.status,value.activeFrom||null,value.activeUntil||null,value.status==="archived"?new Date():null,req.params.id]); if(!result.rowCount) throw Object.assign(new Error("Banner not found"),{status:404}); await audit(db,req.admin.user_id,"update","banner",req.params.id,{requestId:req.requestId}); res.json({id:req.params.id}); }));
  app.delete("/api/admin/banners/:id",asyncRoute(async(req,res)=>{ const result=await db.query("UPDATE banners SET status='archived',archived_at=now(),updated_at=now() WHERE id=$1 RETURNING id",[req.params.id]); if(!result.rowCount) throw Object.assign(new Error("Banner not found"),{status:404}); await audit(db,req.admin.user_id,"archive","banner",req.params.id,{requestId:req.requestId}); res.status(204).end(); }));
  app.put("/api/admin/banner-order",asyncRoute(async(req,res)=>{ const ids=req.body.orderedBannerIds; if(!Array.isArray(ids)||new Set(ids).size!==ids.length) throw Object.assign(new Error("Banner ordering must contain unique IDs"),{status:400}); await transaction(db,async(client)=>{ const existing=(await client.query("SELECT id FROM banners ORDER BY id")).rows.map(row=>row.id); if(existing.length!==ids.length||existing.some(id=>!ids.includes(id))) throw Object.assign(new Error("Banner ordering must include every banner exactly once"),{status:400}); await client.query("UPDATE banners SET sort_position=sort_position+100000"); for(let i=0;i<ids.length;i+=1) await client.query("UPDATE banners SET sort_position=$1,updated_at=now() WHERE id=$2",[i+1,ids[i]]); }); await audit(db,req.admin.user_id,"reorder","banners",null,{orderedBannerIds:ids,requestId:req.requestId}); res.status(204).end(); }));
  app.post("/api/admin/uploads",upload.single("image"),asyncRoute(async(req,res)=>{ if(!req.file) throw Object.assign(new Error("Image is required"),{status:400}); await finalizeImageUpload(req.file); const checksum=await sha256File(req.file.path); const asset=await recordUpload(db,config,req,req.file,checksum); req.keepUploadedFile=true; await audit(db,req.admin.user_id,"upload","asset",asset.id,{purpose:req.body.purpose||null,requestId:req.requestId}); res.status(201).json({id:asset.id,publicUrl:asset.publicUrl,checksum}); }));

  app.get("/api/admin/orders",asyncRoute(async(req,res)=>res.json(await listAdminOrders(db,req.query))));
  app.get("/api/admin/orders/:id",asyncRoute(async(req,res)=>{
    const order=await getAdminOrder(db,req.params.id);
    const sheetSync=await sheetEventStatus(db,config,req.params.id);
    res.json({...order,sheetSync});
  }));
  app.post("/api/admin/orders",asyncRoute(async(req,res)=>{
    const key=req.get("idempotency-key");
    if(!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw Object.assign(new Error("A UUID Idempotency-Key header is required"),{status:400});
    const {source,...input}=parse(manualOrderSchema,req.body);
    // Owner-created orders remain local; this route never contacts a Google Sheet.
    const order=await createOrder(db,config,input,key,source,{manual:true});
    if(!order.replayed) await audit(db,req.admin.user_id,"create_manual_order","order",order.id,{source,requestId:req.requestId});
    res.status(order.replayed?200:201).json(order);
  }));
  app.patch("/api/admin/orders/:id",asyncRoute(async(req,res)=>res.json(await changeOrderStatus(db,req.params.id,String(req.body.status||""),req.admin.user_id,req.requestId))));
  app.post("/api/admin/orders/:id/retry-sheet-sync",asyncRoute(async(req,res)=>{
    const exists=await db.query("SELECT id,created_by_admin FROM orders WHERE id=$1",[req.params.id]);
    if(!exists.rowCount)throw Object.assign(new Error("Order not found"),{status:404});
    if(exists.rows[0].created_by_admin)throw Object.assign(new Error("Manual orders cannot be synchronized to Google Sheets"),{status:409});
    const result=await retryFailedSheetEvent(db,config,req.params.id);
    await audit(db,req.admin.user_id,"retry_sheet_sync","order",req.params.id,{requestId:req.requestId});
    res.json(result);
  }));

  app.use((error,req,res,next)=>{ if(req.file?.path&&!req.keepUploadedFile) fsp.unlink(req.file.path).catch(()=>{}); const status=error.status||((error.code==="23505"||error.code==="23503")?409:500); if(status>=500) console.error(error); res.status(status).json({error:status>=500?"Server error":error.message,details:error.details,requestId:req.requestId}); });
  return app;
}

