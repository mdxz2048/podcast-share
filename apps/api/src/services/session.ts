import { pool } from "../db/pool.js";
import { env } from "../config.js";
import { createOpaqueToken, hashOpaqueToken } from "../utils/security.js";

export async function createSession(userId: string): Promise<string> {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `insert into user_sessions (id, user_id, token_hash, expires_at, created_at)
     values (gen_random_uuid(), $1, $2, $3, now())`,
    [userId, tokenHash, expiresAt]
  );

  return token;
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashOpaqueToken(token);
  await pool.query("delete from user_sessions where token_hash = $1", [tokenHash]);
}

export async function findSession(token: string) {
  const tokenHash = hashOpaqueToken(token);
  const result = await pool.query(
    `select s.user_id, s.expires_at, u.email, u.email_verified_at
     from user_sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1`,
    [tokenHash]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query("delete from user_sessions where token_hash = $1", [tokenHash]);
    return null;
  }

  return row;
}
