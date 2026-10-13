import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { setAccountStatusByAdmin } from "./admin-actions.js";

describe("admin account status actions", () => {
  it("denies a non-admin before modifying the target", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ role: "user", status: "active" }] }) // actor
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

    await expect(setAccountStatusByAdmin(pool, {
      actorUserId: "actor-id",
      targetUserId: "target-id",
      status: "active",
    })).resolves.toEqual({ status: "forbidden" });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE app_users"))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not allow an admin to change their own status through this action", async () => {
    const connect = vi.fn();
    const pool = { connect } as unknown as Pool;
    await expect(setAccountStatusByAdmin(pool, {
      actorUserId: "same-id",
      targetUserId: "same-id",
      status: "suspended",
    })).resolves.toEqual({ status: "invalid" });
    expect(connect).not.toHaveBeenCalled();
  });
});
