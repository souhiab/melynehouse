import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { loadConfig } from '../server/config.mjs';
import { createDatabase, transaction } from '../server/db.mjs';

const config=loadConfig();
const db=createDatabase(config.databaseUrl);
const apply=process.argv.includes('--apply');
const origin='https://melynehouse.com';
const headers={'user-agent':'Mozilla/5.0 (compatible; MelyneCatalogAudit/1.0; +https://melynehouse.com/)'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const numberOrNull=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
const comparePrice=(value,current)=>{const amount=numberOrNull(value);return amount!=null&&current!=null&&amount>current?amount:null;};
const displayName=name=>String(name||'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').replace(/\s+/g,' ').trim()||name;
const plainText=html=>html?String(html).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()||null:null;

async function publicPage(url){
  await pause(180);
  const response=await fetch(url,{headers});
  if(!response.ok)throw new Error(`${response.status} ${url}`);
  const html=await response.text();
  const match=html.match(/<script>window\.__NUXT__=([\s\S]*?)<\/script>/);
  if(!match)throw new Error(`Public product state missing: ${url}`);
  return vm.runInNewContext(`(${match[1].trim().replace(/;$/,'')})`,Object.create(null),{timeout:8000});
}

async function liveProducts(){
  const state=await publicPage(`${origin}/shop`);
  const entry=Object.values(state.fetch||{}).find(value=>value&&Array.isArray(value.items)&&value.paginate);
  if(!entry||!state.state?.baseURL||!state.state?.token)throw new Error('Public catalog pagination unavailable');
  const found=[];
  for(let page=1;page<=entry.paginate.last_page;page++){
    const url=new URL(`${state.state.baseURL}/products/search`);
    for(const [key,value] of Object.entries({page,limit:entry.paginate.per_page,'sort[createdAt]':-1}))url.searchParams.set(key,String(value));
    await pause(180);
    const response=await fetch(url,{headers:{...headers,'x-auth-token':state.state.token,accept:'application/json'}});
    if(!response.ok)throw new Error(`Public catalog page ${page}: ${response.status}`);
    found.push(...((await response.json()).results||[]));
  }
  const byId=new Map(found.filter(item=>item?._id).map(item=>[item._id,item]));
  if(byId.size!==entry.paginate.total)throw new Error(`Live catalog count changed during read: ${byId.size}/${entry.paginate.total}`);
  return [...byId.values()];
}

function mapProduct(item,url,extractedAt){
  const optionsById=new Map((item.options||[]).map(option=>[option._id,option]));
  const selection=value=>{
    if(!value?.option||!value?.value)return null;
    const option=optionsById.get(value.option);
    const choice=option?.values?.find(entry=>entry._id===value.value);
    if(!option||!choice)throw new Error(`Unmapped variant selection on ${item._id}`);
    return {option:option.name||option.key||'Option',optionKey:option.key||null,value:choice.value1??choice.value2??null};
  };
  const variants=(item.variants||[]).map(variant=>{
    if(!variant._id)throw new Error(`Variant without ID on ${item._id}`);
    const stock=numberOrNull(variant.quantity?.instock);
    const current=numberOrNull(variant.price?.salePrice);
    if(current==null||stock!=null&&(!Number.isInteger(stock)||stock<0))throw new Error(`Invalid variant price or stock: ${variant._id}`);
    return {id:variant._id,name:variant.name||'',selections:[variant.option1,variant.option2,variant.option3].map(selection).filter(Boolean),price:{current,comparison:comparePrice(variant.price?.comparePrice,current),currency:'MAD'},stockQuantity:stock,explicitlyUnavailable:variant.unavailable===true,availability:variant.unavailable===true||stock===0?'unavailable':stock!=null&&stock>0?'available':'unknown',availabilitySource:'public variant quantity and unavailable fields',imageId:variant.imageId||null};
  });
  const current=numberOrNull(item.price?.salePrice);
  if(!item._id||!item.slug||!item.name||current==null||!variants.length)throw new Error(`Incomplete public product: ${item._id||url}`);
  const images=(item.images||[]).map((image,index)=>{
    if(!image._id||!image.src)throw new Error(`Image missing ID or URL: ${item._id}`);
    return {id:image._id,title:image.title||null,sourceUrl:image.src,variantIds:variants.filter(variant=>variant.imageId===image._id).map(variant=>variant.id),order:index+1};
  });
  if(!images.length||variants.some(variant=>variant.imageId&&!images.some(image=>image.id===variant.imageId)))throw new Error(`Variant image association missing: ${item._id}`);
  const purchasablePrices=variants.filter(variant=>variant.availability==='available').map(variant=>variant.price.current);
  const displayPrice=purchasablePrices.length?Math.min(...purchasablePrices):current;
  return {id:item._id,sku:item.reference||null,slug:item.slug,canonicalUrl:url,sourceUrl:url,name:item.name,displayName:displayName(item.name),descriptionHtml:item.description||null,description:plainText(item.description),categories:(item.collections||[]).map(category=>({id:category._id,name:category.name,slug:category.slug,url:`${origin}/shop/${encodeURIComponent(category.slug)}`})),price:{current:displayPrice,comparison:comparePrice(item.price?.comparePrice,displayPrice),currency:'MAD'},sourceBasePrice:{current,comparison:comparePrice(item.price?.comparePrice,current),currency:'MAD'},priceSource:purchasablePrices.length?'lowest available public variant price':'public product base price',options:(item.options||[]).map(option=>({id:option._id,name:option.name||option.key||null,key:option.key||null,values:(option.values||[]).map(value=>({id:value._id,label:value.value1??value.value2??null,secondaryLabel:value.value2??null}))})),variants,availability:variants.some(variant=>variant.availability==='available')?'available':'unavailable',availabilitySource:'derived only from public variant-level stock',images,brand:item.brand?{id:item.brand._id||null,name:item.brand.name||null,slug:item.brand.slug||null}:null,tags:Array.isArray(item.tags)?item.tags:[],productType:item.productType||null,freeShipping:typeof item.freeShipping==='boolean'?item.freeShipping:null,shipping:item.shipping||null,seo:item.seo||null,createdAt:item.createdAt||null,updatedAt:item.updatedAt||null,extractedAt,source:'melynehouse.com public storefront'};
}

async function saveImages(product){
  const root=path.join(config.projectRoot,'public','images','products',product.id);
  await fs.mkdir(root,{recursive:true});
  for(const image of product.images){
    const extension=path.extname(new URL(image.sourceUrl).pathname).toLowerCase()||'.jpg';
    if(!['.jpg','.jpeg','.png','.webp','.avif'].includes(extension))throw new Error(`Unexpected image type: ${image.sourceUrl}`);
    const basename=String(image.order).padStart(2,'0');
    for(const optimized of [false,true]){
      const url=new URL(image.sourceUrl);
      if(optimized){url.searchParams.set('width','900');url.searchParams.set('quality','82');}
      await pause(90);
      const response=await fetch(url,{headers:{...headers,accept:'image/avif,image/webp,image/*,*/*;q=0.8'}});
      if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error(`Image download failed: ${response.status} ${url}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      const filename=`${optimized?'web':'original'}-${basename}${extension}`;
      const relative=`/images/products/${product.id}/${filename}`;
      await fs.writeFile(path.join(root,filename),bytes);
      image[optimized?'localOptimizedPath':'localOriginalPath']=relative;
      image[optimized?'optimizedBytes':'originalBytes']=bytes.length;
    }
  }
}

async function insertProduct(product){
  return transaction(db,async client=>{
    const conflict=await client.query('SELECT id FROM products WHERE id=$1 OR slug=$2 FOR UPDATE',[product.id,product.slug]);
    if(conflict.rowCount)throw new Error(`Product ID or slug already exists: ${product.id}`);
    const position=Number((await client.query('SELECT COALESCE(MAX(category_sort_position),0)+1 AS next FROM products')).rows[0].next);
    const metadata={canonicalUrl:product.canonicalUrl,sourceUrl:product.sourceUrl,brand:product.brand,tags:product.tags,productType:product.productType,createdAt:product.createdAt,updatedAt:product.updatedAt,extractedAt:product.extractedAt,source:product.source,sourceBasePrice:product.sourceBasePrice,priceSource:product.priceSource};
    await client.query(`INSERT INTO products(id,sku,slug,original_name,display_name,description,description_html,price_mad,comparison_price_mad,availability,status,category_sort_position,featured,options,source_metadata,tags,brand_name)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published',$11,false,$12,$13,$14,$15)`,[product.id,product.sku,product.slug,product.name,product.displayName,product.description,product.descriptionHtml,product.price.current,product.price.comparison,product.availability,position,JSON.stringify(product.options),JSON.stringify(metadata),JSON.stringify(product.tags),product.brand?.name||null]);
    for(const category of product.categories){
      const row=await client.query('SELECT id FROM categories WHERE id=$1 AND slug=$2',[category.id,category.slug]);
      if(!row.rowCount)throw new Error(`Unknown category: ${category.slug}`);
      const next=Number((await client.query('SELECT COALESCE(MAX(sort_position),0)+1 AS next FROM product_categories WHERE category_id=$1',[category.id])).rows[0].next);
      await client.query('INSERT INTO product_categories(product_id,category_id,sort_position) VALUES($1,$2,$3)',[product.id,category.id,next]);
    }
    for(const image of product.images)await client.query(`INSERT INTO product_images(id,product_id,storage_key,public_url,original_public_url,alt_text,sort_position,source_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[image.id,product.id,image.localOptimizedPath,image.localOptimizedPath,image.localOriginalPath,product.displayName,image.order,JSON.stringify(image)]);
    for(const variant of product.variants)await client.query(`INSERT INTO product_variants(id,product_id,name,selections,price_mad,comparison_price_mad,stock_quantity,available,image_id,source_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[variant.id,product.id,variant.name,JSON.stringify(variant.selections),variant.price.current,variant.price.comparison,variant.stockQuantity,variant.availability==='available',variant.imageId,JSON.stringify({availabilitySource:variant.availabilitySource,explicitlyUnavailable:variant.explicitlyUnavailable,importedStockQuantity:variant.stockQuantity})]);
    return {productId:product.id,variants:product.variants.length,images:product.images.length};
  });
}

try{
  const live=await liveProducts();
  const current=new Set((await db.query('SELECT id FROM products')).rows.map(row=>row.id));
  const missing=live.filter(item=>!current.has(item._id));
  const extractedAt=new Date().toISOString();
  const products=[];
  for(const item of missing){
    const url=`${origin}/products/${encodeURIComponent(item.slug)}`;
    const state=await publicPage(url);
    const detail=Object.values(state.fetch||{}).find(entry=>entry?.item?._id===item._id)?.item;
    if(!detail)throw new Error(`Public detail mismatch: ${url}`);
    products.push(mapProduct(detail,url,extractedAt));
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',liveCount:live.length,localCount:current.size,newProducts:products.map(product=>({id:product.id,name:product.name,variants:product.variants.length,images:product.images.length,categories:product.categories.map(category=>category.slug)}))},null,2));
  if(apply&&products.length){
    const results=[];
    for(const product of products){
      await saveImages(product);
      results.push(await insertProduct(product));
    }
    const directory=path.join(config.projectRoot,'data','catalog-updates');
    await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,`${extractedAt.slice(0,10)}.json`),JSON.stringify({schemaVersion:1,extractedAt,source:origin,currency:'MAD',products},null,2)+'\n');
    console.log(JSON.stringify({imported:results},null,2));
  }
}finally{await db.end();}
