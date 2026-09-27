import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const secretsRoot = path.join(root, "var", "local-secrets");
const force = process.argv.includes("--force");

try {
  if (!force) {
    await fs.access(envPath);
    throw new Error(".env already exists; use --force only when intentionally rotating every local credential");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const random = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const appPassword = random();
const postgresPassword = random();
const adminPassword = `MelyneLocal-${random(18)}`;
const sessionSecret = random(48);
const normalized = (value) => value.replaceAll("\\", "/");
const databaseUrl = `postgresql://melyne_app:${encodeURIComponent(appPassword)}@127.0.0.1:5432/melyne_dev`;

const env = [
  `DATABASE_URL=${databaseUrl}`,
  "MELYNE_ADMIN_EMAIL=owner@local.melyne",
  `MELYNE_ADMIN_PASSWORD=${adminPassword}`,
  `MELYNE_SESSION_SECRET=${sessionSecret}`,
  `MELYNE_UPLOAD_ROOT=${normalized(path.join(root, "var", "uploads"))}`,
  `MELYNE_UPLOAD_BACKUP_ROOT=${normalized(path.join(root, "var", "backups"))}`,
  "PUBLIC_BASE_URL=http://127.0.0.1:8788",
  "ADMIN_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,http://127.0.0.1:8788",
  "PORT=8788",
  "NODE_ENV=development",
  "GOOGLE_SHEETS_WEBHOOK_URL=",
  "GOOGLE_SHEETS_WEBHOOK_SECRET=",
  "",
].join("\n");

await fs.mkdir(secretsRoot, { recursive: true });
await fs.writeFile(envPath, env, { encoding: "utf8", mode: 0o600, flag: force ? "w" : "wx" });
await fs.writeFile(path.join(secretsRoot, "postgres-superuser-password.txt"), `${postgresPassword}\n`, { encoding: "utf8", mode: 0o600 });
await fs.writeFile(path.join(secretsRoot, "postgres-app-password.txt"), `${appPassword}\n`, { encoding: "utf8", mode: 0o600 });
await fs.writeFile(path.join(secretsRoot, "owner-login.txt"), `URL: http://localhost:5173/owner\nEmail: owner@local.melyne\nPassword: ${adminPassword}\n`, { encoding: "utf8", mode: 0o600 });
console.log("Created local-only .env and credentials under var/local-secrets (contents not printed).");
