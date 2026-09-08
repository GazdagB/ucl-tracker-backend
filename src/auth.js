import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DrawError } from "./groups.js";

const scrypt = promisify(scryptCallback);
export const authSchema = `
  CREATE TABLE IF NOT EXISTS whitelist_emails (email TEXT PRIMARY KEY, added_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);
`;

function email(value) {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(result) || result.length > 254) throw new DrawError("Enter a valid email address.");
  return result;
}

function password(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 200) throw new DrawError("Password must be 12–200 characters.");
  return value;
}

export async function hashPassword(value) {
  password(value);
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(value, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function bootstrapAccount(pool, environment = process.env) {
  const configured = [environment.TOURNAMENT_EMAIL, environment.TOURNAMENT_PASSWORD_HASH, environment.TOURNAMENT_DISPLAY_NAME].some(Boolean);
  if (!configured) return null;
  if (!pool) throw new Error('DATABASE_URL is required when the tournament account is configured.');
  if (!environment.TOURNAMENT_EMAIL || !environment.TOURNAMENT_PASSWORD_HASH) throw new Error('Set both TOURNAMENT_EMAIL and TOURNAMENT_PASSWORD_HASH.');
  const address = email(environment.TOURNAMENT_EMAIL);
  const displayName = environment.TOURNAMENT_DISPLAY_NAME?.trim() || 'Tournament Admin';
  if (displayName.length > 80) throw new Error('TOURNAMENT_DISPLAY_NAME must be no longer than 80 characters.');
  if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(environment.TOURNAMENT_PASSWORD_HASH)) throw new Error('TOURNAMENT_PASSWORD_HASH is not a valid generated scrypt hash.');
  const result = await pool.query(`INSERT INTO users (email, display_name, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name, password_hash=EXCLUDED.password_hash RETURNING id, email, display_name`, [address, displayName, environment.TOURNAMENT_PASSWORD_HASH]);
  return result.rows[0];
}

async function verifyPassword(value, encoded) {
  const [, salt, expected] = String(encoded).split("$");
  if (!salt || !expected) return false;
  const derived = Buffer.from(await scrypt(value, salt, 64));
  const stored = Buffer.from(expected, "hex");
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
function cookie(token, maxAge) { return `ucl_session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
export function sessionToken(request) {
  const header = request?.headers?.get?.('cookie') ?? request?.headers?.cookie ?? request?.get?.('cookie') ?? '';
  return header.match(/(?:^|;\s*)ucl_session=([^;]+)/)?.[1] || null;
}

export async function register(pool, input) {
  const address = email(input?.email); const secret = password(input?.password);
  const displayName = typeof input?.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName || displayName.length > 80) throw new DrawError("Enter a display name up to 80 characters.");
  const allowed = await pool.query("SELECT 1 FROM whitelist_emails WHERE email = $1", [address]);
  if (!allowed.rowCount) throw new DrawError("This email has not been invited to the tournament.", 403);
  const passwordHash = await hashPassword(secret);
  try {
    const result = await pool.query("INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, display_name", [address, displayName, passwordHash]);
    return createSession(pool, result.rows[0]);
  } catch (error) { if (error.code === "23505") throw new DrawError("An account already exists for this email.", 409); throw error; }
}

export async function login(pool, input) {
  const address = email(input?.email); const secret = password(input?.password);
  const result = await pool.query("SELECT id, email, display_name, password_hash FROM users WHERE email = $1", [address]);
  const user = result.rows[0];
  if (!user || !(await verifyPassword(secret, user.password_hash))) throw new DrawError("Email or password is incorrect.", 401);
  return createSession(pool, { id: user.id, email: user.email, display_name: user.display_name });
}

async function createSession(pool, user) {
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [tokenHash(token), user.id]);
  return { user, token, setCookie: cookie(token, 60 * 60 * 24 * 30) };
}

export async function currentUser(pool, request) {
  const token = sessionToken(request); if (!token) return null;
  const result = await pool.query("SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()", [tokenHash(token)]);
  return result.rows[0] || null;
}

export async function logout(pool, request) {
  const token = sessionToken(request); if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
  return { setCookie: cookie("", 0) };
}

export { cookie };
