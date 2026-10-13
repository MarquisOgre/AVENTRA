import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { bootstrapInitialAdmin } from "./bootstrap-admin.js";

describe("initial administrator bootstrap", () => {
  it("promotes only a registered account when no admin exists", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // no admin
      .mockResolvedValueOnce({ rows: [{ id: "user-id" }] }) // account
      .mockResolvedValueOnce({ rows: [] }) // update
      .mockResolvedValueOnce({ rows: [] }) // audit
      .mockResolvedValueOnce({ rows: [] }); // commit
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

    await expect(bootstrapInitialAdmin(pool, " Admin@Example.com ")).resolves.toEqual({
      status: "promoted",
      userId: "user-id",
    });
    expect(query).toHaveBeenCalledWith(
      "UPDATE app_users SET role = 'admin', status = 'active', updated_at = now() WHERE id = $1",
      ["user-id"],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("initial_admin_bootstrapped"),
      ["user-id"],
    );
  });

  it("refuses to bootstrap if an admin role already exists", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: "existing-admin" }] }) // admin exists
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

    await expect(bootstrapInitialAdmin(pool, "admin@example.com")).resolves.toEqual({
      status: "already_configured",
    });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE app_users"))).toBe(false);
  });

  it("rejects invalid email before opening a connection", async () => {
    const connect = vi.fn();
    const pool = { connect } as unknown as Pool;
    await expect(bootstrapInitialAdmin(pool, "invalid")).rejects.toThrow("valid bootstrap administrator email");
    expect(connect).not.toHaveBeenCalled();
  });
});
