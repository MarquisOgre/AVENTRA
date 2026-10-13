import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  createPendingUser,
  findUserByTelegramId,
} from "./user-repository.js";

function fakePool(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { pool: { query } as unknown as Pool, query };
}

describe("user repository", () => {
  it("always creates pending non-admin accounts with parameterized values", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const { pool, query } = fakePool([{
      id: "00000000-0000-4000-8000-000000000001",
      display_name: "Trader",
      role: "user",
      status: "pending",
      created_at: createdAt,
    }]);

    const user = await createPendingUser(pool, {
      displayName: " Trader ",
      role: "admin",
      status: "active",
    });

    expect(user).toMatchObject({ displayName: "Trader", role: "user", status: "pending" });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO app_users"),
      ["Trader", "user", "pending"],
    );
  });

  it("rejects invalid Telegram IDs without querying the database", async () => {
    const { pool, query } = fakePool();
    await expect(findUserByTelegramId(pool, "-1")).resolves.toBeNull();
    await expect(findUserByTelegramId(pool, "not-an-id")).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
