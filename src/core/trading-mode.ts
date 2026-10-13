export type TradingMode = "simulation" | "paper" | "live";

export interface TradingSafetyConfig {
  mode: TradingMode;
  liveTradingEnabled: boolean;
}

/**
 * Resolves the configured mode without allowing live execution by accident.
 * This is a safety policy only; it does not implement exchange execution.
 */
export function resolveTradingMode(config: TradingSafetyConfig): TradingMode {
  if (config.mode === "live" && !config.liveTradingEnabled) {
    throw new Error("Live trading is blocked: LIVE_TRADING_ENABLED must be explicitly true.");
  }

  return config.mode;
}

export function isLiveTradingEnabled(config: TradingSafetyConfig): boolean {
  return config.mode === "live" && config.liveTradingEnabled;
}
