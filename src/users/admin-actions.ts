import type { Pool, PoolClient } from "pg";
import { canAdminister } from "./user.js";

export type AccountAdminActionResult =
  | { status: "updated" }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "last_admin" };

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
    // Serialize admin status changes to prevent concurrent removal of all active admins.
    await client.query("SELECT pg_advisory_xact_lock($1)", [7_311_043]);

    const actorResult = await client.query<{ role: "user" | "admin"; status: "pending" | "active" | "suspended" }>(
      "SELECT role, status FROM app_users WHERE id = $1 FOR UPDATE",
      [input.actorUserId],
    );
    const actor = actorResult.rows[0];
    if (!actor || !canAdminister(actor)) {
      await rollback(client);
      return { status: "forbidden" };
    }

    const targetResult = await client.query<{
      id: string;
      status: "pending" | "active" | "suspended";
      role: "user" | "admin";
    }>(
      "SELECT id, status, role FROM app_users WHERE id = $1 FOR UPDATE",
      [input.targetUserId],
    );
    const target = targetResult.rows[0];
    if (!target) {
      await rollback(client);
      return { status: "not_found" };
    }

    if (input.status === "suspended" && target.role === "admin" && target.status === "active") {
      const otherAdmins = await client.query(
        "SELECT id FROM app_users WHERE role = 'admin' AND status = 'active' AND id <> $1 LIMIT 1",
        [input.targetUserId],
      );
      if (otherAdmins.rows.length === 0) {
        await rollback(client);
        return { status: "last_admin" };
      }
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
