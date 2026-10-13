import { describe, expect, it } from "vitest";
import { isLiveTradingEnabled, resolveTradingMode } from "./trading-mode.js";

describe("trading mode safety policy", () => {
  it("defaults to a non-live mode when configured for simulation", () => {
    expect(resolveTradingMode({ mode: "simulation", liveTradingEnabled: false })).toBe("simulation");
  });

  it("blocks live mode unless the explicit live flag is enabled", () => {
    expect(() => resolveTradingMode({ mode: "live", liveTradingEnabled: false })).toThrow(/Live trading is blocked/);
  });

  it("does not report live trading enabled in simulation mode", () => {
    expect(isLiveTradingEnabled({ mode: "simulation", liveTradingEnabled: true })).toBe(false);
  });

  it("allows the mode policy to resolve live only with the explicit flag", () => {
    expect(resolveTradingMode({ mode: "live", liveTradingEnabled: true })).toBe("live");
  });
});
