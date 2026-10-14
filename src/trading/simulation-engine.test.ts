import { describe, expect, it } from "vitest";
import { evaluateSimulatedTradeAtPrice, openSimulatedTrade, TradeValidationError } from "./simulation-engine.js";

const userId = "11111111-1111-4111-8111-111111111111";
const tradeId = "22222222-2222-4222-8222-222222222222";

describe("simulation engine", () => {
  it("opens a validated long spot position without placing an exchange order", () => {
    const trade = openSimulatedTrade({
      id: tradeId, userId, symbol: "btcusdt", quantity: "0.025", entryPrice: "60000",
      stopLossPrice: "58000", takeProfitPrice: "65000", openedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(trade.symbol).toBe("BTCUSDT");
    expect(trade.status).toBe("open");
    expect(trade.trailingStopPrice).toBeNull();
  });

  it("rejects invalid stop-loss and target placement for a long", () => {
    expect(() => openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "1", entryPrice: "100", stopLossPrice: "101" }))
      .toThrowError(TradeValidationError);
    expect(() => openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "1", entryPrice: "100", takeProfitPrice: "99" }))
      .toThrowError(TradeValidationError);
  });

  it("closes at the stop loss and records a deterministic reason", () => {
    const trade = openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "1", entryPrice: "100", stopLossPrice: "95" });
    const result = evaluateSimulatedTradeAtPrice(trade, "94.999", new Date("2026-01-01T01:00:00Z"));
    expect(result.status).toBe("closed");
    if (result.status === "closed") {
      expect(result.reason).toBe("stop_loss");
      expect(result.trade.exitPrice).toBe("94.999");
    }
  });

  it("raises a trailing stop as the market makes a new high and closes on a retracement", () => {
    const trade = openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "1", entryPrice: "100", trailingStopPercent: "10" });
    const high = evaluateSimulatedTradeAtPrice(trade, "120");
    expect(high.status).toBe("open");
    if (high.status === "open") {
      expect(high.trade.highWatermark).toBe("120");
      expect(high.trade.trailingStopPrice).toBe("108");
      const pullback = evaluateSimulatedTradeAtPrice(high.trade, "107.99");
      expect(pullback.status).toBe("closed");
      if (pullback.status === "closed") expect(pullback.reason).toBe("trailing_stop");
    }
  });

  it("does not lower the trailing stop after a pullback", () => {
    const trade = openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "1", entryPrice: "100", trailingStopPercent: "5" });
    const high = evaluateSimulatedTradeAtPrice(trade, "120");
    if (high.status !== "open") throw new Error("expected open trade");
    const pullback = evaluateSimulatedTradeAtPrice(high.trade, "115");
    expect(pullback.status).toBe("open");
    if (pullback.status === "open") expect(pullback.trade.trailingStopPrice).toBe("114");
  });

  it("validates quantities and trailing-stop percentages", () => {
    expect(() => openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "0", entryPrice: "100" }))
      .toThrowError(TradeValidationError);
    expect(() => openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "1", entryPrice: "100", trailingStopPercent: "100" }))
      .toThrowError(TradeValidationError);
  });

  it("does not mutate an already closed position", () => {
    const trade = openSimulatedTrade({ id: tradeId, userId, symbol: "BTCUSDT", quantity: "1", entryPrice: "100", takeProfitPrice: "110" });
    const closed = evaluateSimulatedTradeAtPrice(trade, "110");
    if (closed.status !== "closed") throw new Error("expected closed trade");
    const repeated = evaluateSimulatedTradeAtPrice(closed.trade, "90");
    expect(repeated).toEqual({ status: "closed", trade: closed.trade, reason: "take_profit" });
  });
});
