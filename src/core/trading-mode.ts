export type TradingMode = "simulation" | "paper" | "live";

export interface TradingSafetyConfig {
  mode: TradingMode;
  liveTradingEnabled: boolean;
  liveTradingReleaseApproved: boolean;
}

/**
 * Resolves the configured mode. Live execution stays blocked until a deliberate
 * code-reviewed release changes the hard-coded approval supplied by the app.
 * An environment variable alone must never unlock real-money trading.
 */
export function resolveTradingMode(config: TradingSafetyConfig): TradingMode {
  if (config.mode === "live" && !isLiveTradingEnabled(config)) {
    throw new Error("Live trading is blocked: the live-trading release gate has not been approved.");
  }

  return config.mode;
}

export function isLiveTradingEnabled(config: TradingSafetyConfig): boolean {
  return config.mode === "live"
    && config.liveTradingEnabled
    && config.liveTradingReleaseApproved;
}
