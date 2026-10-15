import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { addDecimalStrings, compareDecimalStrings, multiplyDecimalStrings, normalizeDecimalString } from "./decimal.js";
import { evaluateSimulatedTradeAtPrice, type SimulatedTrade } from "./simulation-engine.js";

export interface SimulationTradeLimits {
  maxOpenTrades: number;
  maxExposure: string;
  idempotencyKey?: string;
}

export class SimulationRiskLimitError extends Error {
  constructor(public readonly code: "max_open_trades" | "max_exposure") {
    super(code);
    this.name = "SimulationRiskLimitError";
  }
}

export class SimulationIdempotencyConflictError extends Error {
  constructor() {
    super("idempotency_key_reused");
    this.name = "SimulationIdempotencyConflictError";
  }
}

function requestFingerprint(trade: SimulatedTrade): string {
  // Entry price is excluded so a retry after a quote changes remains the same request.
  return createHash("sha256").update(JSON.stringify({
    userId: trade.userId,
    symbol: trade.symbol,
    quantity: trade.quantity,
    stopLossPrice: trade.stopLossPrice,
    takeProfitPrice: trade.takeProfitPrice,
    trailingStopPercent: trade.trailingStopPercent,
  })).digest("hex");
}

type TradeRow = {
  id: string;
  user_id: string;
  symbol: string;
  side: "long";
  quantity: string;
  entry_price: string;
  stop_loss_price: string | null;
  take_profit_price: string | null;
  trailing_stop_percent: string | null;
  high_watermark: string;
  trailing_stop_price: string | null;
  status: "open" | "closed" | "cancelled";
  exit_price: string | null;
  exit_reason: string | null;
  opened_at: Date | string;
  closed_at: Date | string | null;
};

function toTrade(row: TradeRow): SimulatedTrade | null {
  if (row.status === "cancelled") return null;
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: "long",
    quantity: normalizeDecimalString(row.quantity),
    entryPrice: normalizeDecimalString(row.entry_price),
    stopLossPrice: row.stop_loss_price === null ? null : normalizeDecimalString(row.stop_loss_price),
    takeProfitPrice: row.take_profit_price === null ? null : normalizeDecimalString(row.take_profit_price),
    trailingStopPercent: row.trailing_stop_percent === null ? null : normalizeDecimalString(row.trailing_stop_percent),
    highWatermark: normalizeDecimalString(row.high_watermark),
    trailingStopPrice: row.trailing_stop_price === null ? null : normalizeDecimalString(row.trailing_stop_price),
    status: row.status,
    exitPrice: row.exit_price === null ? null : normalizeDecimalString(row.exit_price),
    exitReason: row.exit_reason as SimulatedTrade["exitReason"],
    openedAt: new Date(row.opened_at).toISOString(),
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
  };
}

