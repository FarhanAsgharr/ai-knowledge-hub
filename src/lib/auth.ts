import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { cookies } from "next/headers";

import { pool } from "./db";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "kh_session";
const SESSION_DAYS = 30;
const KEY_LENGTH = 64;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  workspaceId: string;
};

/** `salt:hash`, both hex. scrypt is deliberately slow, which is the point. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const derived = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  const expected = Buffer.from(hashHex, "hex");
  // Length check first: timingSafeEqual throws on a mismatch instead of returning false.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a session and sets the cookie. Returns the raw token for tests. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expiresAt],
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Resolves the signed-in user and their workspace, or null. Every data route
 * calls this — there is no ambient "default workspace" any more.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, w.id AS workspace_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN workspaces w ON w.owner_id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > now()
      ORDER BY w.created_at
      LIMIT 1`,
    [hashToken(token)],
  );

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    workspaceId: row.workspace_id,
  };
}

// Functions, not constants: a Response body is single-use, so a shared instance
// would be consumed by the first request and fail for every one after it.
export const unauthorized = () =>
  Response.json({ error: "Sign in to continue." }, { status: 401 });

export const forbidden = () =>
  Response.json({ error: "You don't have access to this." }, { status: 403 });
