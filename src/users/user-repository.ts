import type { Pool } from "pg";
import { createUserSchema, type CreateUserInput, type User } from "./user.js";

interface UserRow {
  id: string;
  display_name: string;
  role: User["role"];
  status: User["status"];
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Creates a pending account; activation is a separate, audited admin action. */
export async function createPendingUser(pool: Pool, input: CreateUserInput): Promise<User> {
  const validated = createUserSchema.parse({
    ...input,
    role: "user",
    status: "pending",
  });

  const result = await pool.query<UserRow>(
    `INSERT INTO app_users (display_name, role, status)
     VALUES ($1, $2, $3)
     RETURNING id, display_name, role, status, created_at`,
    [validated.displayName, validated.role, validated.status],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Database did not return the created user.");
  }

  return toUser(row);
}

export async function findUserById(pool: Pool, userId: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, display_name, role, status, created_at
     FROM app_users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  return row ? toUser(row) : null;
}

/** Lookup only; this function does not link or authenticate a Telegram identity. */
export async function findUserByTelegramId(
  pool: Pool,
  telegramUserId: string,
): Promise<User | null> {
  if (!/^[1-9]\d{0,19}$/.test(telegramUserId)) {
    return null;
  }

  const result = await pool.query<UserRow>(
    `SELECT u.id, u.display_name, u.role, u.status, u.created_at
     FROM app_users AS u
     INNER JOIN telegram_identities AS t ON t.user_id = u.id
     WHERE t.telegram_user_id = $1
     LIMIT 1`,
    [telegramUserId],
  );

  const row = result.rows[0];
  return row ? toUser(row) : null;
}