/** Persists a validated simulation position and its opening event atomically. */
export async function createSimulatedTrade(pool: Pool, trade: SimulatedTrade, limits?: SimulationTradeLimits): Promise<SimulatedTrade> {
  if (trade.status !== "open" || trade.exitPrice !== null || trade.closedAt !== null) {
    throw new Error("Only a newly opened simulated trade can be inserted.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (limits) {
      // Serialize this user's idempotency + limit check + insert to prevent concurrent bypasses.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [trade.userId]);
      if (limits.idempotencyKey !== undefined) {
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(limits.idempotencyKey)) {
          throw new Error("Invalid simulation idempotency key.");
        }
        const existingResult = await client.query<TradeRow & { request_fingerprint: string }>(
          `SELECT id, user_id, symbol, side, quantity::text, entry_price::text,
             stop_loss_price::text, take_profit_price::text, trailing_stop_percent::text,
             high_watermark::text, trailing_stop_price::text, status, exit_price::text,
             exit_reason, opened_at, closed_at, request_fingerprint
           FROM simulated_trades WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [trade.userId, limits.idempotencyKey],
        );
        const existing = existingResult.rows[0];
        if (existing) {
          if (existing.request_fingerprint !== requestFingerprint(trade)) {
            throw new SimulationIdempotencyConflictError();
          }
          const mapped = toTrade(existing);
          if (!mapped) throw new Error("Idempotent simulation trade is not available.");
          await client.query("COMMIT");
          return mapped;
        }
      }
      const totals = await client.query<{ open_count: number; exposure: string }>(
        `SELECT COUNT(*)::int AS open_count,
           COALESCE(SUM(entry_price * quantity), 0)::numeric(38,18)::text AS exposure
         FROM simulated_trades WHERE user_id = $1 AND status = 'open'`,
        [trade.userId],
      );
      const current = totals.rows[0];
      if (!current) throw new Error("Unable to read simulation risk totals.");
      if (current.open_count >= limits.maxOpenTrades) throw new SimulationRiskLimitError("max_open_trades");
      const projectedExposure = addDecimalStrings(current.exposure, multiplyDecimalStrings(trade.entryPrice, trade.quantity));
      if (compareDecimalStrings(projectedExposure, limits.maxExposure) > 0) {
        throw new SimulationRiskLimitError("max_exposure");
      }
    }
    const inserted = await client.query<TradeRow>(
      `INSERT INTO simulated_trades
        (id, user_id, symbol, side, quantity, entry_price, stop_loss_price, take_profit_price,
         trailing_stop_percent, high_watermark, trailing_stop_price, status, opened_at,
         idempotency_key, request_fingerprint)
       VALUES ($1, $2, $3, 'long', $4, $5, $6, $7, $8, $9, $10, 'open', $11, $12, $13)
       RETURNING id, user_id, symbol, side, quantity::text, entry_price::text,
         stop_loss_price::text, take_profit_price::text, trailing_stop_percent::text,
         high_watermark::text, trailing_stop_price::text, status, exit_price::text,
         exit_reason, opened_at, closed_at`,
      [
        trade.id, trade.userId, trade.symbol, trade.quantity, trade.entryPrice,
        trade.stopLossPrice, trade.takeProfitPrice, trade.trailingStopPercent,
        trade.highWatermark, trade.trailingStopPrice, trade.openedAt,
        limits?.idempotencyKey ?? null, requestFingerprint(trade),
      ],
    );
    await client.query(
      `INSERT INTO simulated_trade_events (trade_id, user_id, event_type, observed_price, details)
       VALUES ($1, $2, 'opened', $3, $4::jsonb)`,
      [trade.id, trade.userId, trade.entryPrice, JSON.stringify({ quantity: trade.quantity, mode: "simulation" })],
    );
    await client.query("COMMIT");
    const saved = inserted.rows[0];
    if (!saved) throw new Error("Simulation trade insert returned no row.");
    const mapped = toTrade(saved);
    if (!mapped) throw new Error("New simulation trade unexpectedly cancelled.");
    return mapped;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Lists only the requesting user's simulation trades. */
export async function listSimulatedTrades(
  pool: Pool,
  userId: string,
  status: "open" | "closed" | null = null,
): Promise<SimulatedTrade[]> {
  const result = await pool.query<TradeRow>(
    `SELECT id, user_id, symbol, side, quantity::text, entry_price::text,
       stop_loss_price::text, take_profit_price::text, trailing_stop_percent::text,
       high_watermark::text, trailing_stop_price::text, status, exit_price::text,
       exit_reason, opened_at, closed_at
     FROM simulated_trades
     WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)
     ORDER BY opened_at DESC, id DESC
     LIMIT 200`,
    [userId, status],
  );
  return result.rows.map(toTrade).filter((trade): trade is SimulatedTrade => trade !== null);
}

/**
 * Applies a server-observed price under a row lock. The user ID is part of the
 * lookup, so a caller cannot evaluate or modify another user's position.
 */
export async function evaluatePersistedSimulatedTrade(
  pool: Pool,
  userId: string,
  tradeId: string,
  price: string,
  observedAt = new Date(),
): Promise<SimulatedTrade | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<TradeRow>(
      `SELECT id, user_id, symbol, side, quantity::text, entry_price::text,
         stop_loss_price::text, take_profit_price::text, trailing_stop_percent::text,
         high_watermark::text, trailing_stop_price::text, status, exit_price::text,
         exit_reason, opened_at, closed_at
       FROM simulated_trades WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [tradeId, userId],
    );
    const row = selected.rows[0];
    if (!row) {
      await client.query("COMMIT");
      return null;
    }
    const trade = toTrade(row);
    if (!trade) {
      await client.query("COMMIT");
      return null;
    }
    if (trade.status === "closed") {
      await client.query("COMMIT");
      return trade;
    }

    const evaluation = evaluateSimulatedTradeAtPrice(trade, price, observedAt);
    const updated = evaluation.trade;
    await client.query(
      `UPDATE simulated_trades SET
         high_watermark = $3, trailing_stop_price = $4, status = $5,
         exit_price = $6, exit_reason = $7, closed_at = $8, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'open'`,
      [
        tradeId, userId, updated.highWatermark, updated.trailingStopPrice,
        updated.status, updated.exitPrice, updated.exitReason, updated.closedAt,
      ],
    );

    const eventType = evaluation.status === "closed"
      ? "closed"
      : evaluation.changed
        ? "stop_updated"
        : "price_observed";
    const details = evaluation.status === "closed"
      ? { reason: evaluation.reason, highWatermark: updated.highWatermark, trailingStopPrice: updated.trailingStopPrice }
      : { highWatermark: updated.highWatermark, trailingStopPrice: updated.trailingStopPrice };
    await client.query(
      `INSERT INTO simulated_trade_events (trade_id, user_id, event_type, observed_price, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [tradeId, userId, eventType, price, JSON.stringify(details)],
    );
    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


/** Internal worker query: open positions across users; never expose this through user-facing APIs. */
export async function listOpenSimulatedTradesForMonitor(pool: Pool): Promise<SimulatedTrade[]> {
  const result = await pool.query<TradeRow>(
    `SELECT id, user_id, symbol, side, quantity::text, entry_price::text,
       stop_loss_price::text, take_profit_price::text, trailing_stop_percent::text,
       high_watermark::text, trailing_stop_price::text, status, exit_price::text,
       exit_reason, opened_at, closed_at
     FROM simulated_trades
     WHERE status = 'open'
     ORDER BY symbol ASC, opened_at ASC, id ASC`,
  );
  return result.rows.map(toTrade).filter((trade): trade is SimulatedTrade => trade !== null);
}
