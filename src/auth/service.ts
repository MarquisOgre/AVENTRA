import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { hashPassword, verifyPassword } from "./password.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "scrypt$16384$8$1$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export interface AuthenticatedAccount {
  id: string;
  email: string;
  displayName: string;
  status: "pending" | "active" | "suspended";
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  account: AuthenticatedAccount;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function toAccount(row: {
  id: string;
  email: string;
  display_name: string;
  status: AuthenticatedAccount["status"];
}): AuthenticatedAccount {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
  };
}

export async function registerAccount(
  pool: Pool,
  input: { email: string; password: string; displayName: string },
): Promise<AuthenticatedAccount> {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Invalid email or password.");
  }
  if (input.displayName.trim().length < 1 || input.displayName.trim().length > 80) {
    throw new Error("Invalid email or password.");
  }

  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: string; display_name: string; status: AuthenticatedAccount["status"] }>(
      `INSERT INTO app_users (display_name, role, status)
       VALUES ($1, 'user', 'pending')
       RETURNING id, display_name, status`,
      [input.displayName.trim()],
    );
    const row = created.rows[0];
    if (!row) throw new Error("Account creation failed.");

    await client.query(
      "INSERT INTO app_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)",
      [row.id, email, passwordHash],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata)
       VALUES ($1, 'account_registered', 'app_user', $1, '{}'::jsonb)`,
      [row.id],
    );
    await client.query("COMMIT");
    return { id: row.id, email, displayName: row.display_name, status: row.status };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as { code?: unknown }).code === "23505") {
      throw new Error("Unable to create account with these details.");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function loginAccount(
  pool: Pool,
  input: { email: string; password: string },
  now = new Date(),
): Promise<IssuedSession | null> {
  const email = normalizeEmail(input.email);
  const result = await pool.query<{
    id: string;
    email: string;
    display_name: string;
    status: AuthenticatedAccount["status"];
    password_hash: string;
  }>(
    `SELECT u.id, c.email, u.display_name, u.status, c.password_hash
     FROM app_credentials AS c
     INNER JOIN app_users AS u ON u.id = c.user_id
     WHERE c.email = $1
     LIMIT 1`,
    [email],
  );

  const row = result.rows[0];
  const passwordMatches = await verifyPassword(input.password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!row || !passwordMatches || row.status === "suspended") return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await pool.query(
    "INSERT INTO web_sessions (user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)",
    [row.id, hashToken(token), expiresAt, now],
  );

  return { token, expiresAt, account: toAccount(row) };
}

export async function getAccountForSession(
  pool: Pool,
  token: string,
  now = new Date(),
): Promise<AuthenticatedAccount | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const result = await pool.query<{
    id: string;
    email: string;
    display_name: string;
    status: AuthenticatedAccount["status"];
  }>(
    `SELECT u.id, c.email, u.display_name, u.status
     FROM web_sessions AS s
     INNER JOIN app_users AS u ON u.id = s.user_id
     INNER JOIN app_credentials AS c ON c.user_id = u.id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > $2
       AND u.status <> 'suspended'
     LIMIT 1`,
    [hashToken(token), now],
  );
  const row = result.rows[0];
  return row ? toAccount(row) : null;
}

export async function revokeSession(pool: Pool, token: string, now = new Date()): Promise<void> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return;
  await pool.query(
    "UPDATE web_sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashToken(token), now],
  );
}
