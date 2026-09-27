import vm from "node:vm";

const url = process.argv[2] || "https://melynehouse.com/";
const response = await fetch(url, {
  headers: { "user-agent": "Mozilla/5.0 (compatible; MelyneCatalogAudit/1.0)" },
});
if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
const html = await response.text();
const match = html.match(/<script>window\.__NUXT__=([\s\S]*?)<\/script>/);
if (!match) throw new Error(`Nuxt state not found: ${url}`);
const expression = match[1].trim().replace(/;$/, "");
const state = vm.runInNewContext(`(${expression})`, Object.create(null), { timeout: 5_000 });

console.log("top keys", Object.keys(state));
console.log("fetch keys", Object.keys(state.fetch || {}));
for (const [fetchKey, fetchValue] of Object.entries(state.fetch || {})) {
  if (!fetchValue || typeof fetchValue !== "object") continue;
  const summary = Object.fromEntries(Object.entries(fetchValue).filter(([, value]) => value == null || ["string", "number", "boolean"].includes(typeof value)));
  console.log("fetch entry", fetchKey, "keys", Object.keys(fetchValue), "primitives", summary);
  if (fetchValue.paginate || fetchValue.params || fetchValue.lastParams || fetchValue.query) {
    console.dir({ paginate: fetchValue.paginate, params: fetchValue.params, lastParams: fetchValue.lastParams, query: fetchValue.query }, { depth: 6, maxArrayLength: 20 });
  }
}

function visit(value, path = "state", seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    const productish = value.filter((item) => item && typeof item === "object" && item.slug && item.name);
    if (productish.length) {
      console.log("product array", path, "length", value.length, "productish", productish.length);
      console.dir(productish.slice(0, 2).map(({ _id, reference, slug, name, images, variants, options, collections }) => ({
        _id,
        reference,
        slug,
        name,
        images: images?.length,
        variants: variants?.length,
        options: options?.map((option) => ({ key: option.key, name: option.name, values: option.values?.map((entry) => entry.value1) })),
        collections,
      })), { depth: 8 });
    }
    value.forEach((item, index) => visit(item, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`, seen);
}

visit(state);

if (process.argv.includes("--api")) {
  const baseURL = state.state?.baseURL;
  const token = state.state?.token;
  for (const path of ["/products", "/products/search", "/search/products"]) {
    for (const authorization of [token, `Bearer ${token}`]) {
      const apiURL = new URL(`${baseURL}${path}`);
      apiURL.searchParams.set("page", "2");
      apiURL.searchParams.set("limit", "12");
      const apiResponse = await fetch(apiURL, { headers: { "x-auth-token": token, authorization } });
      const body = await apiResponse.text();
      console.log("api probe", path, authorization.startsWith("Bearer") ? "bearer" : "raw", apiResponse.status, body.slice(0, 250));
    }
  }
}
