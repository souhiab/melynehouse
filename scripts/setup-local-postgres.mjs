import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; run npm run local:env first");
const root = path.resolve(import.meta.dirname, "..");
const superPassword = (await fs.readFile(path.join(root, "var", "local-secrets", "postgres-superuser-password.txt"), "utf8")).trim();
const target = new URL(process.env.DATABASE_URL);
const databaseName = decodeURIComponent(target.pathname.slice(1));
if (databaseName !== "melyne_dev" || decodeURIComponent(target.username) !== "melyne_app") throw new Error("Refusing to create an unexpected database or role");

const client = new pg.Client({
  host: target.hostname,
  port: Number(target.port || 5432),
  user: "postgres",
  password: superPassword,
  database: "postgres",
});

await client.connect();
try {
  const appPassword = decodeURIComponent(target.password);
  await client.query("SELECT set_config('melyne.app_password',$1,false)", [appPassword]);
  await client.query(`DO $do$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='melyne_app') THEN
        EXECUTE format('ALTER ROLE melyne_app LOGIN PASSWORD %L',current_setting('melyne.app_password'));
      ELSE
        EXECUTE format('CREATE ROLE melyne_app LOGIN PASSWORD %L',current_setting('melyne.app_password'));
      END IF;
    END
  $do$`);
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [databaseName]);
  if (!exists.rowCount) await client.query("CREATE DATABASE melyne_dev OWNER melyne_app ENCODING 'UTF8' TEMPLATE template0");
  else await client.query("ALTER DATABASE melyne_dev OWNER TO melyne_app");
  await client.query("REVOKE ALL ON DATABASE melyne_dev FROM PUBLIC");
  await client.query("GRANT CONNECT,TEMPORARY ON DATABASE melyne_dev TO melyne_app");
  await client.query("ALTER DATABASE melyne_dev SET timezone TO 'Africa/Casablanca'");
  console.log(`Local PostgreSQL database ${databaseName} and least-privilege role melyne_app are ready on ${target.hostname}:${target.port || 5432}.`);
} finally {
  await client.end();
}
