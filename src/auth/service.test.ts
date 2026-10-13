import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { getAccountForSession, loginAccount, revokeSession } from "./service.js";

describe("account session service", () => {
  it("rejects malformed session tokens without querying the database", async () => {
    const query = vi.fn();
    const pool = { query } as unknown as Pool;
    await expect(getAccountForSession(pool, "not-a-token")).resolves.toBeNull();
    await revokeSession(pool, "not-a-token");
    expect(query).not.toHaveBeenCalled();
  });

  it("does not issue a session for an unknown account", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    await expect(loginAccount(pool, {
      email: "nobody@example.com",
      password: "long-enough-password",
    })).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("rolls account registration back on duplicate email", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "user-id", display_name: "User", status: "pending" }] })
      .mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }))
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

    const { registerAccount } = await import("./service.js");
    await expect(registerAccount(pool, {
      email: "duplicate@example.com",
      password: "long-enough-password",
      displayName: "User",
    })).rejects.toThrow("Unable to create account");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
});
