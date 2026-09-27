import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root=path.resolve(import.meta.dirname,".."); const file=path.join(root,"data","products.json"); const bytes=await fs.readFile(file); const catalog=JSON.parse(bytes);
const manifest={schemaVersion:1,createdAt:new Date().toISOString(),sourcePath:"data/products.json",sourceSha256:crypto.createHash("sha256").update(bytes).digest("hex"),productCount:catalog.products.length,variantCount:catalog.products.reduce((n,p)=>n+p.variants.length,0),imageCount:catalog.products.reduce((n,p)=>n+p.images.length,0),productOrder:catalog.products.map((p,index)=>({position:p.order??index+1,productId:p.id,displayName:p.displayName,categorySlugs:p.categories.map(c=>c.slug),variantIds:p.variants.map(v=>v.id),orderedImageIds:p.images.map(i=>i.id)}))};
await fs.writeFile(path.join(root,"data","catalog-migration-manifest.json"),`${JSON.stringify(manifest,null,2)}\n`); console.log(JSON.stringify({sourceSha256:manifest.sourceSha256,products:manifest.productCount,variants:manifest.variantCount,images:manifest.imageCount}));

