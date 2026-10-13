import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "./pool.js";
import { registerAccount, loginAccount, getAccountForSession, revokeSession } from "../auth/service.js";
import { issueTelegramLinkChallenge, consumeTelegramLinkChallenge } from "../users/telegram-linking.js";

const databaseUrl = process.env.DATABASE_URL;
const integrationEnabled = Boolean(databaseUrl);
const pool = integrationEnabled && databaseUrl
  ? createDatabasePool({ connectionString: databaseUrl, maxConnections: 3 })
  : undefined;

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!integrationEnabled)("PostgreSQL authentication integration", () => {
  it("registers, authenticates, links Telegram, and revokes a session", async () => {
    if (!pool) throw new Error("Integration database pool is not configured.");

    const suffix = randomUUID();
    const email = `integration-${suffix}@example.test`;
    const password = "correct horse battery staple";
    let userId: string | undefined;

    try {
      const account = await registerAccount(pool, {
        email,
        password,
        displayName: "Integration User",
      });
      userId = account.id;
      expect(account.status).toBe("pending");
      expect(account.role).toBe("user");

      // The test database is disposable; activate this test account as an admin would.
      await pool.query(
        "UPDATE app_users SET status = 'active' WHERE id = $1",
        [account.id],
      );

      const session = await loginAccount(pool, { email, password });
      expect(session).not.toBeNull();
      if (!session) throw new Error("Expected login to issue a session.");

      await expect(getAccountForSession(pool, session.token)).resolves.toMatchObject({
        id: account.id,
        email,
        status: "active",
      });

      const challenge = await issueTelegramLinkChallenge(pool, account.id);
      const telegramUserId = String(Date.now()) + String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
      await expect(consumeTelegramLinkChallenge(pool, {
        code: challenge.code,
        telegramUserId,
        username: "integration_user",
      })).resolves.toEqual({ status: "linked" });

      await expect(consumeTelegramLinkChallenge(pool, {
        code: challenge.code,
        telegramUserId,
      })).resolves.toEqual({ status: "invalid" });

      await revokeSession(pool, session.token);
      await expect(getAccountForSession(pool, session.token)).resolves.toBeNull();
    } finally {
      if (userId) {
        await pool.query("DELETE FROM app_users WHERE id = $1", [userId]);
      }
    }
  });
});
