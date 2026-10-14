import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "../db/pool.js";
import { createSimulatedTrade, evaluatePersistedSimulatedTrade, listSimulatedTrades } from "./repository.js";
import { openSimulatedTrade } from "./simulation-engine.js";

const databaseUrl = process.env.DATABASE_URL;
const integrationEnabled = Boolean(databaseUrl);
const pool = integrationEnabled && databaseUrl
  ? createDatabasePool({ connectionString: databaseUrl, maxConnections: 3 })
  : undefined;

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!integrationEnabled)("PostgreSQL simulation-trade repository", () => {
  it("persists positions and events transactionally and scopes reads/evaluations to the owner", async () => {
    if (!pool) throw new Error("Integration database pool is not configured.");
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const tradeId = randomUUID();
    try {
      await pool.query(
        "INSERT INTO app_users (id, display_name, status) VALUES ($1, 'Simulation Owner', 'active'), ($2, 'Other Owner', 'active')",
        [userId, otherUserId],
      );
      const trade = openSimulatedTrade({
        id: tradeId,
        userId,
        symbol: "BTCUSDT",
        quantity: "0.01",
        entryPrice: "100",
        stopLossPrice: "95",
        takeProfitPrice: "110",
      });
      await expect(createSimulatedTrade(pool, trade)).resolves.toMatchObject({
        id: tradeId, userId, symbol: "BTCUSDT", status: "open",
      });
      await expect(listSimulatedTrades(pool, userId, "open")).resolves.toHaveLength(1);
      await expect(listSimulatedTrades(pool, otherUserId)).resolves.toHaveLength(0);
      await expect(evaluatePersistedSimulatedTrade(pool, otherUserId, tradeId, "94")).resolves.toBeNull();

      await expect(evaluatePersistedSimulatedTrade(pool, userId, tradeId, "94")).resolves.toMatchObject({
        status: "closed", exitPrice: "94", exitReason: "stop_loss",
      });
      await expect(listSimulatedTrades(pool, userId, "open")).resolves.toHaveLength(0);
      await expect(listSimulatedTrades(pool, userId, "closed")).resolves.toMatchObject([
        { id: tradeId, status: "closed", exitReason: "stop_loss" },
      ]);
      const events = await pool.query(
        "SELECT event_type FROM simulated_trade_events WHERE trade_id = $1 ORDER BY id",
        [tradeId],
      );
      expect(events.rows.map((row) => row.event_type)).toEqual(["opened", "closed"]);
    } finally {
      await pool?.query("DELETE FROM app_users WHERE id = ANY($1::uuid[])", [[userId, otherUserId]]);
    }
  });
});
