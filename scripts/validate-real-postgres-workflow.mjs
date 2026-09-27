import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const phase = process.argv[2];
if (!["mutate", "verify"].includes(phase)) throw new Error("Use mutate or verify");
const root = path.resolve(import.meta.dirname, "..");
const statePath = path.join(root, "var", "local-secrets", "real-postgres-acceptance.json");
const baseUrl = "http://127.0.0.1:8788";

async function responseJson(response) {
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${response.url}: ${body?.error || "request failed"}`);
  return body;
}

async function login() {
  const response = await fetch(`${baseUrl}/api/admin/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.MELYNE_ADMIN_EMAIL, password: process.env.MELYNE_ADMIN_PASSWORD }) });
  const body = await responseJson(response);
  const cookies = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  const csrfCookie = cookies.find((value) => value.startsWith("melyne_owner_csrf="));
  if (!csrfCookie) throw new Error("CSRF cookie was not returned");
  return { body, cookie: cookies.join("; "), csrf: decodeURIComponent(csrfCookie.split("=").slice(1).join("=")) };
}

async function adminFetch(session, route, options = {}) {
  return responseJson(await fetch(`${baseUrl}${route}`, { ...options, headers: { cookie: session.cookie, ...(options.body instanceof FormData ? {} : options.body ? { "content-type": "application/json" } : {}), ...(!["GET", "HEAD"].includes(options.method || "GET") ? { "x-csrf-token": session.csrf } : {}), ...(options.headers || {}) } }));
}

const productPayload = (product, changes = {}) => ({
  sku: product.sku || null,
  slug: product.slug,
  originalName: product.name,
  displayName: product.displayName,
  description: product.description || null,
  descriptionHtml: product.descriptionHtml || null,
  priceMad: product.price.current,
  comparisonPriceMad: product.price.comparison,
  availability: product.availability,
  status: product.status,
  categorySlugs: product.categories.map((category) => category.slug),
  options: product.options || [],
  variants: product.variants.map((variant) => ({ id: variant.id, name: variant.name, selections: variant.selections, priceMad: variant.price.current, comparisonPriceMad: variant.price.comparison, stockQuantity: variant.stockQuantity, available: variant.availability === "available", imageId: variant.imageId || null })),
  featured: Boolean(product.featured),
  ...changes,
});

