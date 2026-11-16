# Owner dashboard and PostgreSQL setup

This work is local/staging only. Nothing here deploys to or replaces `melynehouse.com`.

## 1. Current local development setup

This workstation now runs PostgreSQL 17.11 as the Windows service `postgresql-x64-17-melyne`. Local secrets are in the ignored `.env` and `var/local-secrets/`; the owner login is recorded in `var/local-secrets/owner-login.txt`. Do not commit or share those files.

To start the complete local application:

```powershell
npm run dev
```

Open `http://localhost:5173/owner` and use the credentials in `var/local-secrets/owner-login.txt`. PostgreSQL starts automatically with Windows. Google Sheet synchronization is disabled because both Sheet variables are empty.

Useful local verification commands:

```powershell
npm run db:verify
npm run db:acceptance:verify
npm run check
```

## 2. Recreating the separate database

With PostgreSQL 16+ available, create a dedicated role and database (choose a unique strong password):

```sql
CREATE ROLE melyne_app LOGIN PASSWORD '<strong generated password>';
CREATE DATABASE melyne_dev OWNER melyne_app ENCODING 'UTF8';
REVOKE ALL ON DATABASE melyne_dev FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE melyne_dev TO melyne_app;
```

For a local/staging database with Docker available, the included database-only Compose file creates a named persistent volume and binds PostgreSQL to localhost:

```powershell
$env:POSTGRES_PASSWORD='<strong generated password>'
docker compose -f docker-compose.staging.yml up -d
```

Docker was not available on the implementation workstation, so this path is provided but was not executed here.

Copy `.env.example` to an untracked `.env`, set `DATABASE_URL`, a 32+ character `MELYNE_SESSION_SECRET`, owner credentials, and persistent paths outside the deploy directory. Never use a `VITE_` variable for credentials.

For a fresh local machine, `npm run local:env` generates ignored local-only credentials and `npm run db:local:setup` creates `melyne_app` and `melyne_dev` after the official Windows PostgreSQL installer is installed.

## 3. Migrate without losing the imported catalog

```powershell
$env:DATABASE_URL='postgresql://...'
npm run db:migrate
npm run db:import-catalog
npm run admin:create
```

The importer refuses to run into a non-empty product table unless `--update` is explicitly supplied. Its completion assertion requires exactly 34 products, 468 variants and 207 images. The pre-migration checksum and all stable associations are in `data/catalog-migration-manifest.json`.

## 4. Run locally

`npm run dev` starts the API on `127.0.0.1:8788` and Vite on its printed local URL. Open `/owner` for the authenticated dashboard. The owner can manage products, variant availability, image order/uploads, category and featured order, banners, and private COD orders. The checkout is still labelled as a prototype and must remain on local/staging until the real notification, fulfillment and payment workflow is approved.

## 5. Persistent uploads and backups

`MELYNE_UPLOAD_ROOT` must point to a mounted/persistent directory outside `dist` and outside ephemeral application releases. A deploy replaces only application files. Back up uploads with `npm run uploads:backup`; each copy includes `backup-manifest.json` with file sizes and SHA-256 checksums. Back up PostgreSQL with `npm run db:backup`. Store backups on encrypted media with restricted access; database dumps include private customer data. Test restoration on staging before relying on the schedule.

Recommended schedule: PostgreSQL daily plus before each deployment; uploads after each media change and daily. Retain at least seven daily and four weekly copies.

Restore uploads by copying the contents of a verified `uploads-*` backup back to the configured upload root while the API is stopped, excluding the manifest. Restore the database to an empty staging database with `pg_restore --clean --if-exists --no-owner --dbname <staging-url> <dump-file>`, then verify counts and admin workflows before any production recovery.

## 6. Google Sheets order copy

The local development configuration leaves `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_WEBHOOK_SECRET` empty, and `SHEET_SYNC_ENABLED` defaults to false. New website orders now record an immutable creation event in PostgreSQL even while delivery is disabled. Historical and manual orders are not automatically queued. Do not configure a real Sheet for local testing.

Checkout does not contact Google. `npm run orders:sync-worker` runs the separate worker; `npm run orders:sync-sheets` processes at most one due event and exits. Both safely exit without sending when disabled. The owner retry action requeues eligible failed events through this same worker; it never reconstructs or directly sends an order. See [Phase 1 setup and contract](order-sync-foundation.md) before enabling a synthetic test destination. Real connection requires separate approval, verified column mapping and signed persistence acknowledgements; an old webhook returning a bare 200 is incompatible. Sheets must never be used to edit catalog prices, products, availability or banners.

## Security checklist

- Terminate HTTPS before production/staging cookies are used.
- Restrict database network access and use least privilege.
- Keep `.env`, uploads and backups outside Git and public document roots.
- Rotate owner credentials and session secret after any suspected exposure.
- Allow only the real staging/production origin in `ADMIN_ALLOWED_ORIGINS`.
- Keep the owner route behind rate limiting and monitor authentication failures.

