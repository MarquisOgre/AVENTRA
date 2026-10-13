import type { Pool } from "pg";

export type BootstrapAdminResult =
  | { status: "promoted"; userId: string }
  | { status: "already_configured" }
  | { status: "account_not_found" };

/**
 * One-time operator-run bootstrap. Refuses to run once any admin role exists.
 * This function must never be exposed through a public HTTP endpoint.
 */
export async function bootstrapInitialAdmin(pool: Pool, emailInput: string): Promise<BootstrapAdminResult> {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("A valid bootstrap administrator email is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [7_311_042]);

    const existingAdmin = await client.query(
      "SELECT id FROM app_users WHERE role = 'admin' LIMIT 1",
    );
    if (existingAdmin.rows.length > 0) {
      await client.query("ROLLBACK");
      return { status: "already_configured" };
    }

    const accountResult = await client.query<{ id: string }>(
      "SELECT u.id FROM app_users AS u INNER JOIN app_credentials AS c ON c.user_id = u.id WHERE c.email = $1 FOR UPDATE OF u",
      [email],
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query("ROLLBACK");
      return { status: "account_not_found" };
    }

    await client.query(
      "UPDATE app_users SET role = 'admin', status = 'active', updated_at = now() WHERE id = $1",
      [account.id],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata)
       VALUES (NULL, 'initial_admin_bootstrapped', 'app_user', $1, '{}'::jsonb)`,
      [account.id],
    );
    await client.query("COMMIT");
    return { status: "promoted", userId: account.id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
