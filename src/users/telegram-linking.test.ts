import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { consumeTelegramLinkChallenge, issueTelegramLinkChallenge } from "./telegram-linking.js";

describe("Telegram identity linking", () => {
  it("creates a random one-time code and persists only its hash", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const now = new Date("2026-01-01T00:00:00.000Z");

    const result = await issueTelegramLinkChallenge(pool, "user-id", now);

    expect(result.code).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(result.expiresAt.getTime() - now.getTime()).toBe(10 * 60 * 1000);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO telegram_link_challenges"),
      ["user-id", expect.not.stringMatching(result.code), result.expiresAt],
    );
  });

  it("rejects malformed codes and Telegram IDs before opening a transaction", async () => {
    const connect = vi.fn();
    const pool = { connect } as unknown as Pool;

    await expect(consumeTelegramLinkChallenge(pool, {
      code: "bad",
      telegramUserId: "123",
    })).resolves.toEqual({ status: "invalid" });

    await expect(consumeTelegramLinkChallenge(pool, {
      code: "A".repeat(43),
      telegramUserId: "0",
    })).resolves.toEqual({ status: "invalid" });

    expect(connect).not.toHaveBeenCalled();
  });
});
