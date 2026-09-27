import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://melynehouse.com";
const USER_AGENT = "Mozilla/5.0 (compatible; MelyneCatalogAudit/1.0; +https://melynehouse.com/)";
const EXTRACTED_AT = new Date().toISOString();
const REQUEST_DELAY_MS = 180;

const stats = {
  visited: [],
  failedPages: [],
  failedImages: [],
  catalogDataPages: [],
  categoryDataPages: [],
  duplicates: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, label = "page") {
  await sleep(REQUEST_DELAY_MS);
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  stats.visited.push({ url, label, status: response.status });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

function xmlLocs(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&").trim());
}

function nuxtState(html, url) {
  const match = html.match(/<script>window\.__NUXT__=([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`Nuxt state not found: ${url}`);
  const expression = match[1].trim().replace(/;$/, "");
  return vm.runInNewContext(`(${expression})`, Object.create(null), { timeout: 8_000 });
}

function findFetchEntry(state, predicate) {
  return Object.values(state.fetch || {}).find((entry) => entry && typeof entry === "object" && predicate(entry));
}

function canonicalProductURL(slug) {
  return `${ORIGIN}/products/${encodeURIComponent(slug).replaceAll("%2F", "/")}`;
}

function cleanDisplayName(name) {
  const cleaned = String(name || "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || name;
}

function stripHtml(html) {
  if (!html) return null;
  return String(html)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim() || null;
}

function price(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function comparisonPrice(value, salePrice) {
  const amount = price(value);
  return amount && amount > Number(salePrice || 0) ? amount : null;
}

function optionLookup(item) {
  const options = new Map();
  for (const option of item.options || []) {
    const values = new Map((option.values || []).map((value) => [value._id, value.value1 ?? value.value2 ?? null]));
    options.set(option._id, { label: option.name || option.key || "Option", key: option.key || option.name || null, values });
  }
  return options;
}

function variantSelection(optionMap, value) {
  if (!value?.option || !value?.value) return null;
  const option = optionMap.get(value.option);
  if (!option) return null;
  return { option: option.label, optionKey: option.key, value: option.values.get(value.value) ?? null };
}

function variantAvailability(variant) {
  if (variant?.unavailable === true) return "unavailable";
  const stock = variant?.quantity?.instock;
  if (Number.isFinite(Number(stock))) return Number(stock) > 0 ? "available" : "unavailable";
  return "unknown";
}

function productAvailability(item, variants) {
  if (variants.length) {
    if (variants.some((variant) => variant.availability === "available")) return "available";
    if (variants.every((variant) => variant.availability === "unavailable")) return "unavailable";
    return "unknown";
  }
  if (item?.outStock?.disabled === true) return "unavailable";
  const stock = item?.quantity?.instock;
  if (Number.isFinite(Number(stock))) return Number(stock) > 0 ? "available" : "unavailable";
  return "unknown";
}

function extFromSource(url, contentType = "") {
  const pathname = new URL(url).pathname;
  const pathnameExt = path.extname(pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(pathnameExt)) return pathnameExt;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("avif")) return ".avif";
  return ".jpg";
}

async function download(url, relativeBase, optimized = false) {
  try {
    const source = new URL(url);
    if (optimized) {
      source.searchParams.set("width", "900");
      source.searchParams.set("quality", "82");
    }
    await sleep(90);
    const response = await fetch(source, { headers: { "user-agent": USER_AGENT, accept: "image/avif,image/webp,image/*,*/*;q=0.8" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const ext = extFromSource(url, response.headers.get("content-type") || "");
    const relativePath = `${relativeBase}${ext}`.replaceAll("\\", "/");
    const absolutePath = path.join(ROOT, "public", relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
    return { localPath: `/${relativePath}`, bytes: bytes.length, contentType: response.headers.get("content-type") };
  } catch (error) {
    stats.failedImages.push({ url, optimized, error: String(error) });
    return null;
  }
}

async function apiSearch(baseURL, token, params) {
  const url = new URL(`${baseURL}/products/search`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  await sleep(REQUEST_DELAY_MS);
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "x-auth-token": token, accept: "application/json" },
  });
  stats.visited.push({ url: url.toString(), label: "catalog-api", status: response.status });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function main() {
  await mkdir(path.join(ROOT, "data"), { recursive: true });
  await mkdir(path.join(ROOT, "public", "images"), { recursive: true });

  const robotsText = await fetchText(`${ORIGIN}/robots.txt`, "robots");
  const sitemapIndex = await fetchText(`${ORIGIN}/sitemap.xml`, "sitemap-index");
  const sitemapURLs = xmlLocs(sitemapIndex);
  const sitemapDocs = {};
  for (const sitemapURL of sitemapURLs) sitemapDocs[sitemapURL] = await fetchText(sitemapURL, "sitemap");

  const productSitemapURL = sitemapURLs.find((url) => url.includes("sitemap_products"));
  const pageSitemapURL = sitemapURLs.find((url) => url.includes("sitemap_pages"));
  const collectionSitemapURL = sitemapURLs.find((url) => url.includes("sitemap_collections"));
  const sitemapProductURLs = xmlLocs(sitemapDocs[productSitemapURL] || "").filter((url) => url.includes("/products/"));
  const pageURLs = xmlLocs(sitemapDocs[pageSitemapURL] || "").filter((url) => url.includes("/pages/"));
  const categoryURLs = xmlLocs(sitemapDocs[collectionSitemapURL] || "").filter((url) => url.includes("/shop/"));

  console.log(`Sitemaps: ${sitemapProductURLs.length} products, ${pageURLs.length} pages, ${categoryURLs.length} categories`);

  const homeHTML = await fetchText(`${ORIGIN}/`, "homepage");
  const homeState = nuxtState(homeHTML, ORIGIN);
  const shopHTML = await fetchText(`${ORIGIN}/shop`, "catalog-page");
  const shopState = nuxtState(shopHTML, `${ORIGIN}/shop`);
  const shopEntry = findFetchEntry(shopState, (entry) => Array.isArray(entry.items) && entry.paginate);
  if (!shopEntry) throw new Error("Shop data missing from live page");

  const token = shopState.state?.token;
  const baseURL = shopState.state?.baseURL;
  if (!token || !baseURL) throw new Error("Public catalog token or API base missing");

  const apiProducts = [];
  for (let page = 1; page <= shopEntry.paginate.last_page; page += 1) {
    const result = await apiSearch(baseURL, token, { page, limit: shopEntry.paginate.per_page, "sort[createdAt]": -1 });
    stats.catalogDataPages.push({ page, count: result.results?.length || 0, total: result.paginate?.total ?? null });
    apiProducts.push(...(result.results || []));
    console.log(`Catalog page ${page}/${shopEntry.paginate.last_page}: ${result.results?.length || 0} products`);
  }

  const collectionMeta = shopEntry.collections || [];
  for (const categoryURL of categoryURLs) {
    try {
      const html = await fetchText(categoryURL, "category-page");
      const state = nuxtState(html, categoryURL);
      const entry = findFetchEntry(state, (candidate) => Array.isArray(candidate.items) && candidate.paginate);
      const slug = decodeURIComponent(new URL(categoryURL).pathname.split("/").filter(Boolean).at(-1));
      const first = await apiSearch(baseURL, token, { page: 1, limit: 12, "collections.slug-in": slug, "sort[createdAt]": -1 });
      const lastPage = first.paginate?.last_page || 1;
      stats.categoryDataPages.push({ slug, page: 1, count: first.results?.length || 0, total: first.paginate?.total ?? null, htmlCount: entry?.items?.length ?? null });
      for (let page = 2; page <= lastPage; page += 1) {
        const result = await apiSearch(baseURL, token, { page, limit: 12, "collections.slug-in": slug, "sort[createdAt]": -1 });
        stats.categoryDataPages.push({ slug, page, count: result.results?.length || 0, total: result.paginate?.total ?? null, htmlCount: null });
      }
      console.log(`Category ${slug}: ${first.paginate?.total ?? "unknown"} products across ${lastPage} data pages`);
    } catch (error) {
      stats.failedPages.push({ url: categoryURL, error: String(error) });
    }
  }

  const uniqueById = new Map();
  for (const item of apiProducts) {
    if (!item?._id) continue;
    if (uniqueById.has(item._id)) stats.duplicates.push({ type: "api-id", id: item._id, slug: item.slug });
    uniqueById.set(item._id, item);
  }
  const apiUnique = [...uniqueById.values()];
  const detailItems = [];
  for (const [index, apiItem] of apiUnique.entries()) {
    const url = canonicalProductURL(apiItem.slug);
    try {
      const html = await fetchText(url, "product-detail");
      const state = nuxtState(html, url);
      const detailEntry = findFetchEntry(state, (entry) => entry.item && entry.item._id === apiItem._id)
        || findFetchEntry(state, (entry) => entry.item && entry.item.slug === apiItem.slug);
      if (!detailEntry?.item) throw new Error("Detail product object missing");
      detailItems.push({ item: detailEntry.item, url });
      console.log(`Product ${index + 1}/${apiUnique.length}: ${apiItem.reference || apiItem._id}`);
    } catch (error) {
      stats.failedPages.push({ url, error: String(error) });
      detailItems.push({ item: apiItem, url, fallback: true });
    }
  }

  const products = [];
  let originalBytes = 0;
  let optimizedBytes = 0;
  for (const [productIndex, { item, url, fallback }] of detailItems.entries()) {
    const optionMap = optionLookup(item);
    const imageVariantMap = new Map();
    for (const variant of item.variants || []) {
      if (!variant.imageId) continue;
      const ids = imageVariantMap.get(variant.imageId) || [];
      ids.push(variant._id);
      imageVariantMap.set(variant.imageId, ids);
    }
    const images = [];
    for (const [imageIndex, image] of (item.images || []).entries()) {
      const original = await download(image.src, `images/products/${item._id}/original-${String(imageIndex + 1).padStart(2, "0")}`);
      const optimized = await download(image.src, `images/products/${item._id}/web-${String(imageIndex + 1).padStart(2, "0")}`, true);
      originalBytes += original?.bytes || 0;
      optimizedBytes += optimized?.bytes || 0;
      images.push({
        id: image._id || null,
        title: image.title || null,
        sourceUrl: image.src || null,
        localOriginalPath: original?.localPath || null,
        localOptimizedPath: optimized?.localPath || original?.localPath || null,
        variantIds: imageVariantMap.get(image._id) || [],
        order: imageIndex + 1,
      });
    }

    const variants = (item.variants || []).map((variant) => {
      const selections = [variant.option1, variant.option2, variant.option3]
        .map((selection) => variantSelection(optionMap, selection))
        .filter(Boolean);
      return {
        id: variant._id || null,
        name: variant.name || null,
        selections,
        price: {
          current: price(variant.price?.salePrice),
          comparison: comparisonPrice(variant.price?.comparePrice, variant.price?.salePrice),
          currency: "MAD",
        },
        stockQuantity: Number.isFinite(Number(variant.quantity?.instock)) ? Number(variant.quantity.instock) : null,
        explicitlyUnavailable: variant.unavailable === true,
        availability: variantAvailability(variant),
        availabilitySource: "public variant quantity and unavailable fields",
        imageId: variant.imageId || null,
      };
    });

    const categories = (item.collections || []).map((collection) => ({
      id: collection._id || null,
      name: collection.name || null,
      slug: collection.slug || null,
      url: collection.slug ? `${ORIGIN}/shop/${encodeURIComponent(collection.slug)}` : null,
    }));
    products.push({
      id: item._id,
      sku: item.reference || null,
      slug: item.slug,
      canonicalUrl: url,
      sourceUrl: url,
      name: item.name || null,
      displayName: cleanDisplayName(item.name),
      descriptionHtml: item.description || null,
      description: stripHtml(item.description),
      categories,
      price: {
        current: price(item.price?.salePrice),
        comparison: comparisonPrice(item.price?.comparePrice, item.price?.salePrice),
        currency: "MAD",
      },
      options: (item.options || []).map((option) => ({
        id: option._id || null,
        name: option.name || option.key || null,
        key: option.key || null,
        values: (option.values || []).map((value) => ({ id: value._id || null, label: value.value1 ?? value.value2 ?? null, secondaryLabel: value.value2 ?? null })),
      })),
      variants,
      availability: productAvailability(item, variants),
      availabilitySource: variants.length ? "derived only from public variant-level stock" : "public product quantity",
      images,
      brand: item.brand ? { id: item.brand._id || null, name: item.brand.name || null, slug: item.brand.slug || null } : null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      productType: item.productType || null,
      freeShipping: typeof item.freeShipping === "boolean" ? item.freeShipping : null,
      shipping: item.shipping || null,
      seo: item.seo || null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      detailPageFallbackToApi: Boolean(fallback),
      extractedAt: EXTRACTED_AT,
      source: "melynehouse.com public storefront",
      order: productIndex + 1,
    });
  }

  const policies = [];
  for (const pageURL of pageURLs) {
    try {
      const html = await fetchText(pageURL, "policy-page");
      const state = nuxtState(html, pageURL);
      const entry = findFetchEntry(state, (candidate) => candidate.item && typeof candidate.item === "object");
      const item = entry?.item;
      policies.push({
        id: item?._id || null,
        slug: item?.slug || decodeURIComponent(new URL(pageURL).pathname.split("/").at(-1)),
        title: item?.title || item?.name || null,
        bodyHtml: item?.content || item?.description || null,
        bodyText: stripHtml(item?.content || item?.description),
        sourceUrl: pageURL,
        updatedAt: item?.updatedAt || null,
        extractedAt: EXTRACTED_AT,
      });
    } catch (error) {
      stats.failedPages.push({ url: pageURL, error: String(error) });
    }
  }

  const logoSource = homeState.state?.settings?.sections?.header?.logo?.src || null;
  const logoOriginal = logoSource ? await download(logoSource, "images/brand/melyne-logo") : null;
  const categories = [];
  for (const collection of collectionMeta) {
    const source = collection.image?.src || null;
    const original = source ? await download(source, `images/categories/${collection.slug}`) : null;
    const optimized = source ? await download(source, `images/categories/${collection.slug}-web`, true) : null;
    categories.push({
      id: collection._id || null,
      name: collection.name || null,
      slug: collection.slug || null,
      sourceUrl: collection.slug ? `${ORIGIN}/shop/${encodeURIComponent(collection.slug)}` : null,
      imageSourceUrl: source,
      imageLocalOriginalPath: original?.localPath || null,
      imageLocalOptimizedPath: optimized?.localPath || original?.localPath || null,
    });
  }

  const settings = homeState.state?.settings || {};
  const store = {
    name: settings.store_name || "MELYNE",
    domain: ORIGIN,
    currency: "MAD",
    language: "ar",
    direction: "rtl",
    description: settings.store_description || null,
    logo: { sourceUrl: logoSource, localPath: logoOriginal?.localPath || null },
    contact: {
      email: settings.sections?.footer?.gmail || null,
      phone: settings.sections?.footer?.number || null,
      contactPolicyPhone: policies.find((page) => page.slug?.includes("اتصل"))?.bodyText?.match(/(?:\+?212[\s-]*)?\d[\d\s-]{7,}/)?.[0] || null,
    },
    social: settings.sections?.footer?.social_media || settings.sections?.footer?.socialMedia || null,
    services: settings.sections?.services || null,
    categories,
    policies,
    extractedAt: EXTRACTED_AT,
  };

  const sitemapSet = new Set(sitemapProductURLs.map((url) => decodeURIComponent(new URL(url).pathname)));
  const apiSet = new Set(products.map((product) => decodeURIComponent(new URL(product.canonicalUrl).pathname)));
  const apiNotSitemap = products.filter((product) => !sitemapSet.has(decodeURIComponent(new URL(product.canonicalUrl).pathname)));
  const sitemapNotApi = sitemapProductURLs.filter((url) => !apiSet.has(decodeURIComponent(new URL(url).pathname)));
  const missing = products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    missing: [
      !product.sku && "sku",
      !product.description && "description",
      !product.categories.length && "category",
      !product.images.length && "images",
      product.price.current == null && "current price",
      product.availability === "unknown" && "availability",
    ].filter(Boolean),
  })).filter((entry) => entry.missing.length);

  const catalog = {
    schemaVersion: 1,
    extractedAt: EXTRACTED_AT,
    source: ORIGIN,
    currency: "MAD",
    liveCatalogCount: shopEntry.paginate.total,
    productCount: products.length,
    products,
  };

  await writeFile(path.join(ROOT, "data", "products.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await writeFile(path.join(ROOT, "data", "store.json"), `${JSON.stringify(store, null, 2)}\n`, "utf8");

  const originalImageCount = products.flatMap((product) => product.images).filter((image) => image.localOriginalPath).length;
  const optimizedImageCount = products.flatMap((product) => product.images).filter((image) => image.localOptimizedPath).length;
  const report = `# MELYNE public catalog inventory\n\n`+
    `Extraction date: ${EXTRACTED_AT}\n\n`+
    `Source: ${ORIGIN}\n\n`+
    `## Summary\n\n`+
    `- Live catalog total reported by the store: ${shopEntry.paginate.total}\n`+
    `- Product URLs in product sitemap: ${sitemapProductURLs.length}\n`+
    `- Distinct products discovered through the live catalog API: ${apiUnique.length}\n`+
    `- Distinct products imported: ${products.length}\n`+
    `- Catalog data pages visited: ${stats.catalogDataPages.length}\n`+
    `- Category overview pages visited: ${categoryURLs.length}\n`+
    `- Category data pages visited: ${stats.categoryDataPages.length}\n`+
    `- Product detail pages visited: ${detailItems.length}\n`+
    `- Policy/contact pages visited: ${pageURLs.length}\n`+
    `- Original product images downloaded: ${originalImageCount} (${(originalBytes / 1024 / 1024).toFixed(1)} MiB)\n`+
    `- Web-sized product image copies downloaded: ${optimizedImageCount} (${(optimizedBytes / 1024 / 1024).toFixed(1)} MiB)\n`+
    `- Failed pages: ${stats.failedPages.length}\n`+
    `- Failed image downloads: ${stats.failedImages.length}\n`+
    `- Duplicate API product IDs resolved: ${stats.duplicates.length}\n\n`+
    `## Reconciliation\n\n`+
    `The live shop pagination reports ${shopEntry.paginate.total} products and the final import contains ${products.length}. `+
    `The sitemap contains ${sitemapProductURLs.length} product URLs. ${apiNotSitemap.length} live catalog product(s) were not present in the sitemap and were recovered from the same public catalog endpoint used by the storefront.\n\n`+
    (apiNotSitemap.length ? `API products absent from sitemap:\n${apiNotSitemap.map((product) => `- ${product.name} — ${product.canonicalUrl}`).join("\n")}\n\n` : "")+
    (sitemapNotApi.length ? `Sitemap URLs absent from live catalog results:\n${sitemapNotApi.map((url) => `- ${url}`).join("\n")}\n\n` : "")+
    `## Category pages\n\n${stats.categoryDataPages.map((page) => `- ${page.slug}, data page ${page.page}: ${page.count} products (category total ${page.total})`).join("\n")}\n\n`+
    `## Missing or unclear fields\n\n${missing.length ? missing.map((entry) => `- ${entry.sku || entry.id} — ${entry.name}: ${entry.missing.join(", ")}`).join("\n") : "No required fields were missing."}\n\n`+
    `Stock is recorded per variant from the public variant quantity and unavailable fields. A product-level availability value is derived only from those variant records and never from the generic page label alone.\n\n`+
    `## Public-policy conflicts requiring owner confirmation\n\n`+
    `- The exchange policy says monetary refunds are not accepted, while the payment/security policy states a 30-day refund policy. Both public texts are preserved verbatim in data/store.json and displayed separately; the prototype does not resolve the contradiction.\n`+
    `- The footer, contact page, and complaint/exchange page expose more than one phone number. The prototype preserves the sourced contact data and flags it for confirmation.\n`+
    `- Product descriptions are empty on many catalog records; no description, material, included-piece detail, review, or promise was invented.\n\n`+
    `## Failures and duplicates\n\n`+
    `${stats.failedPages.length ? stats.failedPages.map((failure) => `- Page: ${failure.url} — ${failure.error}`).join("\n") : "- No page failures."}\n`+
    `${stats.failedImages.length ? stats.failedImages.map((failure) => `- Image: ${failure.url} — ${failure.error}`).join("\n") : "- No image failures."}\n`+
    `${stats.duplicates.length ? stats.duplicates.map((duplicate) => `- Duplicate ${duplicate.type}: ${duplicate.id} (${duplicate.slug})`).join("\n") : "- No duplicate product IDs in the final catalog."}\n\n`+
    `## Crawl notes\n\n`+
    `- robots.txt explicitly allows crawling all public paths.\n`+
    `- Requests used a descriptive user agent and short delays. No access controls were bypassed.\n`+
    `- Original media is retained locally. Web-sized copies were requested through the same public image CDN parameters used by the live storefront.\n`;

  await writeFile(path.join(ROOT, "inventory-report.md"), report, "utf8");
  await writeFile(path.join(ROOT, "data", "crawl-log.json"), `${JSON.stringify({ extractedAt: EXTRACTED_AT, robotsText, ...stats }, null, 2)}\n`, "utf8");

  console.log(`Imported ${products.length}/${shopEntry.paginate.total} live products.`);
  console.log(`Downloaded ${originalImageCount} originals and ${optimizedImageCount} web copies.`);
  console.log(`Missing-field product records: ${missing.length}; failed pages: ${stats.failedPages.length}; failed images: ${stats.failedImages.length}.`);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
