import type { Pool, PoolClient } from "pg";
import { canAdminister } from "./user.js";

export type AccountAdminActionResult =
  | { status: "updated" }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "invalid" };

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

/** Activate or suspend an account, requiring an active admin and auditing the change. */
export async function setAccountStatusByAdmin(
  pool: Pool,
  input: { actorUserId: string; targetUserId: string; status: "active" | "suspended" },
): Promise<AccountAdminActionResult> {
  if (input.actorUserId === input.targetUserId) return { status: "invalid" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const actorResult = await client.query<{ role: "user" | "admin"; status: "pending" | "active" | "suspended" }>(
      "SELECT role, status FROM app_users WHERE id = $1 FOR UPDATE",
      [input.actorUserId],
    );
    const actor = actorResult.rows[0];
    if (!actor || !canAdminister(actor)) {
      await rollback(client);
      return { status: "forbidden" };
    }

    const targetResult = await client.query<{ id: string; status: string }>(
      "SELECT id, status FROM app_users WHERE id = $1 FOR UPDATE",
      [input.targetUserId],
    );
    if (!targetResult.rows[0]) {
      await rollback(client);
      return { status: "not_found" };
    }

    await client.query(
      "UPDATE app_users SET status = $2, updated_at = now() WHERE id = $1",
      [input.targetUserId, input.status],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata)
       VALUES ($1, 'account_status_changed', 'app_user', $2, $3::jsonb)`,
      [input.actorUserId, input.targetUserId, JSON.stringify({ status: input.status })],
    );
    await client.query("COMMIT");
    return { status: "updated" };
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
}
