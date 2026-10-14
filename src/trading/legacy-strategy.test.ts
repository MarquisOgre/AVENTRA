import { describe, expect, it } from "vitest";
import { evaluateRebuy, legacyStrategyConfigSchema, updateTrailingStop } from "./legacy-strategy.js";

describe("legacy strategy parity with corrected safety semantics", () => {
  it("validates the legacy buy/target/stop/trailing settings", () => {
    expect(legacyStrategyConfigSchema.safeParse({
      profitTargetPercent: "2.5",
      stopLossEnabled: true,
      stopLossPercent: "1.5",
      maxRebuys: 3,
      rebuyDropPercent: "3",
      quoteAmountPerBuy: "0.0005",
      unfilledOrderTimeoutMinutes: 5,
      trailingStopEnabled: true,
      trailingActivationPercent: "2",
      trailingDistancePercent: "1",
    }).success).toBe(true);
  });

  it("proposes a rebuy only after the configured price drop and within balance", () => {
    expect(evaluateRebuy({
      lastBuyPrice: "100", currentPrice: "97", completedRebuys: 0, maxRebuys: 3,
      dropPercent: "3", quoteAmount: "10", availableQuoteBalance: "20",
    })).toEqual({ shouldBuy: true, reason: "rebuy_threshold_reached", quoteAmount: "10" });
  });

  it("blocks rebuy when limit or available quote balance is reached", () => {
    const base = { lastBuyPrice: "100", currentPrice: "90", completedRebuys: 3, maxRebuys: 3, dropPercent: "3", quoteAmount: "10", availableQuoteBalance: "20" };
    expect(evaluateRebuy(base)).toMatchObject({ shouldBuy: false, reason: "max_rebuys_reached" });
    expect(evaluateRebuy({ ...base, completedRebuys: 0, availableQuoteBalance: "9" })).toMatchObject({ shouldBuy: false, reason: "insufficient_quote_balance" });
  });

  it("preserves tiny price precision in the trailing-stop calculation", () => {
    const update = updateTrailingStop(
      { activated: false, highWatermark: "0.000000000000000010", stopPrice: null },
      "0.000000000000000010",
      "0.000000000000000020",
      "0",
      "10",
    );
    expect(update.state.stopPrice).toBe("0.000000000000000018");
  });

  it("activates trailing stop after threshold and never lowers the stop", () => {
    const initial = { activated: false, highWatermark: "100", stopPrice: null };
    const before = updateTrailingStop(initial, "100", "101.9", "2", "1");
    expect(before.state.activated).toBe(false);
    const active = updateTrailingStop(before.state, "100", "102", "2", "1");
    expect(active.state.activated).toBe(true);
    expect(active.state.stopPrice).toBe("100.98");
    const higher = updateTrailingStop(active.state, "100", "110", "2", "1");
    expect(higher.state.stopPrice).toBe("108.9");
    const pullback = updateTrailingStop(higher.state, "100", "108.8", "2", "1");
    expect(pullback.triggered).toBe(true);
    expect(pullback.state.stopPrice).toBe("108.9");
  });
});
