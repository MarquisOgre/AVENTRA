import type { Pool } from "pg";
import type { Logger } from "pino";
import { BinanceSpotPublicClient } from "../exchange/binance-public.js";
import { evaluatePersistedSimulatedTrade, listOpenSimulatedTradesForMonitor } from "./repository.js";

export interface SimulationMonitorOptions {
  pool: Pool;
  marketDataClient?: Pick<BinanceSpotPublicClient, "getSpotPrice">;
  logger: Pick<Logger, "info" | "warn" | "error">;
  intervalMs?: number;
}

export interface SimulationMonitorSweepResult {
  positionsSeen: number;
  positionsEvaluated: number;
  positionsClosed: number;
  symbolsFailed: number;
}

/**
 * Evaluates persisted simulation positions against one public quote per symbol.
 * This worker only writes simulated state; it has no exchange order capability.
 */
export async function runSimulationMonitorOnce(
  options: Pick<SimulationMonitorOptions, "pool" | "marketDataClient" | "logger">,
): Promise<SimulationMonitorSweepResult> {
  const client = options.marketDataClient ?? new BinanceSpotPublicClient();
  const trades = await listOpenSimulatedTradesForMonitor(options.pool);
  const result: SimulationMonitorSweepResult = {
    positionsSeen: trades.length,
    positionsEvaluated: 0,
    positionsClosed: 0,
    symbolsFailed: 0,
  };
  const symbols = [...new Set(trades.map((trade) => trade.symbol))];

  for (const symbol of symbols) {
    let quote;
    try {
      quote = await client.getSpotPrice(symbol);
    } catch (error) {
      result.symbolsFailed += 1;
      options.logger.warn(
        { symbol, errorName: error instanceof Error ? error.name : "UnknownError" },
        "Simulation monitor could not retrieve a quote; positions left unchanged",
      );
      continue;
    }

    const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
    for (const trade of symbolTrades) {
      try {
        const updated = await evaluatePersistedSimulatedTrade(
          options.pool,
          trade.userId,
          trade.id,
          quote.price,
          quote.observedAt,
        );
        if (!updated) continue;
        result.positionsEvaluated += 1;
        if (updated.status === "closed") {
          result.positionsClosed += 1;
          options.logger.info(
            { tradeId: updated.id, symbol: updated.symbol, exitReason: updated.exitReason },
            "Simulation position closed by monitor",
          );
        }
      } catch (error) {
        options.logger.error(
          { tradeId: trade.id, symbol, errorName: error instanceof Error ? error.name : "UnknownError" },
          "Simulation position evaluation failed",
        );
      }
    }
  }

  options.logger.info(result, "Simulation monitor sweep completed");
  return result;
}

/** Starts a non-overlapping periodic sweep and returns a stop function for shutdown. */
export function startSimulationMonitor(options: SimulationMonitorOptions): () => void {
  const intervalMs = options.intervalMs ?? 10_000;
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 300_000) {
    throw new Error("Simulation monitor interval must be between 1000 and 300000 milliseconds.");
  }

  let stopped = false;
  let running = false;
  const sweep = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await runSimulationMonitorOnce(options);
    } catch (error) {
      options.logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Simulation monitor sweep failed",
      );
    } finally {
      running = false;
    }
  };

  void sweep();
  const timer = setInterval(() => void sweep(), intervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
