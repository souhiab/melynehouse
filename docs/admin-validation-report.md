# Owner dashboard validation report

Date: 2026-09-27  
Scope: local development only; the live MELYNE website, domain, and Google Sheet were not accessed or modified.

## Preserved migration baseline

- Source catalog SHA-256: `35565ab888a11acbbdae28a32fbeb645e665d3e028e400edc1e6efb2d2e964b4`
- Products: 34/34
- Variants: 468/468
- Ordered images: 207/207
- Category membership, variant IDs, image IDs, image ordering and variant-to-image associations: preserved by automated comparison.

## Real PostgreSQL acceptance

PostgreSQL 17.11 was installed from the EDB-certified Windows installer linked by the official PostgreSQL Windows download page. The local Windows service is `postgresql-x64-17-melyne`; `listen_addresses` is restricted to localhost. The acceptance database is `melyne_dev`, owned by the dedicated `melyne_app` role.

Commands executed:

```powershell
npm run local:env
npm run db:local:setup
npm run db:migrate
npm run db:import-catalog
npm run admin:create
npm run db:verify
npm run db:acceptance:mutate
# API stopped; Windows PostgreSQL service restarted; API started again
npm run db:acceptance:verify
npm run db:import-catalog  # expected refusal on a non-empty database
npm run db:verify
```

Results from the actual PostgreSQL server:

- Migrations applied: `001_initial`, `002_owner_dashboard_hardening`.
- Products: 34; variants: 468; ordered product images: 207.
- All 468 variant-to-product and variant-to-image associations compared with `data/products.json`.
- Initial featured order exactly matched the first eight imported stable product IDs.
- Seeded published banner `00000000-0000-4000-8000-000000000001` remained at position 1.
- Owner edit persisted; product archival removed it publicly; editing it back to `published` recovered the same stable product and associations.
- The first two children products were reordered and the category positions persisted.
- A JPEG was uploaded to persistent storage and attached to a draft acceptance banner.
- COD test order `MLY-20260926-0F575A` was calculated and saved by the API with Sheet synchronization `disabled`.
- After stopping the API, restarting the Windows PostgreSQL service, and starting the API again, the edit, recovered status, reorder, banner, uploaded file, and COD order all still existed.
- Direct post-restart counts remained 34 products, 468 variants, 207 images, and one persisted acceptance order.
- A second ordinary import exited with code 1 and `Catalog already contains 34 products; refusing a destructive re-import`; the following direct verification still found exactly 34/468/207, so nothing was duplicated.

## Additional automated workflows

- Owner session, password hashing, origin restriction and CSRF enforcement.
- Product creation, edit, public reflection and recoverable archival.
- Per-category movement and independent homepage-feature ordering.
- Image upload, preview URL, stable-ID replacement and image reordering.
- Banner creation, edit, publication, public reflection and archival.
- COD creation with database price/availability validation and private customer data.
- Google Sheet synchronization state visible to the admin; the optional order copy uses a server-side HMAC signature and remains disabled until a secure owner webhook is configured.
- Actual uploaded files remain servable after a simulated application restart; upload backups include a SHA-256 manifest.
- Existing Sites worker behavior and build artifact requirements remain intact.

`npm run check` passes catalog validation, nine isolated admin/migration/security regression tests, four Sites tests and the Vite 6.4.3 production build. These isolated tests remain regression coverage only and are not represented as real PostgreSQL acceptance. `npm audit --audit-level=high` reports zero known vulnerabilities.

## Failures and corrections

- The first post-workflow `db:verify` run assumed exactly one banner and reported `seeded banner` after the acceptance workflow correctly created a second draft banner. The verifier was corrected to locate and validate the seeded banner by its stable ID while allowing owner-created banners. The rerun passed with two banners and no failures.
- Git was initially not resolvable through the automation process PATH. Git for Windows was made available, and the repository was initialized using its explicit executable path.
- One local HTTP smoke-test command used PowerShell's reserved `$HOME` variable name and produced a shell error without changing application state. It was rerun with `$homeStatus`; `/`, `/owner`, and the proxied storefront API returned HTTP 200 with 34 public products, eight featured products, and one published banner.

## Remaining limitation

The required in-app browser was not connected in this environment. Consequently browser screenshots and a human visual/crop review remain pending, although the production bundle compiled successfully and the routes/API passed HTTP checks.

