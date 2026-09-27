import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12) throw new Error("Admin password must contain at least 12 characters");
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, saltText, hashText] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltText, "base64url"), expected.length));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString("base64url"); }
export function tokenHash(token, secret = "") { return crypto.createHash("sha256").update(`${secret}:${token}`).digest("hex"); }

export function cookieOptions(config, maxAge) {
  return { httpOnly: true, sameSite: "strict", secure: config.production, path: "/", maxAge };
}

