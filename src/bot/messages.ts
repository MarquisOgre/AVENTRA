import type { TradingMode } from "../core/trading-mode.js";

export function buildHelpMessage(): string {
  return [
    "AVENTRA — Intelligent Crypto Trading",
    "",
    "Available commands:",
    "/start — Start the bot",
    "/help — Show commands",
    "/status — Show platform status",
    "",
    "Trading execution is not available yet. Never send exchange API keys or secrets in Telegram chat.",
  ].join("\n");
}

export function buildStatusMessage(mode: TradingMode): string {
  return [
    "AVENTRA platform status",
    `Configured mode: ${mode}`,
    "Live trading: disabled",
    "Exchange connection: not configured",
    "Order execution: not implemented",
  ].join("\n");
}