if (phase === "mutate") {
  const session = await login();
  const adminProducts = (await adminFetch(session, "/api/admin/products")).products;
  const storefront = await responseJson(await fetch(`${baseUrl}/api/public/storefront`));
  const kids = adminProducts.filter((product) => product.status !== "archived" && product.categories.some((category) => category.slug === "kids")).sort((a, b) => a.categoryPositions.kids - b.categoryPositions.kids || a.id.localeCompare(b.id));
  if (kids.length < 2) throw new Error("At least two children products are required for ordering acceptance");
  const product = kids[0];
  const originalPayload = productPayload(product);
  const editedName = `${product.displayName} — اختبار PostgreSQL محلي`;
  await adminFetch(session, `/api/admin/products/${product.id}`, { method: "PUT", body: JSON.stringify({ ...originalPayload, displayName: editedName }) });
  await adminFetch(session, `/api/admin/products/${product.id}/archive`, { method: "POST", body: "{}" });
  const archivedPublic = await responseJson(await fetch(`${baseUrl}/api/public/storefront`));
  if (archivedPublic.products.some((item) => item.id === product.id)) throw new Error("Archived product remained public");
  await adminFetch(session, `/api/admin/products/${product.id}`, { method: "PUT", body: JSON.stringify({ ...originalPayload, displayName: editedName, status: "published" }) });

  const reorderedIds = [kids[1].id, kids[0].id, ...kids.slice(2).map((item) => item.id)];
  await adminFetch(session, "/api/admin/product-order", { method: "PUT", body: JSON.stringify({ scope: "category", categorySlug: "kids", orderedProductIds: reorderedIds }) });

  const imageBytes = await fs.readFile(path.join(root, "public", "images", "reference", "category-kids-web.jpg"));
  const uploadBody = new FormData();
  uploadBody.append("image", new Blob([imageBytes], { type: "image/jpeg" }), "local-postgres-banner.jpg");
  uploadBody.append("purpose", "real-postgres-acceptance-banner");
  const upload = await adminFetch(session, "/api/admin/uploads", { method: "POST", body: uploadBody });
  const banner = await adminFetch(session, "/api/admin/banners", { method: "POST", body: JSON.stringify({ headingAr: "اختبار PostgreSQL محلي", supportingTextAr: "واجهة اختبار غير منشورة", buttonLabelAr: "تسوق", destinationUrl: "/shop", desktopImageUrl: upload.publicUrl, mobileImageUrl: upload.publicUrl, imageAltAr: "صورة اختبار محلية", status: "draft", activeFrom: null, activeUntil: null }) });

  const orderProduct = storefront.products.find((item) => item.variants.some((variant) => variant.availability === "available" && (variant.stockQuantity == null || variant.stockQuantity > 0)));
  const orderVariant = orderProduct?.variants.find((variant) => variant.availability === "available" && (variant.stockQuantity == null || variant.stockQuantity > 0));
  if (!orderProduct || !orderVariant) throw new Error("No available order variant found");
  const order = await responseJson(await fetch(`${baseUrl}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customer: { name: "اختبار محلي فقط", phone: "0600000000", city: "الدار البيضاء", address: "عنوان اختبار PostgreSQL المحلي" }, note: "LOCAL POSTGRESQL ACCEPTANCE TEST", items: [{ productId: orderProduct.id, variantId: orderVariant.id, quantity: 1 }] }) }));
  if (order.sheetSyncStatus !== "disabled") throw new Error("Google Sheet synchronization must remain disabled");

  const state = { createdAt: new Date().toISOString(), productId: product.id, originalDisplayName: product.displayName, editedName, categorySlug: "kids", reorderedIds, bannerId: banner.id, bannerImageUrl: upload.publicUrl, bannerAssetId: upload.id, orderId: order.id, orderNumber: order.orderNumber, orderTotalMad: order.totalMad };
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ phase, owner: session.body.email, editedProduct: product.id, archivedAndRecovered: true, reorderedFirstTwo: reorderedIds.slice(0, 2), uploadedBanner: banner.id, uploadedBannerImage: upload.publicUrl, codOrder: order.orderNumber, sheetSyncStatus: order.sheetSyncStatus, result: "PASS" }, null, 2));
}

if (phase === "verify") {
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  const session = await login();
  const adminProducts = (await adminFetch(session, "/api/admin/products")).products;
  const product = adminProducts.find((item) => item.id === state.productId);
  const kids = adminProducts.filter((item) => item.status !== "archived" && item.categories.some((category) => category.slug === state.categorySlug)).sort((a, b) => a.categoryPositions[state.categorySlug] - b.categoryPositions[state.categorySlug] || a.id.localeCompare(b.id));
  const banners = (await adminFetch(session, "/api/admin/banners")).banners;
  const orders = (await adminFetch(session, "/api/admin/orders")).orders;
  const image = await fetch(`${baseUrl}${state.bannerImageUrl}`);
  const failures = [];
  if (!product || product.displayName !== state.editedName || product.status !== "published" || product.archivedAt) failures.push("owner edit/recoverable archive");
  if (JSON.stringify(kids.slice(0, 2).map((item) => item.id)) !== JSON.stringify(state.reorderedIds.slice(0, 2))) failures.push("category reorder");
  if (!banners.some((banner) => banner.id === state.bannerId && banner.desktopImageUrl === state.bannerImageUrl && banner.status === "draft")) failures.push("banner record");
  if (!image.ok) failures.push("persistent banner upload");
  if (!orders.some((order) => order.id === state.orderId && order.order_number === state.orderNumber && order.sheet_sync_status === "disabled")) failures.push("COD order persistence");

  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const direct = await db.query("SELECT (SELECT COUNT(*) FROM products)::int products,(SELECT COUNT(*) FROM product_variants)::int variants,(SELECT COUNT(*) FROM product_images)::int images,(SELECT COUNT(*) FROM orders WHERE id=$1)::int test_order", [state.orderId]);
  await db.end();
  if (direct.rows[0].products !== 34 || direct.rows[0].variants !== 468 || direct.rows[0].images !== 207 || direct.rows[0].test_order !== 1) failures.push("direct PostgreSQL persistence counts");
  console.log(JSON.stringify({ phase, productEditPersisted: product?.displayName === state.editedName, productRecovered: product?.status === "published" && !product?.archivedAt, reorderPersisted: !failures.includes("category reorder"), bannerPersisted: !failures.includes("banner record"), uploadServed: image.ok, orderPersisted: !failures.includes("COD order persistence"), directPostgres: direct.rows[0], failures, result: failures.length ? "FAIL" : "PASS" }, null, 2));
  if (failures.length) process.exitCode = 1;
}
