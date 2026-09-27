import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const uploadRoot = path.resolve(env.MELYNE_UPLOAD_ROOT || path.join(projectRoot, "var", "uploads"));
  const backupRoot = path.resolve(env.MELYNE_UPLOAD_BACKUP_ROOT || path.join(projectRoot, "var", "backups"));
  const allowedOrigins = (env.ADMIN_ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4173,http://localhost:8788")
    .split(",").map((value) => value.trim()).filter(Boolean);

  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (production && (!env.MELYNE_SESSION_SECRET || env.MELYNE_SESSION_SECRET.length < 32)) {
    throw new Error("MELYNE_SESSION_SECRET must contain at least 32 characters in production");
  }
  if (production && !env.ADMIN_ALLOWED_ORIGINS) {
    throw new Error("ADMIN_ALLOWED_ORIGINS must be explicitly configured in production");
  }
  if (env.GOOGLE_SHEETS_WEBHOOK_URL && !env.GOOGLE_SHEETS_WEBHOOK_SECRET) {
    throw new Error("GOOGLE_SHEETS_WEBHOOK_SECRET is required when Google Sheet synchronization is enabled");
  }

  return {
    projectRoot,
    databaseUrl: env.DATABASE_URL,
    port: Number(env.PORT || 8788),
    production,
    sessionSecret: env.MELYNE_SESSION_SECRET || "development-only-secret-change-before-staging",
    uploadRoot,
    backupRoot,
    publicBaseUrl: (env.PUBLIC_BASE_URL || "http://localhost:8788").replace(/\/$/, ""),
    allowedOrigins,
    googleSheetsWebhookUrl: env.GOOGLE_SHEETS_WEBHOOK_URL || null,
    googleSheetsWebhookSecret: env.GOOGLE_SHEETS_WEBHOOK_SECRET || null,
  };
}

