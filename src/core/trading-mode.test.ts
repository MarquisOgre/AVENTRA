import { describe, expect, it } from "vitest";
import { isLiveTradingEnabled, resolveTradingMode } from "./trading-mode.js";

const notApproved = { liveTradingReleaseApproved: false } as const;

describe("trading mode safety policy", () => {
  it("allows simulation by default", () => {
    expect(resolveTradingMode({ mode: "simulation", liveTradingEnabled: false, ...notApproved })).toBe("simulation");
  });

  it("blocks live mode unless the explicit flag is enabled", () => {
    expect(() => resolveTradingMode({ mode: "live", liveTradingEnabled: false, ...notApproved })).toThrow(/release gate has not been approved/);
  });

  it("blocks live mode even if the environment flag is true but release approval is false", () => {
    expect(() => resolveTradingMode({ mode: "live", liveTradingEnabled: true, ...notApproved })).toThrow(/release gate has not been approved/);
  });

  it("does not report live trading enabled in simulation mode", () => {
    expect(isLiveTradingEnabled({ mode: "simulation", liveTradingEnabled: true, ...notApproved })).toBe(false);
  });

  it("reports live trading disabled until code-level release approval exists", () => {
    expect(isLiveTradingEnabled({ mode: "live", liveTradingEnabled: true, ...notApproved })).toBe(false);
  });
});
