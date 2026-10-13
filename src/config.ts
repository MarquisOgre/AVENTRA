import { z } from "zod";
import { resolveTradingMode } from "./core/trading-mode.js";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().min(1).default("AVENTRA"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  DATABASE_URL: z.string().default(""),
  TRADING_MODE: z.enum(["simulation", "paper", "live"]).default("simulation"),
  LIVE_TRADING_ENABLED: z.enum(["true", "false"]).default("false"),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const tradingMode = resolveTradingMode({
  mode: parsed.data.TRADING_MODE,
  liveTradingEnabled: parsed.data.LIVE_TRADING_ENABLED === "true",
});

export const appConfig = {
  nodeEnv: parsed.data.NODE_ENV,
  appName: parsed.data.APP_NAME,
  logLevel: parsed.data.LOG_LEVEL,
  host: parsed.data.HOST,
  port: parsed.data.PORT,
  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  databaseUrl: parsed.data.DATABASE_URL,
  tradingMode,
  liveTradingEnabled: parsed.data.LIVE_TRADING_ENABLED === "true",
} as const;
